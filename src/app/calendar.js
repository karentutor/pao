import { useState, useRef, useCallback } from "react";
import { View, ScrollView, Text, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";

import DayCalendar from "../components/DayCalendar";
import WeekCalendar from "../components/WeekCalendar";
import YearCalendar from "../components/YearCalendar";

export default function Calendar() {
  const router = useRouter();
  const isFocused = useIsFocused();

  const [recognizing, setRecognizing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [viewMode, setViewMode] = useState("day"); // “day” | “week” | “year”
  const [selectedDate, setSelectedDate] = useState(new Date());

  // Refs for control flow
  const aliveRef = useRef(true);
  const runningRef = useRef(false);
  const lastErrorRef = useRef(null);
  const lastSwitchRef = useRef(0);
  const hasNavigatedHome = useRef(false);

  /* ────────────────────────────────────────────
     RENDER LOG (helps confirm state updates)
  ──────────────────────────────────────────── */
  console.log("📺 [render] current viewMode =", viewMode);

  /* ─── “start” callback ─── */
  useSpeechRecognitionEvent("start", () => {
    if (!isFocused || runningRef.current) return;
    runningRef.current = true;
    setRecognizing(true);
    setTranscript(""); // clear any old transcript immediately
    hasNavigatedHome.current = false;
    console.log("▶️ recogniser STARTED");
  });

  /* ─── “end” callback ─── */
  useSpeechRecognitionEvent("end", () => {
    if (!isFocused || !runningRef.current) return;
    runningRef.current = false;
    setRecognizing(false);

    if (lastErrorRef.current === "audio-capture") {
      lastErrorRef.current = null;
      return; // fatal – don’t restart
    }

    // Restart after 1.2 s (unless screen blurred)
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
    }, 1200);
  });

  /* ─── “result” callback ─── */
  useSpeechRecognitionEvent("result", (event) => {
    if (!isFocused || !runningRef.current) return;

    /* 1️⃣  Pull transcript */
    let text = "";
    if (
      Array.isArray(event.results) &&
      event.results.length > 0 &&
      typeof event.results[0].transcript === "string"
    ) {
      text = event.results[0].transcript;
    } else if (typeof event.value === "string" && event.value.trim().length > 0) {
      text = event.value;
    }

    const isFinal = event.isFinal ?? false;

    /* 2️⃣  Update on‑screen transcript (replace, don’t append) */
    setTranscript(text);

    /* 3️⃣  Debug logs (comment out in production) */
    console.log("🔍 [Full event object]:", JSON.stringify(event, null, 2));
    console.log("🔊 [RAW result] text=", JSON.stringify(text), "isFinal=", isFinal);

    /* 4️⃣  Normalise + tokenise */
    const lower = text.toLowerCase().trim();
    const clean = lower
      .replace(/\byeah\b/g, "year")
      .replace(/\byeer\b/g, "year")
      .replace(/\bjay\b/g, "day"); // ★ common mis‑recognition “Jay”→“day”
    const tokens = clean.split(/\s+/).filter((t) => t.length > 0);
    console.log("📑 tokens=", tokens);

    /* 5️⃣  “HOME” command (immediate) */
    if (!hasNavigatedHome.current && tokens.includes("home")) {
      hasNavigatedHome.current = true;
      console.log("➡️ Detected HOME → navigating to /");
      ExpoSpeechRecognitionModule.stop(); // stop listening and trigger onEnd
      router.replace("/");
      return;
    }

    /* 6️⃣  Decide if user said “day”, “week”, or “year” (no final needed) */
    const now = Date.now();
    // const target = tokens.includes("day")
    //   ? "day"
    //   : tokens.includes("week")
    //   ? "week"
    //   : tokens.includes("year")
    //   ? "year"
    //   : null;

 const last = tokens[tokens.length - 1];          // ★ newest token
 const target =
   ["day", "week", "year"].includes(last) ? last : null; // ★

    // ★ Debounce + switch immediately when word first appears
    if (target && target !== viewMode && now - lastSwitchRef.current > 1000) {
      console.log(`🔄 voice switch → ${target}`);
      setViewMode(target);
      lastSwitchRef.current = now;
    }

    /* 7️⃣  Clear transcript shortly *after* final result so text doesn’t stick */
    if (isFinal) {
      setTimeout(() => setTranscript(""), 200);
    }
  });

  /* ─── “error” callback ─── */
  useSpeechRecognitionEvent("error", (e) => {
    if (!isFocused || !runningRef.current) return;
    lastErrorRef.current = e.error;
    console.log("❗️ Speech error:", e.error, e.message);
  });

  /* ─── Focus/blur lifecycle ─── */
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
        try {
          ExpoSpeechRecognitionModule.start({
            lang: "en-US",
            interimResults: true,
            continuous: true, // ★ keep continuous mode
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

  /* ─── Date picker callback ─── */
  const handleSelectDate = (date) => {
    setSelectedDate(date);
    setViewMode("day");
  };

  /* ─── RENDER ─── */
  return (
    <View style={{ flex: 1, padding: 16 }}>
      {/* Status banner */}
      <Text style={{ fontSize: 16, marginBottom: 4 }}>
        {recognizing
          ? "🔊 Listening… say “day / week / year / home”"
          : "🤫 Not listening"}
      </Text>

      {/* Calendar view */}
      <View style={{ flex: 1 }}>
        {viewMode === "day" && <DayCalendar date={selectedDate} />}
        {viewMode === "week" && (
          <WeekCalendar date={selectedDate} onSelectDate={handleSelectDate} />
        )}
        {viewMode === "year" && <YearCalendar />}
      </View>

      {/* Live transcript display */}
      <ScrollView style={{ maxHeight: 100, marginTop: 8 }}>
        <Text style={{ fontSize: 14 }}>{transcript}</Text>
      </ScrollView>
    </View>
  );
}
