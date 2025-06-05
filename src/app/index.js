import { useState, useRef, useCallback } from "react";
import { View, ScrollView, Text, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";

export default function Home() {
  const router        = useRouter();
  const isFocused     = useIsFocused();            // boolean
  const [recognizing, setRecognizing] = useState(false);
  const [transcript,  setTranscript ] = useState("");

  const hasNavigatedRef = useRef(false);
  const lastErrorRef    = useRef(null);
  const aliveRef        = useRef(true);            // true while mounted
  const runningRef      = useRef(false);           // true while mic active

  /* ── start ── */
  useSpeechRecognitionEvent("start", () => {
    if (!isFocused)      return;
    if (runningRef.current) return;                // ignore duplicate listener
    runningRef.current = true;

    console.log("▶️ [Home] recogniser STARTED");
    lastErrorRef.current = null;
    setRecognizing(true);
    setTranscript("");
    hasNavigatedRef.current = false;
  });

  /* ── end ── */
  useSpeechRecognitionEvent("end", () => {
    if (!isFocused || !runningRef.current) return;
    runningRef.current = false;                    // session ended

  //  if (["audio-capture", "no-speech"].includes(lastErrorRef.current)) {
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
    console.log("📝 [Home] result:", latest);

    if (!hasNavigatedRef.current && latest.toLowerCase().includes("calendar")) {
      hasNavigatedRef.current = true;
      console.log("🔄 Heard 'calendar' → /calendar");
      ExpoSpeechRecognitionModule.stop();
      setTranscript("");
      router.replace("/calendar");
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
        console.log("▶️ [Home] requesting mic permission…");
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
          console.log("▶️ [Home] recogniser start() called");
        } catch (err) {
          console.error("❗️ recogniser start() failed:", err);
        }
      })();

      return () => {
        aliveRef.current = false;
        runningRef.current = false;
        console.log("🛑 [Home] blur → stop recogniser");
        ExpoSpeechRecognitionModule.stop();
      };
    }, [])
  );

  /* UI */
  return (
    <View style={{ flex: 1, padding: 16 }}>
      <ScrollView>
        <Text style={{ fontSize: 18, marginTop: 12 }}>Home</Text>
        <Text style={{ fontSize: 18, marginBottom: 12 }}>
          {recognizing ? "🔊 Listening… say 'calendar'"
                       : "🤫 Not listening (tap to refocus)"}
        </Text>
        <Text style={{ fontSize: 16 }}>{transcript}</Text>
      </ScrollView>
    </View>
  );
}
