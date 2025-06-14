/* ──────────────────────────────────────────────────────────
   event/[id].js – voice‑driven edit wizard + back navigation
   ────────────────────────────────────────────────────────── */
import { useEffect, useState, useRef, useCallback } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import * as FileSystem from "expo-file-system";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import * as Speech from "expo-speech";
import { parse as chronoParse } from "chrono-node";

/* ---------- persistence ---------- */
const PATH = FileSystem.documentDirectory + "calendar/events.json";
const load = async () => JSON.parse(await FileSystem.readAsStringAsync(PATH));
const save = async (list) =>
  FileSystem.writeAsStringAsync(PATH, JSON.stringify(list, null, 2));

/* ---------- helpers ---------- */
function speak(txt) {
  return new Promise((res) =>
    Speech.speak(txt, {
      language: "en-US",
      onDone: res,
      onStopped: res,
      onError: res,
    })
  );
}
function minutesFromText(t) {
  const x = parseFloat(t);
  if (Number.isFinite(x)) {
    if (t.includes("hour")) return Math.round(x * 60);
    if (t.includes("minute")) return Math.round(x);
  }
  if (/half\s+an?\s+hour/.test(t)) return 30;
  return null;
}
/* convert “1030”, “10 30” → “10:30” so TTS says “ten thirty” */
function normalizeTimeForSpeech(t) {
  const digits = t.replace(/[^\d]/g, "");
  if (digits.length === 3) return `${digits[0]}:${digits.slice(1)}`;
  if (digits.length === 4) return `${digits.slice(0, 2)}:${digits.slice(2)}`;
  return t.replace(/\s+/, ":");
}

/* ---------- constants ---------- */
const fieldKeys = ["title", "date", "time", "duration", "description"];
const prompts = [
  "Please say the event title.",
  "Now say the event date.",
  "Now say the event start time.",
  "How long is the event?",
  "Finally, describe the event.",
];
const SILENCE_MS = 1500;

/* ---------- component ---------- */
export default function EventDetails() {
  const { id } = useLocalSearchParams();
  const router = useRouter();

  /* event record */
  const [event, setEvent] = useState(null);

  /* wizard state */
  const [editing, setEditing] = useState(false);
  const [step, setStep]       = useState(0);   // 0‑4 fields, 5 confirm
  const [draft, setDraft]     = useState(null);

  /* live UI */
  const [live, setLive]       = useState("");
  const [listening, setListening] = useState(false);

  /* refs */
  const bufRef     = useRef("");
  const tmrRef     = useRef(null);
  const ttsRef     = useRef(false);
  const recogOK    = useRef(false);
  const gate       = useRef(false);
  const aliveRef   = useRef(true);

  /* ---------- micro helpers ---------- */
  const stopRecog = useCallback(() => {
    clearTimeout(tmrRef.current);
    try { ExpoSpeechRecognitionModule.stop(); } catch {}
    setListening(false);
  }, []);

  const startRecog = useCallback(() => {
    recogOK.current = false;
    ExpoSpeechRecognitionModule.start({
      lang: "en-US",
      interimResults: true,
      continuous: true,
    });
    setListening(true);
  }, []);

  /* ---------- load event once ---------- */
  useEffect(() => {
    (async () => {
      try {
        const list = await load();
        setEvent(list.find((e) => String(e.id) === String(id)));
      } catch {}
    })();
  }, [id]);

  /* ---------- recogniser lifecycle ---------- */
  useEffect(() => {
    (async () => {
      const p = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (p.granted) startRecog();
    })();
    return () => { aliveRef.current = false; stopRecog(); };
  }, [startRecog, stopRecog]);

  useSpeechRecognitionEvent("start", () => { recogOK.current = true; });
  useSpeechRecognitionEvent("end",   () => { recogOK.current = false; setListening(false); });

  /* ---------- global voice shortcuts ---------- */
  useSpeechRecognitionEvent("result", (evt) => {
    if (editing) return;
    const spoken = (evt.results?.[0]?.transcript ?? evt.value ?? "").trim();
    if (/\bcalendar\b/i.test(spoken)) router.back();
    if (/\bedit\b/i.test(spoken) && /\bevent\b/i.test(spoken)) beginEdit();
  });

  /* ---------- wizard driver ---------- */
  useEffect(() => {
    if (!editing || step > 5) return;
    let cancelled = false;

    (async () => {
      /* step 0‑4 – ask question */
      if (step <= 4) {
        stopRecog();
        await speak(prompts[step]);
        if (cancelled || !aliveRef.current) return;

        startRecog();
        while (!recogOK.current && !cancelled && aliveRef.current) {
          await new Promise((r) => setTimeout(r, 50));
        }
        if (cancelled || !aliveRef.current) return;
        gate.current = true;
        return;
      }

      /* step 5 – confirmation */
      if (step === 5) {
        stopRecog();
        const minsTxt = minutesFromText(draft.duration) ?? draft.duration;
        const summary =
          `You said: Title ${draft.title}. Date ${draft.date}. `
        + `Time ${normalizeTimeForSpeech(draft.time)}. `
        + `Duration ${draft.duration} (${minsTxt} minutes). `
        + `Description ${draft.description}. Is that correct?`;
        await speak(summary);
        if (cancelled || !aliveRef.current) return;

        startRecog();
        while (!recogOK.current && !cancelled && aliveRef.current) {
          await new Promise((r) => setTimeout(r, 50));
        }
        if (cancelled || !aliveRef.current) return;
        gate.current = true;
      }
    })();

    return () => { cancelled = true; };
  }, [editing, step, startRecog, stopRecog]);

  /* ---------- commit buffer helper ---------- */
  const commitField = useCallback(() => {
    const clean = bufRef.current.trim();
    if (clean) {
      const key = fieldKeys[step];
      setDraft((d) => ({ ...d, [key]: clean }));
    }
    bufRef.current = "";
    setLive("");
    gate.current = false;
    setStep((s) => s + 1);
  }, [step]);

  /* ---------- wizard speech handler ---------- */
  useSpeechRecognitionEvent("result", async (evt) => {
    if (!editing || !gate.current || ttsRef.current) return;

    const res   = evt.results?.[evt.resultIndex ?? 0] ?? {};
    const txt   = res.transcript ?? evt.value ?? "";
    const final = res.isFinal ?? false;
    if (!txt) return;

    /* step 5 – confirmation */
    if (step === 5) {
      if (/^yes\b/i.test(txt)) {
        stopRecog(); gate.current = false;
        await commitChanges();
        return;
      }

      if (/^no\b/i.test(txt)) {
        stopRecog(); gate.current = false;
        await speak("Okay, let's start again.");
        setStep(0);
        return;
      }
      return;
    }

    /* collecting steps 0‑4 */
    if (txt !== bufRef.current) { bufRef.current = txt; setLive(txt); }
    clearTimeout(tmrRef.current);
    tmrRef.current = setTimeout(() => { stopRecog(); commitField(); }, SILENCE_MS);
    if (final) { stopRecog(); commitField(); }
  });

  /* ---------- begin edit ---------- */
  async function beginEdit() {
    if (!event) return;

    const d = new Date(event.date);
    setDraft({
      title: event.title,
      date : d.toLocaleDateString(),
      time : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      duration: `${event.durationMinutes} minutes`,
      description: event.description,
    });

    setEditing(true);
    setStep(0);
  }


  /* ---------- cancel edit ---------- */
  const cancelEdit = async () => {
    gate.current = false;
    setEditing(false);
    stopRecog();
  };


  /* ---------- save / update ---------- */
  async function commitChanges() {
    gate.current = false;

    /* merge & parse */
    const mins = minutesFromText(draft.duration) ?? event.durationMinutes;
    const spokenTime = normalizeTimeForSpeech(draft.time);
    const newDate =
      chronoParse(`${draft.date} ${spokenTime}`, new Date(), { forwardDate: true })[0]?.date?.()
      ?? new Date(event.date);

    const updated = {
      ...event,
      title: draft.title,
      date : newDate,
      durationMinutes: mins,
      description: draft.description,
    };

    /* save list */
    const list = await load();
    const idx  = list.findIndex((e) => e.id === event.id);
    if (idx >= 0) {
      list[idx] = updated;
      await save(list);
      setEvent(updated);
    }
    setEditing(false);
    await speak("Event updated.");
    startRecog();
  }

  /* ---------- render ---------- */
  if (!event) {
    return (
      <View style={{ padding: 20 }}>
        <Text>Loading…</Text>
      </View>
    );
  }

  const end = new Date(event.date);
  end.setMinutes(end.getMinutes() + (event.durationMinutes ?? 60));

  return (
    <View style={{ flex: 1, padding: 20 }}>
      <Stack.Screen
        options={{
          title: event.title,
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()} style={{ paddingHorizontal: 10 }}>
              <Text style={{ fontSize: 18 }}>← Back</Text>
            </TouchableOpacity>
          ),
        }}
      />

      {/* Cancel button – only when editing */}
      {editing && (
        <TouchableOpacity
          onPress={cancelEdit}
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            backgroundColor: "#ff3b30",
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 6,
          }}
        >
          <Text style={{ color: "#fff" }}>Cancel</Text>
        </TouchableOpacity>
      )}

      <Text style={{ fontSize: 24, marginBottom: 12 }}>{event.title}</Text>
      <Text>Date: {new Date(event.date).toLocaleDateString()}</Text>
      <Text>
        Time: {new Date(event.date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        {" — "}
        {end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </Text>
      <Text>Duration: {event.durationMinutes} min</Text>
      <Text style={{ marginTop: 12 }}>Description: {event.description}</Text>

      {/* touch buttons */}
      <TouchableOpacity
        onPress={beginEdit}
        style={{ marginTop: 24, padding: 12,
                 backgroundColor: "#34c759", borderRadius: 8, alignSelf: "flex-start" }}
      >
        <Text style={{ color: "white", fontWeight: "600" }}>Edit event</Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => router.back()}
        style={{ marginTop: 12, padding: 12,
                 backgroundColor: "#007AFF", borderRadius: 8, alignSelf: "flex-start" }}
      >
        <Text style={{ color: "white" }}>Back to calendar</Text>
      </TouchableOpacity>

      {editing && (
        <Text style={{ marginTop: 20, fontStyle: "italic" }}>
          {listening ? `🎙 ${live}` : `🎤 ${prompts[Math.min(step, 4)]}`}
        </Text>
      )}
    </View>
  );
}
