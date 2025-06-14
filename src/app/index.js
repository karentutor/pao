/* ──────────────────────────────────────────────────────────
   home.js – voice    
   ────────────────────────────────────────────────────────── */
import { useState, useRef, useCallback } from "react";
import { View, ScrollView, Text, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import * as Speech from "expo-speech";                   // 🆕

/* simple promise‑based wrapper */
const speak = (txt) =>
  new Promise((res) =>
    Speech.speak(txt, {
      language: "en-US",
      onDone: res,
      onStopped: res,
      onError: res,
    })
  );

export default function Home() {
  const router        = useRouter();
  const isFocused     = useIsFocused();
  const [recognizing, setRecognizing] = useState(false);
  const [transcript,  setTranscript ] = useState("");

  const hasNavigatedRef = useRef(false);
  const lastErrorRef    = useRef(null);
  const aliveRef        = useRef(true);
  const runningRef      = useRef(false);

  /* ── start ── */
  useSpeechRecognitionEvent("start", () => {
    if (!isFocused || runningRef.current) return;
    runningRef.current = true;
    lastErrorRef.current = null;
    setRecognizing(true);
    setTranscript("");
    hasNavigatedRef.current = false;
  });

  /* ── end ── */
  useSpeechRecognitionEvent("end", () => {
    if (!isFocused || !runningRef.current) return;
    runningRef.current = false;

    if (lastErrorRef.current === "audio-capture") {
      setRecognizing(false);
      lastErrorRef.current = null;
      return;
    }

    setRecognizing(false);
    setTimeout(() => {
      if (!aliveRef.current) return;
      try {
        ExpoSpeechRecognitionModule.start({
          lang: "en-US",
          interimResults: true,
          continuous: true,
        });
      } catch (err) {
        console.error("❗️ restart failed:", err);
      }
    }, 300);
  });

  /* ── result ── */
  useSpeechRecognitionEvent("result", (event) => {
    if (!isFocused || !runningRef.current) return;
    const latest = event.results[0]?.transcript ?? "";
    setTranscript(latest);

    if (!hasNavigatedRef.current && latest.toLowerCase().includes("calendar")) {
      hasNavigatedRef.current = true;
      ExpoSpeechRecognitionModule.stop();
      setTranscript("");
      router.replace("/calendar");
    }
  });

  /* ── error ── */
  useSpeechRecognitionEvent("error", (e) => {
    if (!isFocused || !runningRef.current) return;
    lastErrorRef.current = e.error;
  });

  /* ── focus lifecycle ── */
  useFocusEffect(
    useCallback(() => {
      aliveRef.current = true;

      (async () => {
        const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
        if (!perm.granted) {
          Alert.alert(
            "Permission required",
            "Enable microphone & speech recognition in Settings."
          );
          return;
        }

        /* 1️⃣ speak greeting first */
        await speak("Good morning, how may I help you?");

        /* 2️⃣ then start recogniser (if still focused) */
        if (!aliveRef.current) return;
        try {
          ExpoSpeechRecognitionModule.start({
            lang: "en-US",
            interimResults: true,
            continuous: true,
          });
        } catch (err) {
          console.error("❗️ recogniser start() failed:", err);
        }
      })();

      return () => {
        aliveRef.current = false;
        runningRef.current = false;
        ExpoSpeechRecognitionModule.stop();
      };
    }, [])
  );

  /* UI */
  return (
    <View style={{ flex: 1, padding: 16 }}>
      <ScrollView>
        <Text style={{ fontSize: 22, fontWeight: "600", marginTop: 12 }}>
          Good morning, how may I help you?
        </Text>

        <Text style={{ fontSize: 18, marginVertical: 12 }}>
          {recognizing
            ? "🔊 Listening… say 'calendar'"
            : "🤫 Not listening (tap to refocus)"}
        </Text>

        <Text style={{ fontSize: 16 }}>{transcript}</Text>
      </ScrollView>
    </View>
  );
}
