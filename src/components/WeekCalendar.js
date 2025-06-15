import React, { useMemo } from "react";
import { View, PanResponder } from "react-native";
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

  /* helper: compare calendar weeks (ISO, Mon‑based) */
  const sameWeek = (a, b) => {
    const toMonday = (d) => {
      const n = new Date(d);
      const day = (n.getDay() + 6) % 7; // Mon=0 … Sun=6
      n.setDate(n.getDate() - day);
      n.setHours(0, 0, 0, 0);
      return n.getTime();
    };
    return toMonday(a) === toMonday(b);
  };

  /* horizontal swipe → ±7 days */
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) =>
          Math.abs(g.dx) > 20 && Math.abs(g.dy) < 20,
        onPanResponderRelease: (_, g) => {
          if (!onChangeDate) return;
          const deltaDays = g.dx < -50 ? +7 : g.dx > 50 ? -7 : 0; // rtl = forward
          if (!deltaDays) return;
          const next = new Date(date);
          next.setDate(date.getDate() + deltaDays);
          onChangeDate(next);
        },
      }),
    [date, onChangeDate]
  );

  return (
    <View style={{ flex: 1 }} {...panResponder.panHandlers}>
      <BigCalendar
        events={mapped}
        mode="week"
        date={date}                 /* initial anchor */
        weekStartsOn={1}            /* 0 = Sunday, 1 = Monday */
        swipeEnabled={false}        /* we page manually */
        height={600}
        onChangeDate={([start]) => {
          /* fire only when the visible week actually changed
             (e.g. via time‑scroll or programmatic jump) */
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
