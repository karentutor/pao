/* ──────────────────────────────────────────────────────────
   AddTask.js – voice wizard (Title → Description → DueDate → Confirm)
   ────────────────────────────────────────────────────────── */
import React, { useState, useEffect, useRef, useCallback } from "react";
import { View, Text, TouchableOpacity, Alert } from "react-native";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import * as Speech from "expo-speech";

const fieldKeys = ["title", "description", "dueDate"];
const prompts = [
  "Please say the task title.",
  "Describe the task.",
  "What is the due date?",
];
const SILENCE_MS = 1500;
const speak = (txt) =>
  new Promise((res) =>
    Speech.speak(txt, { language: "en-US", onDone: res, onStopped: res, onError: res })
  );

export default function AddTask({ onSave, onCancel }) {
  const [step, setStep] = useState(0);
  const [live, setLive] = useState("");
  const [data, setData] = useState({ title: "", description: "", dueDate: "" });
  const [listen, setListen] = useState(false);
  const bufRef = useRef("");
  const tmrRef = useRef(null);
  const recogOK = useRef(false);
  const ttsRef = useRef(false);
  const gateRef = useRef(false);
  const alive = useRef(true);

  const startRecog = useCallback(() => {
    recogOK.current = false;
    ExpoSpeechRecognitionModule.start({ lang: "en-US", interimResults: true, continuous: true });
    setListen(true);
  }, []);

  const stopRecog = useCallback(() => {
    clearTimeout(tmrRef.current);
    ExpoSpeechRecognitionModule.stop();
    setListen(false);
  }, []);

  useSpeechRecognitionEvent("start", () => {
    recogOK.current = true;
  });

  /* driver */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (step > 4) return;
      const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Mic needed", "Enable microphone");
        return;
      }
      if (step <= 2) {
        startRecog();
        while (!recogOK.current && !cancelled && alive.current) await new Promise((r) => setTimeout(r, 60));
        if (cancelled || !alive.current) return;
        ttsRef.current = true;
        await speak(prompts[step]);
        ttsRef.current = false;
        gateRef.current = true;
        return;
      }
      if (step === 3) {
        const summary = `You said: Title ${data.title}. Description ${data.description}. Due ${data.dueDate}. Is that correct?`;
        ttsRef.current = true;
        await speak(summary);
        ttsRef.current = false;
        startRecog();
        while (!recogOK.current && !cancelled && alive.current) await new Promise((r) => setTimeout(r, 60));
        gateRef.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [step, startRecog]);

  const commitField = useCallback(() => {
    const clean = bufRef.current.trim();
    if (clean) {
      const k = fieldKeys[step];
      setData((p) => ({ ...p, [k]: clean }));
    }
    bufRef.current = "";
    setLive("");
    gateRef.current = false;
    setStep((p) => p + 1);
  }, [step]);

  useSpeechRecognitionEvent("result", async (e) => {
    if (ttsRef.current || !gateRef.current) return;
    const res = e.results?.[e.resultIndex ?? 0] ?? {};
    const txt = res.transcript ?? e.value ?? "";
    const final = res.isFinal ?? false;
    if (!txt) return;
    if (step === 3) {
      if (/^yes\b/i.test(txt)) {
        stopRecog();
        gateRef.current = false;
        await handleSave();
        return;
      }
      if (/^no\b/i.test(txt)) {
        stopRecog();
        gateRef.current = false;
        await speak("Let's start again.");
        setData({ title: "", description: "", dueDate: "" });
        setStep(0);
        return;
      }
      return;
    }
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

  const handleSave = useCallback(async () => {
    stopRecog();
    gateRef.current = false;
    onSave?.(data);
    await speak("Task saved.");
    setStep(4);
  }, [data, onSave, stopRecog]);

  useEffect(() => {
    return () => {
      alive.current = false;
      stopRecog();
    };
  }, [stopRecog]);

  return (
    <View style={{ flex: 1, padding: 16 }}>
      {/* Cancel button at bottom right */}
      <TouchableOpacity
        onPress={() => {
          stopRecog();
          onCancel?.();
        }}
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

      <Text style={{ fontSize: 22, fontWeight: "600", marginBottom: 16 }}>🆕 Add Task</Text>
      <Text style={{ fontSize: 18, marginBottom: 8 }}>
        {step <= 2
          ? prompts[step]
          : step === 3
          ? "Confirm the details…"
          : "Task saved ✔︎"}
      </Text>
      <Text style={{ fontStyle: "italic", marginBottom: 12 }}>
        {listen ? `🎙 ${live}` : ""}
      </Text>

      <View style={{ marginBottom: 20 }}>
        <Text>Title: {data.title}</Text>
        <Text>Description: {data.description}</Text>
        <Text>Due: {data.dueDate}</Text>
      </View>

      {step === 3 && (
        <TouchableOpacity
          disabled={!(data.title && data.description && data.dueDate)}
          onPress={handleSave}
          style={{ padding: 12, backgroundColor: "#34c759", borderRadius: 8 }}
        >
          <Text style={{ color: "#fff", fontWeight: "600" }}>Save task & return</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
