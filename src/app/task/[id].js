/* ──────────────────────────────────────────────────────────
   task/[id].js – display + voice‑driven edit wizard + delete
   ────────────────────────────────────────────────────────── */
import { useEffect, useState, useRef, useCallback } from "react";
import { View, Text, TouchableOpacity, Alert } from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import * as FileSystem from "expo-file-system";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import * as Speech from "expo-speech";
import { parse as chronoParse } from "chrono-node";

/* ---------- persistence ---------- */
const PATH = FileSystem.documentDirectory + "todo/tasks.json";
const load  = async () => JSON.parse(await FileSystem.readAsStringAsync(PATH));
const save  = async (list) =>
  FileSystem.writeAsStringAsync(PATH, JSON.stringify(list, null, 2));

/* ---------- helpers ---------- */
const speak = (txt) =>
  new Promise((res) =>
    Speech.speak(txt, { language: "en-US", onDone: res, onStopped: res, onError: res })
  );

/* ---------- constants ---------- */
const fieldKeys = ["title", "description", "dueDate"];
const prompts   = [
  "Please say the task title.",
  "Describe the task.",
  "What is the due date?",
];
const SILENCE_MS = 1500;

/* ──────────────────────────────────────────────────────────
   Component
   ────────────────────────────────────────────────────────── */
export default function TaskDetails() {
  const { id } = useLocalSearchParams();
  const router = useRouter();

  /* task record */
  const [task, setTask] = useState(null);

  /* wizard state */
  const [editing, setEditing] = useState(false);
  const [step, setStep]       = useState(0);         // 0‑2 fields, 3 confirm
  const [draft, setDraft]     = useState(null);

  /* live UI */
  const [live, setLive]       = useState("");
  const [listening, setListening] = useState(false);

  /* refs */
  const bufRef   = useRef("");
  const tmrRef   = useRef(null);
  const recogOK  = useRef(false);
  const gate     = useRef(false);
  const aliveRef = useRef(true);

  /* ---------- speech helpers ---------- */
  const stopRecog = useCallback(() => {
    clearTimeout(tmrRef.current);
    try { ExpoSpeechRecognitionModule.stop(); } catch {}
    setListening(false);
  }, []);

  const startRecog = useCallback(() => {
    recogOK.current = false;
    ExpoSpeechRecognitionModule.start({
      lang: "en-US",
      interimResults: true,
      continuous: true,
    });
    setListening(true);
  }, []);

  /* ---------- load task ---------- */
  useEffect(() => {
    (async () => {
      try {
        const list = await load();
        setTask(list.find((t) => String(t.id) === String(id)));
      } catch {}
    })();
  }, [id]);

  /* ---------- recogniser lifecycle ---------- */
  useEffect(() => {
    (async () => {
      const p = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (p.granted) startRecog();
    })();
    return () => { aliveRef.current = false; stopRecog(); };
  }, [startRecog, stopRecog]);

  useSpeechRecognitionEvent("start", () => { recogOK.current = true; });
  useSpeechRecognitionEvent("end",   () => { recogOK.current = false; setListening(false); });

  /* ---------- global voice shortcuts ---------- */
  useSpeechRecognitionEvent("result", (evt) => {
    if (editing) return;
    const spoken = (evt.results?.[0]?.transcript ?? evt.value ?? "").trim().toLowerCase();
    if (spoken.includes("back")) router.back();
    if (spoken.includes("edit") && spoken.includes("task")) beginEdit();
    if (spoken.includes("delete") || spoken.includes("remove")) confirmDelete();
  });

  /* ---------- wizard driver ---------- */
  useEffect(() => {
    if (!editing || step > 3) return;
    let cancelled = false;

    (async () => {
      /* step 0‑2 – ask question */
      if (step <= 2) {
        stopRecog();
        await speak(prompts[step]);
        if (cancelled || !aliveRef.current) return;

        startRecog();
        while (!recogOK.current && !cancelled && aliveRef.current) {
          await new Promise((r) => setTimeout(r, 50));
        }
        if (cancelled || !aliveRef.current) return;
        gate.current = true;
        return;
      }

      /* step 3 – confirmation */
      if (step === 3) {
        stopRecog();
        const summary =
          `You said: Title ${draft.title}. `
        + `Description ${draft.description}. `
        + `Due ${draft.dueDate}. If this is correct, say Save or Yes. Otherwise say No.`;
        await speak(summary);
        if (cancelled || !aliveRef.current) return;

        startRecog();
        while (!recogOK.current && !cancelled && aliveRef.current) {
          await new Promise((r) => setTimeout(r, 50));
        }
        if (cancelled || !aliveRef.current) return;
        gate.current = true;
      }
    })();

    return () => { cancelled = true; };
  }, [editing, step, startRecog, stopRecog]);

  /* ---------- commit buffer helper ---------- */
  const commitField = useCallback(() => {
    const clean = bufRef.current.trim();
    if (clean) {
      const key = fieldKeys[step];
      setDraft((d) => ({ ...d, [key]: clean }));
    }
    bufRef.current = "";
    setLive("");
    gate.current = false;
    setStep((s) => s + 1);
  }, [step]);

  /* ---------- wizard speech handler ---------- */
  useSpeechRecognitionEvent("result", async (evt) => {
    if (!editing || !gate.current) return;

    const res   = evt.results?.[evt.resultIndex ?? 0] ?? {};
    const txt   = res.transcript ?? evt.value ?? "";
    const final = res.isFinal ?? false;
    if (!txt) return;

    /* step 3 – confirmation */
    if (step === 3) {
      if (/^(?:yes|save)\b/i.test(txt)) {
        stopRecog(); gate.current = false;
        await commitChanges();
        return;
      }
      if (/^no\b/i.test(txt)) {
        stopRecog(); gate.current = false;
        await speak("Okay, let's start again.");
        setStep(0);
        return;
      }
      return;
    }

    /* collecting steps 0‑2 */
    if (txt !== bufRef.current) { bufRef.current = txt; setLive(txt); }
    clearTimeout(tmrRef.current);
    tmrRef.current = setTimeout(() => { stopRecog(); commitField(); }, SILENCE_MS);
    if (final) { stopRecog(); commitField(); }
  });

  /* ---------- begin edit ---------- */
  function beginEdit() {
    if (!task) return;
    setDraft({
      title: task.title,
      description: task.description,
      dueDate: new Date(task.dueDate).toLocaleDateString(),
    });
    setEditing(true);
    setStep(0);
  }

  /* ---------- cancel edit ---------- */
  const cancelEdit = () => {
    gate.current = false;
    setEditing(false);
    stopRecog();
  };

  /* ---------- save / update ---------- */
  async function commitChanges() {
    gate.current = false;

    /* merge & parse */
    const due =
      chronoParse(draft.dueDate, new Date(), { forwardDate: true })[0]?.date?.()
      ?? new Date(task.dueDate);

    const updated = { ...task, ...draft, dueDate: due };

    /* save list */
    const list = await load();
    const idx  = list.findIndex((t) => t.id === task.id);
    if (idx >= 0) {
      list[idx] = updated;
      await save(list);
      setTask(updated);
    }
    setEditing(false);
    await speak("Task updated.");
    startRecog();
  }

  /* ---------- delete ---------- */
  async function deleteTask() {
    const list = await load();
    const remaining = list.filter((t) => t.id !== task.id);
    await save(remaining);
    await speak("Task deleted.");
    router.back();
  }
  const confirmDelete = () =>
    Alert.alert("Delete task", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: deleteTask },
    ]);

  /* ---------- render ---------- */
  if (!task) {
    return (
      <View style={{ padding: 20 }}>
        <Text>Loading…</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, padding: 20 }}>
      <Stack.Screen
        options={{
          title: task.title,
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()} style={{ paddingHorizontal: 10 }}>
              <Text style={{ fontSize: 18 }}>← Back</Text>
            </TouchableOpacity>
          ),
        }}
      />

      {/* Cancel button – only when editing */}
      {editing && (
        <TouchableOpacity
          onPress={cancelEdit}
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            backgroundColor: "#ff3b30",
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 6,
          }}
        >
          <Text style={{ color: "#fff" }}>Cancel</Text>
        </TouchableOpacity>
      )}

      <Text style={{ fontSize: 24, marginBottom: 12 }}>{task.title}</Text>
      <Text>Description: {task.description}</Text>
      <Text>Due: {new Date(task.dueDate).toLocaleDateString()}</Text>

      {/* action buttons */}
      <TouchableOpacity
        onPress={beginEdit}
        style={{
          marginTop: 24,
          padding: 12,
          backgroundColor: "#34c759",
          borderRadius: 8,
          alignSelf: "flex-start",
        }}
      >
        <Text style={{ color: "white", fontWeight: "600" }}>Edit task</Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={confirmDelete}
        style={{
          marginTop: 12,
          padding: 12,
          backgroundColor: "#ff3b30",
          borderRadius: 8,
          alignSelf: "flex-start",
        }}
      >
        <Text style={{ color: "white", fontWeight: "600" }}>Delete task</Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => router.back()}
        style={{
          marginTop: 12,
          padding: 12,
          backgroundColor: "#007AFF",
          borderRadius: 8,
          alignSelf: "flex-start",
        }}
      >
        <Text style={{ color: "white" }}>Back to list</Text>
      </TouchableOpacity>

      {editing && (
        <Text style={{ marginTop: 20, fontStyle: "italic" }}>
          {listening ? `🎙 ${live}` : `🎤 ${prompts[Math.min(step, 2)]}`}
        </Text>
      )}
    </View>
  );
}
