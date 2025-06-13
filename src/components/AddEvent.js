/* ──────────────────────────────────────────────────────────
   AddEvent.js – voice wizard (Title → Date → Time → Duration → Description → Confirm)
   ────────────────────────────────────────────────────────── */
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { View, Text, TouchableOpacity, Alert } from "react-native";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import * as Speech from "expo-speech";

/* ---------- settings ---------- */
const fieldKeys = ["title", "date", "time", "duration", "description"];
const prompts = [
  "Please say the event title.",
  "Now say the event date.",
  "Now say the event start time.",
  "How long is the event?",
  "Finally, describe the event.",
];
const SILENCE_MS = 1500;

/* ---------- helpers ---------- */
function parseDurationMinutes(text) {
  const t = text.toLowerCase();
  const num = parseFloat(t);
  if (Number.isFinite(num)) {
    if (t.includes("hour"))   return Math.round(num * 60);
    if (t.includes("minute")) return Math.round(num);
  }
  if (/half\s+an?\s+hour/.test(t)) return 30;
  return 60;
}
function normalizeTimeForSpeech(t) {
  const digits = t.replace(/[^\d]/g, "");
  if (digits.length === 3) return `${digits[0]}:${digits.slice(1)}`;
  if (digits.length === 4) return `${digits.slice(0, 2)}:${digits.slice(2)}`;
  return t.replace(/\s+/, ":");
}
const speak = (txt) =>
  new Promise((res) =>
    Speech.speak(txt, {
      language: "en-US",
      onDone   : res,
      onStopped: res,
      onError  : res,
    })
  );

export default function AddEvent({ onSave }) {
  /* ---------- state ---------- */
  const [step, setStep] = useState(0);                // 0‑4 collect, 5 confirm, 6 done
  const [live, setLive] = useState("");
  const [data, setData] = useState({
    title: "", date: "", time: "", duration: "", description: "",
  });
  const [listening, setListening] = useState(false);

  /* ---------- refs ---------- */
  const bufRef   = useRef("");
  const tmrRef   = useRef(null);
  const ttsRef   = useRef(false);
  const recogOK  = useRef(false);
  const gateRef  = useRef(false);
  const aliveRef = useRef(true);

  /* ---------- speech helpers ---------- */
  const startRecog = useCallback(() => {
    recogOK.current = false;
    ExpoSpeechRecognitionModule.start({
      lang: "en-US", interimResults: true, continuous: true,
    });
    setListening(true);
  }, []);

  const stopRecog = useCallback(() => {
    clearTimeout(tmrRef.current);
    ExpoSpeechRecognitionModule.stop();
    setListening(false);
  }, []);

  useSpeechRecognitionEvent("start", () => { recogOK.current = true; });

  /* ---------- driver per step ---------- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (step > 6) return;

      const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission required", "Enable microphone access in Settings.");
        return;
      }

      /* step 0‑4 – ask, then listen */
      if (step <= 4) {
        startRecog();
        while (!recogOK.current && aliveRef.current && !cancelled) {
          await new Promise((r) => setTimeout(r, 60));
        }
        if (cancelled || !aliveRef.current) return;
        ttsRef.current = true;
        await speak(prompts[step]);
        ttsRef.current = false;
        gateRef.current = true;
        return;
      }

      /* step 5 – confirmation */
      if (step === 5) {
        const mins = parseDurationMinutes(data.duration);
        const summary =
          `You said: Title ${data.title}. Date ${data.date}. `
        + `Time ${normalizeTimeForSpeech(data.time)}. `
        + `Duration ${data.duration} (${mins} minutes). `
        + `Description ${data.description}. Is that correct?`;
        ttsRef.current = true;
        await speak(summary);
        ttsRef.current = false;
        startRecog();
        while (!recogOK.current && aliveRef.current && !cancelled) {
          await new Promise((r) => setTimeout(r, 60));
        }
        if (cancelled || !aliveRef.current) return;
        gateRef.current = true;
      }
    })();
    return () => { cancelled = true; };
  }, [step, startRecog]);

  /* commit buffer to field */
  const commitField = useCallback(() => {
    const clean = bufRef.current.trim();
    if (clean) {
      const key = fieldKeys[step];
      setData((p) => ({ ...p, [key]: clean }));
    }
    bufRef.current = ""; setLive(""); gateRef.current = false;
    setStep((p) => p + 1);
  }, [step]);

  /* ---------- recognition results ---------- */
  useSpeechRecognitionEvent("result", async (e) => {
    if (ttsRef.current || !gateRef.current) return;

    const res   = e.results?.[e.resultIndex ?? 0] ?? {};
    const txt   = res.transcript ?? e.value ?? "";
    const final = res.isFinal ?? false;
    if (!txt) return;

    /* step 5 – confirmation */
    if (step === 5) {
      if (/^yes\b/i.test(txt)) {
        stopRecog(); gateRef.current = false;
        await handleSave();
        return;
      }
      if (/^no\b/i.test(txt)) {
        stopRecog(); gateRef.current = false;
        ttsRef.current = true;
        await speak("Let's start again.");
        ttsRef.current = false;
        setData({ title:"", date:"", time:"", duration:"", description:"" });
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

  /* ---------- manual save button ---------- */
  const isComplete = useMemo(
    () => fieldKeys.every((k) => data[k].trim() !== ""),
    [data]
  );

  const handleSave = useCallback(async () => {
    stopRecog();
    gateRef.current = false;
    onSave?.({ ...data, duration: parseDurationMinutes(data.duration) });
    ttsRef.current = true;
    await speak("Event saved.");
    ttsRef.current = false;
    setStep(6);
  }, [data, onSave, stopRecog]);

  /* cleanup */
  useEffect(() => () => { aliveRef.current = false; stopRecog(); }, [stopRecog]);

  /* ---------- UI ---------- */
  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 22, fontWeight: "600", marginBottom: 16 }}>🆕 Add Event</Text>

      <Text style={{ fontSize: 18, marginBottom: 8 }}>
        {step <= 4 ? prompts[step]
                   : step === 5 ? "Confirm the details…"
                   : "Event saved ✔︎"}
      </Text>

      <Text style={{ fontStyle: "italic", marginBottom: 12 }}>
        {listening ? `🎙 ${live}` : ""}
      </Text>

      <View style={{ marginBottom: 20 }}>
        <Text>Title: {data.title}</Text>
        <Text>Date : {data.date}</Text>
        <Text>Time : {normalizeTimeForSpeech(data.time)}</Text>
        <Text>Duration: {data.duration}</Text>
        <Text>Description: {data.description}</Text>
      </View>

      {/* manual confirmation button */}
      {step === 5 && (
        <TouchableOpacity
          disabled={!isComplete}
          onPress={handleSave}
          style={{
            padding: 12,
            backgroundColor: isComplete ? "#34c759" : "#aaaaaa",
            borderRadius: 8,
            opacity: isComplete ? 1 : 0.6,
          }}
        >
          <Text style={{ color: "white", fontWeight: "600" }}>
            Save event & return
          </Text>
        </TouchableOpacity>
      )}

      {/* post‑save option to add another */}
      {step === 6 && (
        <TouchableOpacity
          onPress={() => {
            setData({ title:"", date:"", time:"", duration:"", description:"" });
            setStep(0);
          }}
          style={{ marginTop: 16, padding: 12,
                   backgroundColor: "#007AFF", borderRadius: 8 }}
        >
          <Text style={{ color: "white" }}>Add another event</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
