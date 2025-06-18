/* ──────────────────────────────────────────────────────────
   calendar.js – voice navigation + events (repeat support)
   ────────────────────────────────────────────────────────── */
import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { View, Text, Alert, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import * as FileSystem from "expo-file-system";
import { parse as chronoParse } from "chrono-node";
import attemptExit from "../utils/attemptExit";

import DayCalendar   from "../components/DayCalendar";
import WeekCalendar  from "../components/WeekCalendar";
import MonthCalendar from "../components/MonthCalendar";
import YearCalendar  from "../components/YearCalendar";
import AddEvent      from "../components/AddEvent";

/* ────────────────── header & listening line ────────────────── */
const CalendarHeader = ({ viewMode, onChangeView, monthLabel }) => {
  const modes = [
    ["day",   "Day"],
    ["week",  "Week"],
    ["month", "Month"],
    ["year",  "Year"],
  ];

  const Btn = ({ mode, label }) => (
    <TouchableOpacity
      key={mode}
      onPress={() => onChangeView(mode)}
      style={{
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 6,
        backgroundColor: viewMode === mode ? "#007AFF" : "#E5E5EA",
        marginRight: 6,
      }}
    >
      <Text style={{ color: viewMode === mode ? "#fff" : "#000" }}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 4,
      }}
    >
      <View style={{ flexDirection: "row" }}>
        {modes.map(([mode, label]) => (
          <Btn mode={mode} label={label} key={mode} />
        ))}
      </View>
      <Text style={{ fontSize: 18, fontWeight: "600" }}>{monthLabel}</Text>
    </View>
  );
};

const ListeningLine = ({ listening }) => (
  <Text style={{ marginBottom: 8, fontSize: 16 }}>
    {listening ? "🔊 Listening…" : "🤫 Mic off"}
  </Text>
);

/* ───────────────────────────────────────── */

const EVENTS_PATH = FileSystem.documentDirectory + "calendar/events.json";

async function ensureDir() {
  const dir = FileSystem.documentDirectory + "calendar";
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
}

/* ---------------- helpers ---------------- */
const datePlusDays = (base, n) => {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
};

const buildRepeats = (firstDate, freq, max = 12) => {
  if (freq === "none") return [];
  const items = [];
  for (let i = 1; i <= max; i++) {
    const d = new Date(firstDate);
    if (freq === "daily")   d.setDate(d.getDate() + i);
    if (freq === "weekly")  d.setDate(d.getDate() + i * 7);
    if (freq === "monthly") d.setMonth(d.getMonth() + i);
    items.push(d);
  }
  return items;
};

/* ───────────────────────────────────────── */

export default function Calendar() {
  const router     = useRouter();
  const isFocused  = useIsFocused();

  /* UI state */
  const [viewMode,      setViewMode]      = useState("week"); // default
  const [selectedDate,  setSelectedDate]  = useState(new Date());
  const [events,        setEvents]        = useState([]);
  const [recognizing,   setRecognizing]   = useState(false);

  /* refs */
  const aliveRef   = useRef(true);
  const runningRef = useRef(false);
  const lastErrRef = useRef(null);
  const switchTS   = useRef(0);           // debounce view changes

  /* month label (e.g. “June 2025”) */
  const monthLabel = useMemo(
    () =>
      selectedDate.toLocaleString("en-US", { month: "long", year: "numeric" }),
    [selectedDate]
  );

  /* ─── load & persist events ─── */
  useEffect(() => {
    (async () => {
      try {
        await ensureDir();
        const info = await FileSystem.getInfoAsync(EVENTS_PATH);
        if (info.exists) {
          setEvents(JSON.parse(await FileSystem.readAsStringAsync(EVENTS_PATH)));
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
        await FileSystem.writeAsStringAsync(EVENTS_PATH, JSON.stringify(events, null, 2));
      } catch (err) {
        console.warn("Failed to save events:", err);
      }
    })();
  }, [events]);

  /* ---------- recogniser helpers ---------- */
  const stopRec = () => {
    try { ExpoSpeechRecognitionModule.stop(); } catch {}
  };

  /* ─── speech callbacks ─── */
  useSpeechRecognitionEvent("start", () => {
    if (!isFocused || runningRef.current) return;
    runningRef.current = true;
    setRecognizing(true);
  });

  useSpeechRecognitionEvent("end", () => {
    if (!isFocused || !runningRef.current) return;
    runningRef.current = false;
    setRecognizing(false);

    if (lastErrRef.current === "audio-capture") { lastErrRef.current = null; return; }

    setTimeout(() => {
      if (!aliveRef.current) return;
      try {
        ExpoSpeechRecognitionModule.start({ lang: "en-US", interimResults: true, continuous: true });
      } catch {}
    }, 1000);
  });

  useSpeechRecognitionEvent("error", (e) => { lastErrRef.current = e.error; });

  useSpeechRecognitionEvent("result", (evt) => {
    if (!isFocused || !runningRef.current) return;
    const text   = evt.results?.[0]?.transcript?.toLowerCase() ?? "";
    const tokens = text.trim().split(/\s+/);

    /* exit */
    if (/^(exit|close)\b/.test(text)) { stopRec(); attemptExit(); return; }

    /* relative dates */
    if (!["add"].includes(viewMode)) {
      if (tokens.includes("today"))      setSelectedDate(new Date());
      if (tokens.includes("tomorrow"))   setSelectedDate(datePlusDays(selectedDate, 1));
      if (tokens.includes("yesterday"))  setSelectedDate(datePlusDays(selectedDate, -1));
    }

    /* add event wizard */
    if (tokens.includes("add") && tokens.includes("event") && viewMode !== "add") {
      stopRec(); setViewMode("add"); return;
    }

    /* view switch */
    const target = tokens.at(-1);
    if (["day", "week", "month", "year"].includes(target) && target !== viewMode) {
      const now = Date.now();
      if (now - switchTS.current > 800) { setViewMode(target); switchTS.current = now; }
    }
  });

  /* focus lifecycle */
  useFocusEffect(
    useCallback(() => {
      aliveRef.current = true;
      (async () => {
        const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
        if (!perm.granted) {
          Alert.alert("Permission required", "Enable microphone in Settings.");
          return;
        }
        ExpoSpeechRecognitionModule.start({ lang: "en-US", interimResults: true, continuous: true });
      })();
      return () => { aliveRef.current = false; runningRef.current = false; stopRec(); };
    }, [])
  );

  /* ---------- save handler ---------- */
  const saveEvent = useCallback((detail) => {
    const dateObj =
      chronoParse(`${detail.date} ${detail.time}`, new Date(), { forwardDate: true })[0]?.date?.() ??
      chronoParse(detail.date,                    new Date(), { forwardDate: true })[0]?.date?.() ??
      new Date();

    if (detail.time.trim() === "") dateObj.setHours(9, 0, 0, 0);

    const base = {
      id:        Date.now(),
      title:     detail.title || "Untitled",
      date:      dateObj,
      duration:  detail.duration ?? 60,
      repeat:    detail.frequency ?? "none",
      desc:      detail.description,
    };

    const repeats = buildRepeats(dateObj, base.repeat).map((d) => ({
      ...base,
      id: base.id + d.getTime(),
      date: d,
    }));

    setEvents((prev) => [...prev, base, ...repeats]);
    setSelectedDate(dateObj);
    setViewMode("week");
  }, []);

  /* ---------- wizards ---------- */
  if (viewMode === "add") {
    return (
      <AddEvent
        onSave={saveEvent}
        onCancel={() => { stopRec(); setViewMode("week"); }}
      />
    );
  }

  /* ---------- main UI ---------- */
  return (
    <View style={{ flex: 1, padding: 16 }}>
      <CalendarHeader
        viewMode={viewMode}
        onChangeView={setViewMode}
        monthLabel={monthLabel}
      />

      <ListeningLine listening={recognizing} />

      <View style={{ flex: 1 }}>
        {viewMode === "day"   && (
          <DayCalendar
            date={selectedDate}
            events={events}
            onChangeDate={setSelectedDate}
            onPressEvent={(id) => router.push(`/event/${id}`)}
          />
        )}
        {viewMode === "week"  && (
          <WeekCalendar
            date={selectedDate}
            events={events}
            onChangeDate={setSelectedDate}
            onSelectDate={(d) => { setSelectedDate(d); setViewMode("day"); }}
            onPressEvent={(id) => router.push(`/event/${id}`)}
          />
        )}
        {viewMode === "month" && (
          <MonthCalendar
            date={selectedDate}
            events={events}
            onChangeDate={setSelectedDate}
            onSelectDate={(d) => { setSelectedDate(d); setViewMode("day"); }}
            onPressEvent={(id) => router.push(`/event/${id}`)}
          />
        )}
        {viewMode === "year"  && (
          <YearCalendar
            date={selectedDate}
            onChangeDate={setSelectedDate}
          />
        )}
      </View>

      <TouchableOpacity
        onPress={() => setViewMode("add")}
        style={{
          alignSelf: "flex-start",
          padding: 12,
          backgroundColor: "#007AFF",
          borderRadius: 8,
          marginTop: 10,
        }}
      >
        <Text style={{ color: "#fff", fontWeight: "600" }}>＋ Add Event</Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => { stopRec(); attemptExit(); }}
        style={{
          alignSelf: "flex-start",
          padding: 12,
          backgroundColor: "#ff3b30",
          borderRadius: 8,
          marginTop: 8,
        }}
      >
        <Text style={{ color: "#fff", fontWeight: "600" }}>Exit</Text>
      </TouchableOpacity>
    </View>
  );
}
