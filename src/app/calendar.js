/* ──────────────────────────────────────────────────────────
   calendar.js – voice navigation + events + tasks
   ────────────────────────────────────────────────────────── */
import { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
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

async function ensureDir() {
  const dir = FileSystem.documentDirectory + "calendar";
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
}

/* ───────────────────────────────────────── */

export default function Calendar() {
  const router    = useRouter();
  const isFocused = useIsFocused();

  /* UI state */
  const [viewMode, setViewMode]         = useState("day");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [events, setEvents]             = useState([]);
  const [tasks,  setTasks]              = useState([]);
  const [recognizing, setRecognizing]   = useState(false);

  /* refs */
  const aliveRef            = useRef(true);
  const runningRef          = useRef(false);
  const lastErrorRef        = useRef(null);
  const lastSwitchRef       = useRef(0);
  const hasNavigatedHomeRef = useRef(false);

  /* ─── load / save ─── */
  useEffect(() => {
    (async () => {
      try {
        await ensureDir();
        const einfo = await FileSystem.getInfoAsync(EVENTS_PATH);
        if (einfo.exists) {
          setEvents(JSON.parse(await FileSystem.readAsStringAsync(EVENTS_PATH)));
        }
        const tinfo = await FileSystem.getInfoAsync(TASKS_PATH);
        if (tinfo.exists) {
          setTasks(JSON.parse(await FileSystem.readAsStringAsync(TASKS_PATH)));
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
        await FileSystem.writeAsStringAsync(EVENTS_PATH, JSON.stringify(events, null, 2));
        await FileSystem.writeAsStringAsync(TASKS_PATH , JSON.stringify(tasks , null, 2));
      } catch (err) {
        console.warn("Failed to save calendar data:", err);
      }
    })();
  }, [events, tasks]);

  /* stop recogniser safely */
  const haltRecognizer = () => { try { ExpoSpeechRecognitionModule.stop(); } catch {} };

  /* ───────────────── speech callbacks ───────────────── */

  useSpeechRecognitionEvent("start", () => {
    if (!isFocused || runningRef.current) return;
    runningRef.current = true;
    setRecognizing(true);
  });

  useSpeechRecognitionEvent("end", () => {
    if (!isFocused || !runningRef.current) return;
    runningRef.current = false;
    setRecognizing(false);
    if (lastErrorRef.current === "audio-capture") { lastErrorRef.current = null; return; }
    setTimeout(() => {
      if (!aliveRef.current) return;
      try {
        ExpoSpeechRecognitionModule.start({ lang:"en-US", interimResults:true, continuous:true });
      } catch {}
    }, 1200);
  });

  useSpeechRecognitionEvent("result", (evt) => {
    if (!isFocused || !runningRef.current) return;

    const text = evt.results?.[0]?.transcript ?? evt.value ?? "";
    const tokens = text.toLowerCase().trim().split(/\s+/);

    /* date navigation keywords ------------------------------------------------ */
    if (!["add","addTask"].includes(viewMode)) {
      if (tokens.includes("today"))      setSelectedDate(new Date());
      if (tokens.includes("tomorrow"))   setSelectedDate(datePlusDays(1));
      if (tokens.includes("yesterday"))  setSelectedDate(datePlusDays(-1));
    }

    /* switch views / wizards -------------------------------------------------- */
    if (tokens.includes("add") && (tokens.includes("event") || tokens.includes("desk"))) {
      if (viewMode !== "add") { haltRecognizer(); setViewMode("add"); }
      return;
    }
    if (tokens.includes("add") && tokens.includes("task")) {
      if (viewMode !== "addTask") { haltRecognizer(); setViewMode("addTask"); }
      return;
    }

    if (!["add","addTask"].includes(viewMode)) {
      const last = tokens.at(-1);
      const target = ["day","week","year"].includes(last) ? last : null;
      const now = Date.now();
      if (target && target!==viewMode && now-lastSwitchRef.current>1000) {
        setViewMode(target); lastSwitchRef.current=now;
      }
    }
  });

  useSpeechRecognitionEvent("error", e => { lastErrorRef.current = e.error; });

  /* focus lifecycle */
  useFocusEffect(useCallback(() => {
    aliveRef.current = true;
    (async () => {
      const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission required", "Enable microphone access");
        return;
      }
      ExpoSpeechRecognitionModule.start({ lang:"en-US", interimResults:true, continuous:true });
    })();
    return () => { aliveRef.current=false; runningRef.current=false; haltRecognizer(); };
  }, []));

  /* ---------------- helpers ---------------- */
  const datePlusDays = (n) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate()+n); return d;
  };

  const handleSaveEvent = useCallback((detail) => {
    const dateObj =
      chronoParse(`${detail.date} ${detail.time}`, new Date(), { forwardDate:true })[0]?.date?.()
      ?? chronoParse(detail.date, new Date(), { forwardDate:true })[0]?.date?.()
      ?? new Date();
    if (detail.time.trim()==="") dateObj.setHours(9,0,0,0);

    setEvents(prev=>[...prev,{
      id:Date.now(), title:detail.title||"Untitled", date:dateObj,
      durationMinutes:detail.duration??60, description:detail.description,
    }]);
    setSelectedDate(dateObj); setViewMode("week");
  }, []);

  const handleSaveTask = useCallback((detail)=>{
    const due = chronoParse(detail.dueDate,new Date(),{forwardDate:true})[0]?.date?.() ?? new Date();
    setTasks(prev=>[...prev,{ id:Date.now(), title:detail.title||"Untitled",
      description:detail.description, dueDate:due, completed:false }]);
    setViewMode("week");
  },[]);

  const toggleTask = useCallback(id=>{
    setTasks(prev=>prev.map(t=>t.id===id?{...t,completed:!t.completed}:t));
  },[]);

  const deleteTask = useCallback(id=>{
    setTasks(prev=>prev.filter(t=>t.id!==id));
  },[]);

  const openEvent = id => router.push(`/event/${id}`);

  /* render wizards */
  if (viewMode==="add")      return <AddEvent onSave={handleSaveEvent}/>;
  if (viewMode==="addTask")  return <AddTask onSave={handleSaveTask}/>;

  /* ---------------- UI ---------------- */
  return (
    <View style={{ flex:1, padding:16 }}>
      <Text style={{ fontSize:16, marginBottom:4 }}>
        {recognizing ? "🔊 Listening…" : "🤫 Mic off"}
      </Text>

      {/* calendars */}
      <View style={{ flex:1 }}>
        {viewMode==="day" && (
          <DayCalendar
            date={selectedDate}
            events={events}
            onChangeDate={setSelectedDate}
            onPressEvent={openEvent}
          />
        )}
        {viewMode==="week" && (
          <WeekCalendar
            date={selectedDate}
            events={events}
            onChangeDate={setSelectedDate}
            onSelectDate={d=>{ setSelectedDate(d); setViewMode("day"); }}
            onPressEvent={openEvent}
          />
        )}
        {viewMode==="year" && (
          <YearCalendar date={selectedDate} onChangeDate={setSelectedDate}/>
        )}
      </View>

      {/* tasks */}
      <Text style={{ marginTop:12, fontSize:16, fontWeight:"600" }}>Tasks</Text>
      <TaskList
        date={selectedDate}
        tasks={tasks}
        onToggle={toggleTask}
        onDelete={deleteTask}
      />

      {/* action buttons */}
      <View style={{ flexDirection:"row", marginTop:10 }}>
        <TouchableOpacity
          onPress={()=>setViewMode("addTask")}
          style={{ padding:12, backgroundColor:"#34c759", borderRadius:8, marginRight:8 }}
        >
          <Text style={{ color:"#fff", fontWeight:"600" }}>＋ Add Task</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={()=>setViewMode("add")}
          style={{ padding:12, backgroundColor:"#007AFF", borderRadius:8 }}
        >
          <Text style={{ color:"#fff", fontWeight:"600" }}>＋ Add Event</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
