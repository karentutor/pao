/* ──────────────────────────────────────────────────────────
   AddTask.js – voice wizard + validation + save/return
   ────────────────────────────────────────────────────────── */
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { View, Text, TouchableOpacity, Alert } from "react-native";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import * as Speech from "expo-speech";
import { parse as chronoParse } from "chrono-node";

/* ---------- constants & helpers (unchanged) ---------- */
const fieldKeys = ["title", "description", "dueDate"];
const prompts = [
  "Please say the task title (max ten words).",
  "Describe the task (≥20 characters).",
  "What is the due date?",
];
const SILENCE_MS = 1500;
const speak = (t) => new Promise((r) =>
  Speech.speak(t, { language: "en-US", onDone: r, onStopped: r, onError: r })
);
const validateField = (key, v) => {
  const txt = v.trim();
  switch (key) {
    case "title":       return txt.split(/\s+/).length > 10 ? "Title is too long." : null;
    case "description": return txt.length < 20 ? "Description too short." : null;
    case "dueDate":     return !chronoParse(txt, new Date(), { forwardDate: true })[0]
                           ? "Date unclear." : null;
    default:            return null;
  }
};

/* ---------- component ---------- */
export default function AddTask({ onSave, onCancel }) {
  const [step, setStep] = useState(0);
  const [data, setData] = useState({ title: "", description: "", dueDate: "" });
  const [live, setLive] = useState("");
  const [error, setError] = useState("");
  const [listening, setListening] = useState(false);

  /* refs & helpers (start/stop recogniser) */
  const bufRef = useRef(""); const tmr = useRef(null);
  const recogOK = useRef(false); const tts = useRef(false); const gate = useRef(false);
  const alive  = useRef(true);
  const startRecog = useCallback(() => {
    recogOK.current = false;
    ExpoSpeechRecognitionModule.start({ lang: "en-US", interimResults: true, continuous: true });
    setListening(true);
  }, []);
  const stopRecog = useCallback(() => {
    clearTimeout(tmr.current); ExpoSpeechRecognitionModule.stop(); setListening(false);
  }, []);

  useSpeechRecognitionEvent("start", () => { recogOK.current = true; });

  /* ---------- driver (prompts) ---------- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (step > 4) return;
      const p = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!p.granted) { Alert.alert("Mic needed", "Enable microphone"); return; }

      if (step <= 2) {
        startRecog(); while (!recogOK.current && alive.current && !cancelled)
          await new Promise(r => setTimeout(r, 60));
        tts.current = true; await speak(prompts[step]); tts.current = false;
        gate.current = true; return;
      }
      if (step === 3) {
        tts.current = true;
        await speak(`You said: Title ${data.title}. Description ${data.description}. Due ${data.dueDate}. If correct say Save or Yes. Otherwise say No or Cancel.`);
        tts.current = false;
        startRecog(); while (!recogOK.current && alive.current && !cancelled)
          await new Promise(r => setTimeout(r, 60));
        gate.current = true;
      }
    })();
    return () => { cancelled = true; };
  }, [step, startRecog]);

  /* ---------- save / cancel helpers ---------- */
  const persistAndReturn = () => { Speech.stop(); stopRecog(); gate.current = false; onSave?.(data); onCancel?.(); };
  const cancelAndReturn  = () => { Speech.stop(); stopRecog(); gate.current = false; onCancel?.(); };

  /* ---------- commit field ---------- */
  const commitField = useCallback(async () => {
    const clean = bufRef.current.trim(); const key = fieldKeys[step];
    if (clean) {
      const err = validateField(key, clean);
      if (err) { setError(err); bufRef.current=""; setLive(""); gate.current=false; stopRecog(); await speak(err); await speak(prompts[step]); startRecog(); return; }
      setData(p => ({ ...p, [key]: clean })); setError("");
    }
    bufRef.current=""; setLive(""); gate.current=false; setStep(s => s+1);
  }, [step, startRecog, stopRecog]);

  /* ---------- speech results ---------- */
  useSpeechRecognitionEvent("result", async e => {
    if (!gate.current || tts.current) return;
    const res = e.results?.[e.resultIndex ?? 0] ?? {};
    const txt = (res.transcript ?? e.value ?? "").trim().toLowerCase();
    const final = res.isFinal ?? false;
    if (!txt) return;

    /* global voice cancel --------------------------------- */
    if (/^cancel\b/.test(txt)) { cancelAndReturn(); return; }

    /* confirm step ---------------------------------------- */
    if (step === 3) {
      if (/^(yes|save)\b/.test(txt)) { persistAndReturn(); return; }
      if (/^no\b/.test(txt)) { stopRecog(); await speak("Let's start again."); setStep(0); return; }
    }

    /* collecting steps 0‑2 -------------------------------- */
    if (txt !== bufRef.current) { bufRef.current = txt; setLive(txt); }
    clearTimeout(tmr.current);
    tmr.current = setTimeout(() => { stopRecog(); commitField(); }, SILENCE_MS);
    if (final) { stopRecog(); commitField(); }
  });

  /* ---------- cleanup ---------- */
  useEffect(() => () => { alive.current=false; stopRecog(); }, [stopRecog]);

  /* ---------- UI ---------- */
  const isComplete = useMemo(() =>
    Object.values(data).every(v=>v.trim()) && !error, [data, error]);

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <TouchableOpacity onPress={cancelAndReturn}
        style={{ position:"absolute",bottom:16,right:16,backgroundColor:"#ff3b30",
                 paddingHorizontal:12,paddingVertical:6,borderRadius:6 }}>
        <Text style={{ color:"#fff" }}>Cancel</Text>
      </TouchableOpacity>

      <Text style={{ fontSize:22,fontWeight:"600",marginBottom:16 }}>🆕 Add Task</Text>
      <Text style={{ fontSize:18,marginBottom:8 }}>
        {step<=2?prompts[step]:step===3?"Confirm the details…":"Task saved ✔︎"}
      </Text>
      {error ? <Text style={{ color:"#ff3b30" }}>{error}</Text> : null}
      <Text style={{ fontStyle:"italic",marginBottom:12 }}>{listening ? `🎙 ${live}` : ""}</Text>

      <View style={{ marginBottom:20 }}>
        <Text>Title: {data.title}</Text>
        <Text>Description: {data.description}</Text>
        <Text>Due: {data.dueDate}</Text>
      </View>

      {step===3 && (
        <TouchableOpacity disabled={!isComplete} onPress={persistAndReturn}
          style={{ padding:12,backgroundColor:isComplete?"#34c759":"#aaa",
                   borderRadius:8,opacity:isComplete?1:0.6 }}>
          <Text style={{ color:"#fff",fontWeight:"600" }}>Save task & return</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
