/* ──────────────────────────────────────────────────────────
   AddTask.js – voice wizard + repeats + validation
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
import { speak, stopSpeaking as stopTTS } from "../utils/tts";
import { parse as chronoParse } from "chrono-node";

/* ---------- constants ---------- */
const fieldKeys = ["title", "description", "dueDate", "frequency"];
const prompts = [
  "Please say the task title (max ten words).",
  "Describe the task (max twenty words).",
  "What is the due date?",
  "Does this task repeat? Say None, Daily, Weekly or Monthly.",
];
const SILENCE_MS = 1500;

function validateField(key, v) {
  const txt = v.trim().toLowerCase();
  switch (key) {
    case "title": {
      const wordCount = txt.split(/\s+/).filter(Boolean).length;
      return wordCount > 10 ? "Title is too long." : null;
    }
    case "description": {
      const wordCount = txt.split(/\s+/).filter(Boolean).length;
      return wordCount > 20 ? "Description too long. Maximum 20 words." : null;
    }
    case "dueDate":
      return !chronoParse(txt, new Date(), { forwardDate: true })[0]
        ? "Date unclear."
        : null;
    case "frequency":
      return ["none", "daily", "weekly", "monthly"].includes(txt)
        ? null
        : "Say None, Daily, Weekly or Monthly.";
    default:
      return null;
  }
}

/* ---------- component ---------- */
export default function AddTask({ onSave, onCancel }) {
  const [step, setStep] = useState(0);
  const [data, setData] = useState({
    title: "",
    description: "",
    dueDate: "",
    frequency: "none",
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

  const cancelAndReturn = () => {
    stopTTS();
    stopRecog();
    gateRef.current = false;
    onCancel?.();
  };

  const persistAndReturn = () => {
    stopTTS();
    stopRecog();
    gateRef.current = false;
    onSave?.(data);
    onCancel?.();
  };

  /* ---------- driver ---------- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (step > 4) return; // finished
      const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Mic needed", "Enable microphone");
        return;
      }

      /* Steps 0‑3: prompt, then listen */
      if (step <= 3) {
        ttsRef.current = true;
        await speak(prompts[step]);
        ttsRef.current = false;

        startRecog();
        while (!recogOK.current && aliveRef.current && !cancelled)
          await new Promise((r) => setTimeout(r, 60));

        gateRef.current = true;
        return;
      }

      /* Step 4: confirmation */
      if (step === 4) {
        ttsRef.current = true;
        await speak(
          `You said: Title ${data.title}. Description ${data.description}. ` +
            `Due ${data.dueDate}. Repeat ${data.frequency}. ` +
            `If correct say Save or Yes. Otherwise say No or Cancel.`
        );
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
        setData((p) => ({ ...p, [key]: "" }));
        bufRef.current = "";
        setLive("");
        gateRef.current = false;
        stopRecog();
        await speak(err);
        await speak(prompts[step]);
        startRecog();
        return;
      }
      /* VALID */
      setData((p) => ({
        ...p,
        [key]: key === "frequency" ? clean.toLowerCase() : clean,
      }));
      setError("");
    }

    /* move to next step */
    bufRef.current = "";
    setLive("");
    gateRef.current = false;
    setStep((s) => s + 1);
  }, [step, startRecog, stopRecog]);

  /* ---------- speech results ---------- */
  useSpeechRecognitionEvent("result", async (e) => {
    if (!gateRef.current || ttsRef.current) return;

    const res = e.results?.[e.resultIndex ?? 0] ?? {};
    const txt = (res.transcript ?? e.value ?? "").trim().toLowerCase();
    const final = res.isFinal ?? false;
    if (!txt) return;

    /* global Cancel */
    if (/^cancel\b/.test(txt)) {
      cancelAndReturn();
      return;
    }

    /* confirmation step */
    if (step === 4) {
      if (/^(yes|save)\b/.test(txt)) {
        persistAndReturn();
        return;
      }
      if (/^no\b/.test(txt)) {
        stopRecog();
        await speak("Let's start again.");
        setStep(0);
        return;
      }
      return;
    }

    /* collecting steps */
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

  /* ---------- cleanup ---------- */
  useEffect(
    () => () => {
      aliveRef.current = false;
      stopRecog();
    },
    [stopRecog]
  );

  /* ---------- UI ---------- */
  const isComplete = useMemo(
    () => fieldKeys.every((k) => data[k].trim()) && !error,
    [data, error]
  );

  return (
    <View style={{ flex: 1, padding: 16 }}>
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

      <Text style={{ fontSize: 22, fontWeight: "600", marginBottom: 16 }}>
        🆕 Add Task
      </Text>
      <Text style={{ fontSize: 18, marginBottom: 8 }}>
        {step <= 3
          ? prompts[step]
          : step === 4
          ? "Confirm the details…"
          : "Task saved ✔︎"}
      </Text>
      {error ? <Text style={{ color: "#ff3b30" }}>{error}</Text> : null}
      <Text style={{ fontStyle: "italic", marginBottom: 12 }}>
        {listening ? `🎙 ${live}` : ""}
      </Text>

      <View style={{ marginBottom: 20 }}>
        <Text>Title: {data.title}</Text>
        <Text>Description: {data.description}</Text>
        <Text>Due: {data.dueDate}</Text>
        <Text>Repeat: {data.frequency}</Text>
      </View>

      {step === 4 && (
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
            Save task & return
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
