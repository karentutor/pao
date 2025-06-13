/* ──────────────────────────────────────────────────────────
   calendar.js – voice navigation + events + tasks
   ────────────────────────────────────────────────────────── */
import { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  ScrollView,
  Text,
  Alert,
  TouchableOpacity,
} from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import * as FileSystem from "expo-file-system";
import { parse as chronoParse } from "chrono-node";

import DayCalendar   from "../components/DayCalendar";
import WeekCalendar  from "../components/WeekCalendar";
import YearCalendar  from "../components/YearCalendar";
import AddEvent      from "../components/AddEvent";
import AddTask       from "../components/AddTask";
import TaskList      from "../components/TaskList";

const EVENTS_PATH = FileSystem.documentDirectory + "calendar/events.json";
const TASKS_PATH  = FileSystem.documentDirectory + "calendar/tasks.json";

/* ensure `calendar/` directory exists */
async function ensureDir() {
  const dir = FileSystem.documentDirectory + "calendar";
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
}

/* ───────────────────────────────────────── */

export default function Calendar() {
  const router    = useRouter();
  const isFocused = useIsFocused();

  /* UI state */
  const [viewMode, setViewMode]         = useState("day");   // day | week | year | add | addTask
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [events, setEvents]             = useState([]);
  const [tasks,  setTasks]              = useState([]);
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

  /* ─── load / save ─── */
  useEffect(() => {
    (async () => {
      try {
        await ensureDir();

        const einfo = await FileSystem.getInfoAsync(EVENTS_PATH);
        if (einfo.exists) {
          const raw = await FileSystem.readAsStringAsync(EVENTS_PATH);
          setEvents(JSON.parse(raw));
        }

        const tinfo = await FileSystem.getInfoAsync(TASKS_PATH);
        if (tinfo.exists) {
          const rawT = await FileSystem.readAsStringAsync(TASKS_PATH);
          setTasks(JSON.parse(rawT));
        }
      } catch (err) {
        console.warn("Failed to load calendar data:", err);
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
        await FileSystem.writeAsStringAsync(
          TASKS_PATH,
          JSON.stringify(tasks, null, 2)
        );
      } catch (err) {
        console.warn("Failed to save calendar data:", err);
      }
    })();
  }, [events, tasks]);

  /* helper: push to rolling log + console */
  const log = (...args) => {
    const msg = args
      .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
      .join(" ");
    console.log(msg);
    setLogLines((prev) => [...prev.slice(-30), msg]);
  };

  /* stop recogniser safely */
  const haltRecognizer = () => {
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {}
  };

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
    const heardAddEvent = tokens.includes("add") && tokens.includes("event");
    if (heardAddEvent && viewMode !== "add") {
      log("📄 Switching to Add‑Event screen");
      haltRecognizer();
      setViewMode("add");
      return;
    }

    /* ADD TASK */
    const heardAddTask = tokens.includes("add") && tokens.includes("task");
    if (heardAddTask && viewMode !== "addTask") {
      log("📝 Switching to Add‑Task screen");
      haltRecognizer();
      setViewMode("addTask");
      return;
    }

    /* view switching (when not in Add‑Event / Add‑Task) */
    if (!["add", "addTask"].includes(viewMode)) {
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
        const perm =
          await ExpoSpeechRecognitionModule.requestPermissionsAsync();
        if (!perm.granted) {
          Alert.alert(
            "Permission required",
            "Enable microphone & speech recognition."
          );
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
        aliveRef.current = false;
        runningRef.current = false;
        haltRecognizer();
      };
    }, [])
  );

  /* ─── Helpers ─── */

  /* save event → state & disk, then show Week view */
  const handleSaveEvent = useCallback((detail) => {
    const dateTimeStr = `${detail.date} ${detail.time}`.trim();
    let dateObj =
      chronoParse(dateTimeStr, new Date(), { forwardDate: true })[0]?.date?.() ??
      chronoParse(detail.date, new Date(), { forwardDate: true })[0]?.date?.() ??
      new Date();

    if (detail.time.trim() === "") dateObj.setHours(9, 0, 0, 0);

    setEvents((prev) => [
      ...prev,
      {
        id: Date.now(),
        title: detail.title || "Untitled",
        date: dateObj,
        durationMinutes: detail.duration ?? 60,
        description: detail.description,
      },
    ]);

    setSelectedDate(dateObj);
    setViewMode("week");
  }, []);

  /* save task */
  const handleSaveTask = useCallback((detail) => {
    const due =
      chronoParse(detail.dueDate, new Date(), { forwardDate: true })[0]
        ?.date?.() ?? new Date();

    setTasks((prev) => [
      ...prev,
      {
        id: Date.now(),
        title: detail.title || "Untitled",
        description: detail.description,
        dueDate: due,
        completed: false,
      },
    ]);

    setViewMode("week");
  }, []);

  /* toggle completed */
  const toggleTask = useCallback((id) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t))
    );
  }, []);

  /* open event on tap */
  const openEvent = useCallback(
    (id) => {
      router.push(`/event/${id}`);
    },
    [router]
  );

  /* ─── Render alternate wizards ─── */
  if (viewMode === "add") {
    return <AddEvent onSave={handleSaveEvent} />;
  }
  if (viewMode === "addTask") {
    return <AddTask onSave={handleSaveTask} />;
  }

  /* ─── Main calendar UI ─── */
  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 16, marginBottom: 4 }}>
        {recognizing
          ? "🔊 Listening… say “day / week / year / add event / add task / home …”"
          : "🤫 Not listening"}
      </Text>

      {/* calendars */}
      <View style={{ flex: 1 }}>
        {viewMode === "day" && (
          <DayCalendar
            date={selectedDate}
            events={events}
            onChangeDate={setSelectedDate}
            onPressEvent={openEvent}
          />
        )}
        {viewMode === "week" && (
          <WeekCalendar
            date={selectedDate}
            events={events}
            onChangeDate={setSelectedDate}
            onSelectDate={(d) => {
              setSelectedDate(d);
              setViewMode("day");
            }}
            onPressEvent={openEvent}
          />
        )}
        {viewMode === "year" && (
          <YearCalendar
            date={selectedDate}
            onChangeDate={setSelectedDate}
          />
        )}
      </View>

      {/* live transcript */}
      {/* <ScrollView
        style={{ maxHeight: 60, marginTop: 8, borderWidth: 1, padding: 4 }}
      >
        <Text style={{ fontSize: 14 }}>{transcript}</Text>
      </ScrollView>

      {/* rolling log */}
      {/* <ScrollView
        style={{ maxHeight: 120, marginTop: 8, borderWidth: 1, padding: 4 }}
      >
        {logLines.map((ln, i) => (
          <Text key={i} style={{ fontSize: 12 }}>
            {ln}
          </Text>
        ))}
      </ScrollView>  */}

      {/* tasks section */}
      <Text
        style={{
          marginTop: 12,
          fontSize: 16,
          fontWeight: "600",
        }}
      >
        Tasks
      </Text>
      <TaskList date={selectedDate} tasks={tasks} onToggle={toggleTask} />

      {/* add task FAB */}
      <TouchableOpacity
        onPress={() => setViewMode("addTask")}
        style={{
          marginTop: 10,
          padding: 12,
          backgroundColor: "#34c759",
          borderRadius: 8,
          alignSelf: "flex-start",
        }}
      >
        <Text style={{ color: "white", fontWeight: "600" }}>＋ Add Task</Text>
      </TouchableOpacity>
    </View>
  );
}
