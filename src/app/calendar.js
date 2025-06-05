import { useState, useRef, useCallback } from "react";
import { View, ScrollView, Text, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";

export default function Calendar() {
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
    if (!isFocused)      return;
    if (runningRef.current) return;
    runningRef.current = true;

    console.log("▶️ [Calendar] recogniser STARTED");
    lastErrorRef.current = null;
    setRecognizing(true);
    setTranscript("");
    hasNavigatedRef.current = false;
  });

  /* ── end ── */
  useSpeechRecognitionEvent("end", () => {
    if (!isFocused || !runningRef.current) return;
    runningRef.current = false;

    // if (["audio-capture", "no-speech"].includes(lastErrorRef.current)) {
    if (lastErrorRef.current === "audio-capture") {
      console.warn("🎤 Fatal speech error; not restarting");
      lastErrorRef.current = null;
      setRecognizing(false);
      return;
    }

    console.log("🛑 recogniser ENDED – restarting");
    setRecognizing(false);
    setTimeout(() => {
      if (!aliveRef.current) return;
      try {
        ExpoSpeechRecognitionModule.start({
          lang: "en-US",
          interimResults: true,
          continuous: true,
        });
        console.log("▶️ recogniser RE-started");
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
    console.log("📝 [Calendar] result:", latest);

    if (!hasNavigatedRef.current && latest.toLowerCase().includes("home")) {
      hasNavigatedRef.current = true;
      console.log("🔄 Heard 'home' → /");
      ExpoSpeechRecognitionModule.stop();
      setTranscript("");
      router.replace("/");
    }
  });

  /* ── error ── */
  useSpeechRecognitionEvent("error", (e) => {
    if (!isFocused || !runningRef.current) return;
    lastErrorRef.current = e.error;
    console.log("❗️ Speech error:", e.error, e.message);
  });

  /* ── focus lifecycle ── */
  useFocusEffect(
    useCallback(() => {
      aliveRef.current = true;

      (async () => {
        console.log("▶️ [Calendar] requesting mic permission…");
        const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
        if (!perm.granted) {
          Alert.alert(
            "Permission required",
            "Enable microphone & speech recognition in Settings."
          );
          return;
        }
        try {
          ExpoSpeechRecognitionModule.start({
            lang: "en-US",
            interimResults: true,
            continuous: true,
          });
          console.log("▶️ [Calendar] recogniser start() called");
        } catch (err) {
          console.error("❗️ recogniser start() failed:", err);
        }
      })();

      return () => {
        aliveRef.current = false;
        runningRef.current = false;
        console.log("🛑 [Calendar] blur → stop recogniser");
        ExpoSpeechRecognitionModule.stop();
      };
    }, [])
  );

  /* UI */
  return (
    <View style={{ flex: 1, padding: 16 }}>
      <ScrollView>
        <Text style={{ fontSize: 24, marginTop: 12 }}>📅 Calendar</Text>
        <Text style={{ fontSize: 18, marginBottom: 12 }}>
          {recognizing ? "🔊 Listening… say 'home' to return"
                       : "🤫 Not listening (tap to refocus)"}
        </Text>
        <Text style={{ fontSize: 16 }}>{transcript}</Text>
      </ScrollView>
    </View>
  );
}
