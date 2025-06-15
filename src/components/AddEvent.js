/* ──────────────────────────────────────────────────────────
   AddEvent.js – voice wizard + validation + save / cancel
   ────────────────────────────────────────────────────────── */
import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { View, Text, TouchableOpacity, Alert } from "react-native";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import * as Speech from "expo-speech";
import { parse as chronoParse } from "chrono-node";

/* ---------- constants ---------- */
const fieldKeys = ["title", "date", "time", "duration", "description"];
const prompts = [
  "Please say the event title (max ten words).",
  "Now say the event date.",
  "Now say the event start time.",
  "How long is the event?",
  "Finally, describe the event (at least twenty characters).",
];
const SILENCE_MS = 1500;

/* ---------- helpers ---------- */
const speak = (txt) =>
  new Promise((res) =>
    Speech.speak(txt, { language: "en-US", onDone: res, onStopped: res, onError: res })
  );

const parseDurationMinutes = (text) => {
  const t = text.toLowerCase();
  const num = parseFloat(t);
  if (Number.isFinite(num)) {
    if (t.includes("hour")) return Math.round(num * 60);
    if (t.includes("minute")) return Math.round(num);
  }
  if (/half\s+an?\s+hour/.test(t)) return 30;
  return 60;
};

const normalizeTime = (t) => {
  const d = t.replace(/[^\d]/g, "");
  if (d.length === 3) return `${d[0]}:${d.slice(1)}`;
  if (d.length === 4) return `${d.slice(0, 2)}:${d.slice(2)}`;
  return t.replace(/\s+/, ":");
};

/* ---------- validation ---------- */
function validateField(key, value) {
  const clean = value.trim();
  switch (key) {
    case "title":
      return clean.split(/\s+/).length > 10
        ? "Title is too long. Keep it to ten words or fewer."
        : null;
    case "description":
      return clean.length < 20
        ? "Description should be at least twenty characters."
        : null;
    case "date":
      return !chronoParse(clean, new Date(), { forwardDate: true })[0]
        ? "I couldn't understand that date."
        : null;
    case "time":
      return chronoParse(`today ${clean}`, new Date())[0]?.start?.knownValues?.hour === undefined
        ? "That time is unclear."
        : null;
    default:
      return null;
  }
}

/* ──────────────────────────────────────────────────────────
   Component
   ────────────────────────────────────────────────────────── */
export default function AddEvent({ onSave, onCancel }) {
  /* wizard state */
  const [step, setStep] = useState(0);
  const [data, setData] = useState({
    title: "",
    date: "",
    time: "",
    duration: "",
    description: "",
  });
  const [live, setLive] = useState("");
  const [error, setError] = useState("");
  const [listening, setListening] = useState(false);

  /* refs */
  const bufRef = useRef("");
  const tmrRef = useRef(null);
  const recogOK = useRef(false);
  const ttsRef = useRef(false);
  const gateRef = useRef(false);
  const aliveRef = useRef(true);

  /* ---------- recogniser helpers ---------- */
  const startRecog = useCallback(() => {
    recogOK.current = false;
    ExpoSpeechRecognitionModule.start({
      lang: "en-US",
      interimResults: true,
      continuous: true,
    });
    setListening(true);
  }, []);

  const stopRecog = useCallback(() => {
    clearTimeout(tmrRef.current);
    ExpoSpeechRecognitionModule.stop();
    setListening(false);
  }, []);

  useSpeechRecognitionEvent("start", () => {
    recogOK.current = true;
  });

  /* ---------- navigation helpers ---------- */
  const cancelAndReturn = () => {
    Speech.stop();
    stopRecog();
    gateRef.current = false;
    onCancel?.();
  };

  const persist = () =>
    onSave?.({ ...data, duration: parseDurationMinutes(data.duration) });

  const persistAndReturn = () => {
    Speech.stop();
    stopRecog();
    gateRef.current = false;
    persist();
    onCancel?.();
  };

  /* ---------- driver ---------- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (step > 6) return;
      const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Mic needed", "Enable microphone");
        return;
      }

      if (step <= 4) {
        startRecog();
        while (!recogOK.current && aliveRef.current && !cancelled)
          await new Promise((r) => setTimeout(r, 60));
        if (cancelled || !aliveRef.current) return;

        ttsRef.current = true;
        await speak(prompts[step]);
        ttsRef.current = false;
        gateRef.current = true;
        return;
      }

      if (step === 5) {
        const mins = parseDurationMinutes(data.duration);
        const summary =
          `You said: Title ${data.title}. Date ${data.date}. ` +
          `Time ${normalizeTime(data.time)}. Duration ${data.duration} (${mins} min). ` +
          `Description ${data.description}. If this is correct, say Save or Yes. Otherwise say No or Cancel.`;
        ttsRef.current = true;
        await speak(summary);
        ttsRef.current = false;

        startRecog();
        while (!recogOK.current && aliveRef.current && !cancelled)
          await new Promise((r) => setTimeout(r, 60));
        gateRef.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [step, startRecog]);

  /* ---------- commit helper ---------- */
  const commitField = useCallback(async () => {
    const clean = bufRef.current.trim();
    const key = fieldKeys[step];
    if (clean) {
      const err = validateField(key, clean);
      if (err) {
        setError(err);
        bufRef.current = "";
        setLive("");
        gateRef.current = false;
        stopRecog();
        await speak(err);
        await speak(prompts[step]);
        startRecog();
        return;
      }
      setData((p) => ({ ...p, [key]: clean }));
      setError("");
    }
    bufRef.current = "";
    setLive("");
    gateRef.current = false;
    setStep((s) => s + 1);
  }, [step, startRecog, stopRecog]);

  /* ---------- speech results ---------- */
  useSpeechRecognitionEvent("result", async (e) => {
    if (ttsRef.current || !gateRef.current) return;

    const res = e.results?.[e.resultIndex ?? 0] ?? {};
    const txt = (res.transcript ?? e.value ?? "").trim();
    const final = res.isFinal ?? false;
    if (!txt) return;

    /* allow global cancel */
    if (/^cancel\b/i.test(txt)) {
      cancelAndReturn();
      return;
    }

    /* confirm stage */
    if (step === 5) {
      if (/^(?:yes|save)\b/i.test(txt)) {
        persistAndReturn();
        return;
      }
      if (/^no\b/i.test(txt)) {
        stopRecog();
        await speak("Let's start again.");
        setStep(0);
        return;
      }
      return; // ignore other words
    }

    /* collecting stages */
    if (txt !== bufRef.current) {
      bufRef.current = txt;
      setLive(txt);
    }
    clearTimeout(tmrRef.current);
    tmrRef.current = setTimeout(() => {
      stopRecog();
      commitField();
    }, SILENCE_MS);
    if (final) {
      stopRecog();
      commitField();
    }
  });

  /* ---------- completion gate ---------- */
  const isComplete = useMemo(
    () =>
      fieldKeys.every((k) => data[k].trim() !== "") &&
      !validateField("title", data.title) &&
      !validateField("description", data.description) &&
      !validateField("date", data.date) &&
      !validateField("time", data.time),
    [data]
  );

  /* ---------- cleanup ---------- */
  useEffect(
    () => () => {
      aliveRef.current = false;
      stopRecog();
    },
    [stopRecog]
  );

  /* ---------- UI ---------- */
  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 22, fontWeight: "600", marginBottom: 16 }}>
        🆕 Add Event
      </Text>
      <Text style={{ fontSize: 18, marginBottom: 8 }}>
        {step <= 4
          ? prompts[step]
          : step === 5
          ? "Confirm the details…"
          : "Event saved ✔︎"}
      </Text>
      {error ? <Text style={{ color: "#ff3b30" }}>{error}</Text> : null}
      <Text style={{ fontStyle: "italic", marginBottom: 12 }}>
        {listening ? `🎙 ${live}` : ""}
      </Text>

      <View style={{ marginBottom: 20 }}>
        <Text>Title: {data.title}</Text>
        <Text>Date: {data.date}</Text>
        <Text>Time: {normalizeTime(data.time)}</Text>
        <Text>Duration: {data.duration}</Text>
        <Text>Description: {data.description}</Text>
      </View>

      {/* Cancel button */}
      <TouchableOpacity
        onPress={cancelAndReturn}
        style={{
          position: "absolute",
          bottom: 16,
          right: 16,
          backgroundColor: "#ff3b30",
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderRadius: 6,
        }}
      >
        <Text style={{ color: "#fff" }}>Cancel</Text>
      </TouchableOpacity>

      {step === 5 && (
        <TouchableOpacity
          disabled={!isComplete}
          onPress={persistAndReturn}
          style={{
            padding: 12,
            backgroundColor: isComplete ? "#34c759" : "#aaa",
            borderRadius: 8,
            opacity: isComplete ? 1 : 0.6,
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "600" }}>
            Save event & return
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
