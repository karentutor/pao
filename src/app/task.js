/* ──────────────────────────────────────────────────────────
   task.js – dedicated My Tasks screen (voice + sorting)
   ────────────────────────────────────────────────────────── */
import { useState, useRef, useCallback, useEffect } from "react";
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

import AddTask  from "../components/AddTask";
import TaskList from "../components/TaskList";

const TASKS_PATH = FileSystem.documentDirectory + "calendar/tasks.json";

async function ensureDir() {
  const dir = FileSystem.documentDirectory + "calendar";
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
}

const buildRepeats = (first, freq, max = 12) => {
  if (freq === "none") return [];
  const out = [];
  for (let i = 1; i <= max; i++) {
    const d = new Date(first);
    if (freq === "daily")   d.setDate(d.getDate() + i);
    if (freq === "weekly")  d.setDate(d.getDate() + i * 7);
    if (freq === "monthly") d.setMonth(d.getMonth() + i);
    out.push(d);
  }
  return out;
};

const sortByDate = (arr) =>
  [...arr].sort(
    (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
  );

export default function TaskScreen() {
  const router    = useRouter();
  const isFocused = useIsFocused();

  const [mode,   setMode]   = useState("list");
  const [tasks,  setTasks]  = useState([]);
  const [listen, setListen] = useState(false);

  const alive   = useRef(true);
  const running = useRef(false);
  const lastErr = useRef(null);

  /* load & persist */
  useEffect(() => {
    (async () => {
      try {
        await ensureDir();
        const info = await FileSystem.getInfoAsync(TASKS_PATH);
        if (info.exists) {
          const raw = await FileSystem.readAsStringAsync(TASKS_PATH);
          setTasks(sortByDate(JSON.parse(raw)));
        }
      } catch (err) {
        console.warn("Failed to load tasks:", err);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await ensureDir();
        await FileSystem.writeAsStringAsync(
          TASKS_PATH,
          JSON.stringify(tasks, null, 2)
        );
      } catch (err) {
        console.warn("Failed to save tasks:", err);
      }
    })();
  }, [tasks]);

  const stopRec = () => { try { ExpoSpeechRecognitionModule.stop(); } catch {} };

  useSpeechRecognitionEvent("start", () => {
    if (!isFocused || running.current) return;
    running.current = true;
    setListen(true);
  });

  useSpeechRecognitionEvent("end", () => {
    if (!isFocused || !running.current) return;
    running.current = false;
    setListen(false);

    if (lastErr.current === "audio-capture") { lastErr.current = null; return; }

    setTimeout(() => {
      if (!alive.current) return;
      try {
        ExpoSpeechRecognitionModule.start({ lang: "en-US", interimResults: true, continuous: true });
      } catch {}
    }, 1000);
  });

  useSpeechRecognitionEvent("error", (e) => { lastErr.current = e.error; });

  useSpeechRecognitionEvent("result", (evt) => {
    if (!isFocused || !running.current) return;
    const text = evt.results?.[0]?.transcript?.toLowerCase() ?? "";

    if (/^(exit|close)\b/.test(text)) { stopRec(); attemptExit(); return; }
    if (text.includes("add") && text.includes("task") && mode !== "add") {
      stopRec(); setMode("add");
    }
  });

  useFocusEffect(
    useCallback(() => {
      alive.current = true;
      (async () => {
        const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
        if (!perm.granted) {
          Alert.alert("Permission required", "Enable microphone access.");
          return;
        }
        ExpoSpeechRecognitionModule.start({ lang: "en-US", interimResults: true, continuous: true });
      })();
      return () => { alive.current = false; running.current = false; stopRec(); };
    }, [])
  );

  const saveTask = useCallback((detail) => {
    const due =
      chronoParse(detail.dueDate, new Date(), { forwardDate: true })[0]?.date?.() ??
      new Date();

    const base = {
      id: Date.now(),
      title: detail.title || "Untitled",
      description: detail.description,
      dueDate: due,
      completed: false,
      repeat: detail.frequency ?? "none",
    };

    const repeats = buildRepeats(due, base.repeat).map((d) => ({
      ...base,
      id: base.id + d.getTime(),
      dueDate: d,
    }));

    setTasks((prev) => sortByDate([...prev, base, ...repeats]));
    setMode("list");
  }, []);

  const toggleTask = (id) =>
    setTasks((prev) =>
      sortByDate(
        prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t))
      )
    );

  const deleteTask = (id) =>
    setTasks((prev) => sortByDate(prev.filter((t) => t.id !== id)));

  if (mode === "add") {
    return (
      <AddTask
        onSave={saveTask}
        onCancel={() => { stopRec(); setMode("list"); }}
      />
    );
  }

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 22, fontWeight: "600", marginBottom: 4 }}>
        My Tasks
      </Text>
      <Text style={{ marginBottom: 8, fontSize: 16 }}>
        {listen ? "🔊 Listening…" : "🤫 Mic off"}
      </Text>

      <TaskList tasks={tasks} onToggle={toggleTask} onDelete={deleteTask} />

      <TouchableOpacity
        onPress={() => setMode("add")}
        style={{
          alignSelf: "flex-start",
          padding: 12,
          backgroundColor: "#34c759",
          borderRadius: 8,
          marginTop: 12,
        }}
      >
        <Text style={{ color: "#fff", fontWeight: "600" }}>＋ Add Task</Text>
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
