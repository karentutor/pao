/* ──────────────────────────────────────────────────────────
   home.js – personalised greeting + today’s agenda + voice nav
   ────────────────────────────────────────────────────────── */
import { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  ScrollView,
  Text,
  Alert,
  TextInput,
  TouchableOpacity,
} from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import * as Speech from "expo-speech";

const speak = (t) =>
  new Promise((r) =>
    Speech.speak(t, { language: "en-US", onDone: r, onStopped: r, onError: r })
  );

const NAME_KEY = "userName";
const PATH_TASKS = FileSystem.documentDirectory + "todo/tasks.json";
const PATH_EVENTS = FileSystem.documentDirectory + "calendar/events.json";

/* ---------- Component ---------- */
export default function Home() {
  const router = useRouter();
  const isFocused = useIsFocused();

  /* user name */
  const [name, setName] = useState("");
  const [editingName, setEdit] = useState(false);
  const [nameInput, setNameInput] = useState("");

  /* recogniser UI */
  const [recognizing, setRec] = useState(false);
  const [transcript, setTx] = useState("");

  /* today’s items */
  const [tasksToday, setTasks] = useState([]);
  const [eventsToday, setEvents] = useState([]);

  /* misc refs */
  const navRef = useRef(false);
  const lastErr = useRef(null);
  const alive = useRef(true);
  const running = useRef(false);
  const greeted = useRef(false);

  /* ---------- load stored name once ---------- */
  useEffect(() => {
    (async () => {
      const saved = await AsyncStorage.getItem(NAME_KEY);
      if (saved) {
        setName(saved);
        setNameInput(saved);
      } else {
        setEdit(true);
      }
    })();
  }, []);

  /* ---------- load today's tasks & events ---------- */
  const loadAgenda = useCallback(async () => {
    const todayStr = new Date().toDateString();
    let tasks = [];
    let events = [];
    try {
      const raw = await FileSystem.readAsStringAsync(PATH_TASKS);
      tasks = JSON.parse(raw).filter(
        (t) => new Date(t.dueDate).toDateString() === todayStr
      );
    } catch {}
    try {
      const raw = await FileSystem.readAsStringAsync(PATH_EVENTS);
      events = JSON.parse(raw).filter(
        (e) => new Date(e.date).toDateString() === todayStr
      );
    } catch {}
    setTasks(tasks);
    setEvents(events);
    return { tasks, events };
  }, []);

  /* ---------- agenda reader ---------- */
  const readAgenda = useCallback(async () => {
    if (tasksToday.length === 0 && eventsToday.length === 0) {
      await speak("You have no tasks or events scheduled for today.");
      return;
    }
    if (tasksToday.length) {
      await speak(
        `Tasks: ${tasksToday.length}. ${tasksToday
          .map((t) => t.title)
          .join(", ")}.`
      );
    }
    if (eventsToday.length) {
      const lines = eventsToday.map((e) => {
        const d = new Date(e.date);
        const t = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        return `${t}: ${e.title}`;
      });
      await speak(`Events: ${eventsToday.length}. ${lines.join(", ")}.`);
    }
  }, [tasksToday, eventsToday]);

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

    /* "calendar" */
    if (!navRef.current && /calendar/i.test(latest)) {
      navRef.current = true;
      ExpoSpeechRecognitionModule.stop();
      setTx("");
      router.replace("/calendar");
      return;
    }

    /* "today's activities" */
    if (/today.?s?\s+activit/i.test(latest)) {
      ExpoSpeechRecognitionModule.stop();
      Speech.stop();
      await readAgenda();
      /* resume listening */
      if (alive.current) {
        try {
          ExpoSpeechRecognitionModule.start({
            lang: "en-US",
            interimResults: true,
            continuous: true,
          });
        } catch {}
      }
    }
  });

  /* ---------- focus lifecycle ---------- */
  useFocusEffect(
    useCallback(() => {
      alive.current = true;
      greeted.current = false;

      (async () => {
        const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
        if (!perm.granted) {
          Alert.alert("Permission required", "Enable microphone");
          return;
        }

        if (editingName) return;

        /* refresh today's agenda */
        const { tasks, events } = await loadAgenda();

        /* greeting */
        if (!greeted.current) {
          const msg = `Good morning${name ? ", " + name : ""}. You have ${
            tasks.length
          } task${tasks.length !== 1 ? "s" : ""} and ${events.length} event${
            events.length !== 1 ? "s" : ""
          } today. How may I help you?`;
          await speak(msg);
          greeted.current = true;
        }

        /* start recogniser */
        if (!alive.current) return;
        ExpoSpeechRecognitionModule.start({
          lang: "en-US",
          interimResults: true,
          continuous: true,
        });
      })();

      return () => {
        alive.current = false;
        running.current = false;
        ExpoSpeechRecognitionModule.stop();
        Speech.stop();
      };
    }, [name, editingName, loadAgenda])
  );

  /* ---------- name save ---------- */
  const saveName = async () => {
    const v = nameInput.trim();
    if (!v) return;
    await AsyncStorage.setItem(NAME_KEY, v);
    setName(v);
    setEdit(false);
    greeted.current = false; // force new greeting next focus
  };

  /* ---------- UI ---------- */
  const greetingLine = `Good morning${
    name ? ", " + name : ""
  }. You have ${tasksToday.length} task${
    tasksToday.length !== 1 ? "s" : ""
  } and ${eventsToday.length} event${
    eventsToday.length !== 1 ? "s" : ""
  } today. How may I help you?`;

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <ScrollView keyboardShouldPersistTaps="handled">
        {editingName ? (
          <>
            <Text style={{ fontSize: 22, fontWeight: "600", marginTop: 12 }}>
              Welcome! What is your name?
            </Text>

            <TextInput
              value={nameInput}
              onChangeText={setNameInput}
              placeholder="Enter your name"
              style={{
                marginTop: 16,
                borderWidth: 1,
                borderColor: "#ccc",
                borderRadius: 6,
                paddingHorizontal: 12,
                paddingVertical: 8,
                fontSize: 18,
              }}
              returnKeyType="done"
              onSubmitEditing={saveName}
            />

            <TouchableOpacity
              onPress={saveName}
              style={{
                marginTop: 12,
                padding: 12,
                backgroundColor: "#34c759",
                borderRadius: 8,
                alignSelf: "flex-start",
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "600" }}>Save name</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={{ fontSize: 22, fontWeight: "600", marginTop: 12 }}>
              {greetingLine}
            </Text>

            <TouchableOpacity
              onPress={() => {
                try {
                  ExpoSpeechRecognitionModule.stop();
                } catch {}
                setEdit(true);
              }}
              style={{
                marginTop: 8,
                paddingVertical: 4,
                paddingHorizontal: 10,
                borderWidth: 1,
                borderColor: "#007AFF",
                borderRadius: 6,
                alignSelf: "flex-start",
              }}
            >
              <Text style={{ color: "#007AFF" }}>Edit name</Text>
            </TouchableOpacity>
          </>
        )}

        {!editingName && (
          <>
            <Text style={{ fontSize: 18, marginVertical: 12 }}>
              {recognizing
                ? "🔊 Listening… say 'calendar' or 'today's activities'"
                : "🤫 Not listening"}
            </Text>
            <Text style={{ fontSize: 16 }}>{transcript}</Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}
