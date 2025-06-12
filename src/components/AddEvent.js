/* ──────────────────────────────────────────────────────────
   AddEvent.js – robust silence detection + confirmation
   ────────────────────────────────────────────────────────── */
import React, { useState, useEffect, useRef, useCallback } from "react";
import { View, Text, TouchableOpacity, Alert } from "react-native";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import * as Speech from "expo-speech";

const fieldKeys = ["title", "date", "time", "description"];
const prompts = [
  "Please say the event title.",
  "Now say the event date.",
  "Now say the event time.",
  "Finally, describe the event.",
];
const SILENCE_MS = 1500;                           // hard silence window

export default function AddEvent({ onSave }) {
  /* state */
  const [step, setStep]   = useState(0);           // 0‑3 collect, 4 confirm, 5 done
  const [live, setLive]   = useState("");
  const [details, setDetails] = useState({
    title: "", date: "", time: "", description: "",
  });
  const [listening, setListening] = useState(false);

  /* refs */
  const bufRef   = useRef("");
  const tmrRef   = useRef(null);
  const ttsRef   = useRef(false);
  const recogOK  = useRef(false);
  const gateRef  = useRef(false);
  const aliveRef = useRef(true);

  /* helpers */
  const speak = (txt) =>
    new Promise((res) => {
      ttsRef.current = true;
      Speech.speak(txt, {
        language: "en-US",
        onDone: () => { ttsRef.current = false; res(); },
        onStopped: () => { ttsRef.current = false; res(); },
        onError: () => { ttsRef.current = false; res(); },
      });
    });

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

  /* recognise “start” */
  useSpeechRecognitionEvent("start", () => { recogOK.current = true; });

  /* driver */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (step > 5) return;

      const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission required", "Enable microphone access in Settings.");
        return;
      }

      /* Steps 0‑3 */
      if (step < 4) {
        startRecog();
        while (!recogOK.current && aliveRef.current && !cancelled) {
          await new Promise((r) => setTimeout(r, 80));
        }
        if (cancelled || !aliveRef.current) return;
        await speak(prompts[step]);
        gateRef.current = true;                      // accept speech
        return;
      }

      /* Step 4: confirmation */
      if (step === 4) {
        const s = `You said: Title ${details.title}. Date ${details.date}. `
                + `Time ${details.time}. Description ${details.description}. `
                + "Is that correct? Say yes or no.";
        await speak(s);
        startRecog();
        while (!recogOK.current && aliveRef.current && !cancelled) {
          await new Promise((r) => setTimeout(r, 80));
        }
        if (cancelled || !aliveRef.current) return;
        gateRef.current = true;
      }
    })();
    return () => { cancelled = true; };
  }, [step, startRecog]);

  /* commit buffer -> state, advance */
  const commitField = useCallback(() => {
    const clean = bufRef.current.trim();
    if (clean) {
      const key = fieldKeys[step];
      setDetails((p) => ({ ...p, [key]: clean }));
    }
    bufRef.current = "";
    setLive("");
    gateRef.current = false;
    setStep((p) => p + 1);
  }, [step]);

  /* recogniser results */
  useSpeechRecognitionEvent("result", (event) => {
    if (ttsRef.current || !gateRef.current) return;

    const res   = event.results?.[event.resultIndex ?? 0] ?? {};
    const text  = res.transcript ?? event.value ?? "";
    const final = res.isFinal ?? false;
    if (!text) return;

    /* confirmation step */
    if (step === 4) {
      if (/\b(yes|yeah|yup)\b/i.test(text)) {
        stopRecog();
        gateRef.current = false;
        onSave?.(details);                           // save & return
        speak("Event saved.");
        setStep(5);
        return;
      }
      if (/\b(no|nah|nope)\b/i.test(text)) {
        stopRecog();
        gateRef.current = false;
        speak("Okay, let's start again.");
        setDetails({ title:"", date:"", time:"", description:"" });
        setStep(0);
        return;
      }
      return;                                       // ignore other words
    }

    /* collecting */
    if (text !== bufRef.current) {
      bufRef.current = text;
      setLive(text);
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

  /* cleanup */
  useEffect(() => () => { aliveRef.current = false; stopRecog(); }, [stopRecog]);

  /* UI */
  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 22, fontWeight: "600", marginBottom: 16 }}>
        🆕 Add Event
      </Text>

      <Text style={{ fontSize: 18, marginBottom: 8 }}>
        {step < 4 ? prompts[step] : "Confirm the details…"}
      </Text>

      <Text style={{ fontStyle: "italic", marginBottom: 12 }}>
        {listening ? `🎙 ${live}` : ""}
      </Text>

      <View style={{ marginBottom: 20 }}>
        <Text>Title: {details.title}</Text>
        <Text>Date : {details.date}</Text>
        <Text>Time : {details.time}</Text>
        <Text>Description: {details.description}</Text>
      </View>

      {step === 5 && (
        <TouchableOpacity
          onPress={() => { setStep(0); setDetails({ title:"",date:"",time:"",description:"" }); }}
          style={{ padding: 12, backgroundColor: "#007AFF",
                   borderRadius: 8, alignSelf: "flex-start" }}
        >
          <Text style={{ color: "white", fontWeight: "600" }}>Add another</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
