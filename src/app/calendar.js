/* ──────────────────────────────────────────────────────────
   calendar.js – voice navigation + persistent event storage
   ────────────────────────────────────────────────────────── */
import { useState, useRef, useCallback, useEffect } from "react";
import { View, ScrollView, Text, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import * as FileSystem from "expo-file-system";
import { parse as chronoParse } from "chrono-node";

import DayCalendar  from "../components/DayCalendar";
import WeekCalendar from "../components/WeekCalendar";
import YearCalendar from "../components/YearCalendar";
import AddEvent     from "../components/AddEvent";

const EVENTS_PATH = FileSystem.documentDirectory + "calendar/events.json";

/* ensure calendar folder exists */
async function ensureDir() {
  const dir = FileSystem.documentDirectory + "calendar";
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
}

/* ───────────────────────────────────────── */

export default function Calendar() {
  const router      = useRouter();
  const isFocused   = useIsFocused();

  /* UI state */
  const [viewMode, setViewMode]         = useState("day"); // day | week | year | add
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [events, setEvents]             = useState([]);
  const [recognizing, setRecognizing]   = useState(false);
  const [transcript, setTranscript]     = useState("");
  const [logLines, setLogLines]         = useState([]);

  /* refs */
  const aliveRef            = useRef(true);
  const runningRef          = useRef(false);
  const lastErrorRef        = useRef(null);
  const lastSwitchRef       = useRef(0);
  const hasNavigatedHomeRef = useRef(false);
  const utteranceRef        = useRef("");

  /* ─── load / save events ─── */
  useEffect(() => {
    (async () => {
      try {
        await ensureDir();
        const info = await FileSystem.getInfoAsync(EVENTS_PATH);
        if (info.exists) {
          const raw = await FileSystem.readAsStringAsync(EVENTS_PATH);
          setEvents(JSON.parse(raw));
        }
      } catch (err) {
        console.warn("Failed to load events:", err);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await ensureDir();
        await FileSystem.writeAsStringAsync(
          EVENTS_PATH,
          JSON.stringify(events, null, 2)
        );
      } catch (err) {
        console.warn("Failed to save events:", err);
      }
    })();
  }, [events]);

  /* helper: log to console + on‑screen */
  const log = (...args) => {
    const msg = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
    console.log(msg);
    setLogLines((prev) => [...prev.slice(-30), msg]);
  };

  /* stop recogniser safely */
  const haltRecognizer = () => { try { ExpoSpeechRecognitionModule.stop(); } catch {} };

  /* ───────────────────── speech callbacks ───────────────────── */

  useSpeechRecognitionEvent("start", () => {
    if (!isFocused || runningRef.current) return;
    runningRef.current = true;
    setRecognizing(true);
    setTranscript("");
    utteranceRef.current = "";
    hasNavigatedHomeRef.current = false;
    log("▶️ recogniser STARTED");
  });

  useSpeechRecognitionEvent("end", () => {
    if (!isFocused || !runningRef.current) return;
    runningRef.current = false;
    setRecognizing(false);

    if (lastErrorRef.current === "audio-capture") {
      lastErrorRef.current = null;
      return;
    }
    setTimeout(() => {
      if (!aliveRef.current) return;
      try {
        ExpoSpeechRecognitionModule.start({
          lang: "en-US",
          interimResults: true,
          continuous: true,
        });
      } catch (err) {
        log("❗️ restart failed:", err);
      }
    }, 1200);
  });

  useSpeechRecognitionEvent("result", (event) => {
    if (!isFocused || !runningRef.current) return;

    /* extract text */
    let text = "";
    if (
      Array.isArray(event.results) &&
      event.results.length > 0 &&
      typeof event.results[0].transcript === "string"
    ) {
      text = event.results[0].transcript;
    } else if (typeof event.value === "string" && event.value.trim()) {
      text = event.value;
    }

    const isFinal = event.results?.[0]?.isFinal ?? event.isFinal ?? false;

    /* UI & log updates */
    setTranscript(text);
    log(`🗣️ "${text}"  isFinal=${isFinal}`);
    utteranceRef.current += " " + text;

    /* tokenise */
    const clean = text
      .toLowerCase()
      .trim()
      .replace(/\byeah\b/g, "year")
      .replace(/\byeer\b/g, "year")
      .replace(/\bjay\b/g, "day");
    const tokens = clean.split(/\s+/).filter(Boolean);

    /* HOME */
    if (!hasNavigatedHomeRef.current && tokens.includes("home")) {
      hasNavigatedHomeRef.current = true;
      haltRecognizer();
      router.replace("/");
      return;
    }

    /* ADD EVENT */
    const heardAddEventPhrase = tokens.includes("add") && tokens.includes("event");
    if (heardAddEventPhrase && viewMode !== "add") {
      log("📄 Switching to Add‑Event screen");
      haltRecognizer();
      setViewMode("add");
      return;
    }

    /* view switching (when not in Add‑Event) */
    if (viewMode !== "add") {
      const last = tokens[tokens.length - 1];
      const target = ["day", "week", "year"].includes(last) ? last : null;
      const now = Date.now();
      if (target && target !== viewMode && now - lastSwitchRef.current > 1000) {
        log(`🔄 switch → ${target}`);
        setViewMode(target);
        lastSwitchRef.current = now;
      }
    }

    /* clear transcript */
    if (isFinal) {
      utteranceRef.current = "";
      setTimeout(() => setTranscript(""), 200);
    }
  });

  useSpeechRecognitionEvent("error", (e) => {
    if (!isFocused || !runningRef.current) return;
    lastErrorRef.current = e.error;
    log("❗️ Speech error:", e.error, e.message);
  });

  /* ─── Focus / blur lifecycle ─── */
  useFocusEffect(
    useCallback(() => {
      aliveRef.current = true;

      (async () => {
        const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
        if (!perm.granted) {
          Alert.alert("Permission required", "Enable microphone & speech recognition.");
          return;
        }
        try {
          ExpoSpeechRecognitionModule.start({
            lang: "en-US",
            interimResults: true,
            continuous: true,
          });
        } catch (err) {
          log("❗️ recogniser start() failed:", err);
        }
      })();

      return () => {
        aliveRef.current  = false;
        runningRef.current = false;
        haltRecognizer();
      };
    }, [])
  );

/* ─── handle event coming back from AddEvent ─── */
const handleSaveEvent = useCallback((detail) => {
  /* Build JS Date as best we can */
  const dateTimeStr = `${detail.date} ${detail.time}`.trim();
  let dateObj =
    chronoParse(dateTimeStr, new Date(), { forwardDate: true })[0]?.date?.() ??
    chronoParse(detail.date, new Date(), { forwardDate: true })[0]?.date?.() ??
    new Date();                          // default fallback

  /* normalise to midnight if user gave no time */
  if (detail.time.trim() === "") dateObj.setHours(9, 0, 0, 0);

  setEvents((prev) => [
    ...prev,
    {
      id: Date.now(),
      title: detail.title || "Untitled",
      date : dateObj,
      description: detail.description,
    },
  ]);

  setSelectedDate(dateObj);
  setViewMode("day");
}, []);


  /* ─── UI ─── */
  if (viewMode === "add") {
    return <AddEvent onSave={handleSaveEvent} />;
  }

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 16, marginBottom: 4 }}>
        {recognizing
          ? "🔊 Listening… say “day / week / year / home / add event …”"
          : "🤫 Not listening"}
      </Text>

      <View style={{ flex: 1 }}>
        {viewMode === "day" && (
          <DayCalendar date={selectedDate} events={events} />
        )}
        {viewMode === "week" && (
          <WeekCalendar
            date={selectedDate}
            events={events}
            onSelectDate={(d) => {
              setSelectedDate(d);
              setViewMode("day");
            }}
          />
        )}
        {viewMode === "year" && <YearCalendar events={events} />}
      </View>

      {/* live transcript */}
      <ScrollView style={{ maxHeight: 60, marginTop: 8, borderWidth: 1, padding: 4 }}>
        <Text style={{ fontSize: 14 }}>{transcript}</Text>
      </ScrollView>

      {/* rolling log */}
      <ScrollView style={{ maxHeight: 120, marginTop: 8, borderWidth: 1, padding: 4 }}>
        {logLines.map((ln, i) => (
          <Text key={i} style={{ fontSize: 12 }}>{ln}</Text>
        ))}
      </ScrollView>
    </View>
  );
}
