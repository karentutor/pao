/* ────────────────────────────────────────────────────────
   task.js – list, add task, voice navigation + listener UI
   ──────────────────────────────────────────────────────── */
import { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import { speak, stopSpeaking as stopTTS } from "../utils/tts";
import TaskList from "../components/TaskList";

const TASK_PATH = FileSystem.documentDirectory + "todo/tasks.json";

/* helper: load all tasks from storage */
const loadTasksFromFile = async () => {
  try {
    const raw = await FileSystem.readAsStringAsync(TASK_PATH);
    return JSON.parse(raw);
  } catch {
    return [];
  }
};

/* helper: persist tasks */
const saveTasksToFile = async (tasks) => {
  await FileSystem.writeAsStringAsync(TASK_PATH, JSON.stringify(tasks));
};

export default function TaskScreen() {
  const router      = useRouter();
  const isFocused   = useIsFocused();

  const [tasks, setTasks] = useState([]);
  const [newTitle, setNewTitle] = useState("");

  /* recogniser UI */
  const [recognizing, setRec] = useState(false);
  const [transcript,  setTx]  = useState("");

  /* refs */
  const navRef  = useRef(false);
  const running = useRef(false);
  const alive   = useRef(true);
  const lastErr = useRef(null);

  /* ---------- load tasks on mount ---------- */
  useEffect(() => {
    (async () => {
      setTasks(await loadTasksFromFile());
    })();
  }, []);

  /* ---------- save tasks whenever they change ---------- */
  useEffect(() => {
    saveTasksToFile(tasks);
  }, [tasks]);

  /* ---------- CRUD helpers ---------- */
  const addTask = () => {
    const title = newTitle.trim();
    if (!title) return;
    const t = {
      id: Date.now(),
      title,
      description: "",
      dueDate: new Date(),
      completed: false,
    };
    setTasks((prev) => [...prev, t]);
    setNewTitle("");
  };

  const toggleTask = (id) =>
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t))
    );

  const deleteTask = (id) =>
    setTasks((prev) => prev.filter((t) => t.id !== id));

  /* ---------- recogniser events ---------- */
  useSpeechRecognitionEvent("start", () => {
    if (!isFocused || running.current) return;
    running.current = true;
    lastErr.current = null;
    setRec(true);
    setTx("");
    navRef.current = false;
  });

  useSpeechRecognitionEvent("end", () => {
    if (!isFocused || !running.current) return;
    running.current = false;

    if (lastErr.current === "audio-capture") {
      setRec(false);
      lastErr.current = null;
      return;
    }

    setRec(false);
    setTimeout(() => {
      if (!alive.current) return;
      try {
        ExpoSpeechRecognitionModule.start({
          lang: "en-US",
          interimResults: true,
          continuous: true,
        });
      } catch {}
    }, 300);
  });

  useSpeechRecognitionEvent("error", (e) => {
    if (!isFocused || !running.current) return;
    lastErr.current = e.error;
  });

  /* ---------- voice commands ---------- */
  useSpeechRecognitionEvent("result", async (e) => {
    if (!isFocused || !running.current) return;
    const latest = e.results[0]?.transcript ?? "";
    setTx(latest);

    /* simple nav commands */
    if (!navRef.current && /calendar/i.test(latest)) {
      navRef.current = true;
      ExpoSpeechRecognitionModule.stop();
      setTx("");
      router.replace("/calendar");
      return;
    }

    if (!navRef.current && /\bmy\s+day\b/i.test(latest)) {
      navRef.current = true;
      ExpoSpeechRecognitionModule.stop();
      setTx("");
      router.replace("/my-day");
      return;
    }

    if (/^(exit|close)\b/i.test(latest)) {
      ExpoSpeechRecognitionModule.stop();
      Alert.alert("To exit, use the Exit button on other pages.");
    }
  });

  /* ---------- focus lifecycle ---------- */
  useFocusEffect(
    useCallback(() => {
      alive.current = true;

      (async () => {
        const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
        if (!perm.granted) {
          Alert.alert("Permission required", "Enable microphone");
          return;
        }

        /* start recogniser */
        ExpoSpeechRecognitionModule.start({
          lang: "en-US",
          interimResults: true,
          continuous: true,
        });
      })();

      return () => {
        alive.current   = false;
        running.current = false;
        ExpoSpeechRecognitionModule.stop();
        stopTTS();
      };
    }, [])
  );

  /* ---------- UI ---------- */
  return (
    <View style={{ flex: 1, padding: 16 }}>
      <ScrollView keyboardShouldPersistTaps="handled">
        {/* ADD TASK FORM */}
        <Text style={{ fontSize: 22, fontWeight: "600", marginBottom: 8 }}>
          Add Task
        </Text>
        <View style={{ flexDirection: "row", marginBottom: 10 }}>
          <TextInput
            value={newTitle}
            onChangeText={setNewTitle}
            placeholder="Task title"
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: "#ccc",
              borderRadius: 6,
              paddingHorizontal: 12,
              paddingVertical: 8,
              fontSize: 16,
            }}
            returnKeyType="done"
            onSubmitEditing={addTask}
          />
          <TouchableOpacity
            onPress={addTask}
            style={{
              marginLeft: 8,
              backgroundColor: "#34C759",
              borderRadius: 6,
              paddingHorizontal: 14,
              justifyContent: "center",
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "600" }}>Add</Text>
          </TouchableOpacity>
        </View>

        {/* LISTENING STATUS BOX */}
        <View
          style={{
            borderWidth: 1,
            borderColor: "#ccc",
            borderRadius: 8,
            padding: 12,
            backgroundColor: "#fafafa",
            marginBottom: 16,
          }}
        >
          <Text
            style={{
              fontSize: 18,
              fontWeight: "600",
              textAlign: "center",
              marginBottom: 4,
            }}
          >
            {recognizing
              ? "🔊 Listening… say 'calendar' or 'my day'"
              : "🤫 Not listening"}
          </Text>
          {transcript ? (
            <Text style={{ fontSize: 16, color: "#333" }}>{transcript}</Text>
          ) : null}
        </View>

        {/* TASK LIST */}
        <TaskList
          date={new Date()}
          tasks={tasks}
          onToggle={toggleTask}
          onDelete={deleteTask}
        />
      </ScrollView>
    </View>
  );
}
