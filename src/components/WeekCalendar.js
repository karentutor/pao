// WeekCalendar.js
import React from "react";
import { View } from "react-native";
import { Calendar as BigCalendar } from "react-native-big-calendar";

/**
 * @param {{
 *   date:          Date,
 *   events:        any[],
 *   onChangeDate?: (d: Date) => void,
 *   onSelectDate?: (d: Date) => void,
 *   onPressEvent?: (id: number) => void,
 * }} props
 */
export default function WeekCalendar({
  date,
  events,
  onChangeDate,
  onSelectDate,
  onPressEvent,
}) {
  /* map your events → BigCalendar’s shape */
  const mapped = events.map((ev) => ({
    title: ev.title,
    start: new Date(ev.date),
    end:   new Date(
      new Date(ev.date).getTime() + (ev.durationMinutes ?? 60) * 60000
    ),
    id: ev.id,
  }));

  /* helper: compare two dates by **calendar week** (ISO, Mon‑based) */
  const sameWeek = (a, b) => {
    const toMonday = (d) => {
      const n = new Date(d);             // clone
      const day = (n.getDay() + 6) % 7;  // Mon = 0 … Sun = 6
      n.setDate(n.getDate() - day);
      n.setHours(0, 0, 0, 0);
      return n.getTime();
    };
    return toMonday(a) === toMonday(b);
  };

  return (
    <View style={{ flex: 1 }}>
      <BigCalendar
        events={mapped}
        mode="week"
        date={date}            /* anchor date (any day in the week) */
        weekStartsOn={1}       /* 0 = Sunday, 1 = Monday */
        swipeEnabled           /* ← / → changes week for us */
        height={600}
        onChangeDate={([start]) => {
          /* Fire only when the week actually changes */
          if (onChangeDate && !sameWeek(start, date)) {
            onChangeDate(start);
          }
        }}
        onPressDateHeader={(d) => onSelectDate?.(d)}
        onPressEvent={(evt) => onPressEvent?.(evt.id)}
      />
    </View>
  );
}
