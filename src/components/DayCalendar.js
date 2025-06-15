import React, { useMemo } from "react";
import { View, PanResponder } from "react-native";
import { Calendar as BigCalendar } from "react-native-big-calendar";

/**
 * @param {{
 *   date:   Date,
 *   events: { id:number,title:string,date:Date,durationMinutes:number }[],
 *   onChangeDate?:(d:Date)=>void,
 *   onPressEvent?:(id:number)=>void
 * }} props
 */
export default function DayCalendar({
  date,
  events,
  onChangeDate,
  onPressEvent,
}) {
  const mapped = events
    .filter((ev) => new Date(ev.date).toDateString() === date.toDateString())
    .map((ev) => ({
      title: ev.title,
      start: new Date(ev.date),
      end:   new Date(
        new Date(ev.date).getTime() + (ev.durationMinutes ?? 60) * 60000
      ),
      id: ev.id,
    }));

  /* horizontal swipe → ±1 day */
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) =>
          Math.abs(g.dx) > 20 && Math.abs(g.dy) < 20,
        onPanResponderRelease: (_, g) => {
          if (!onChangeDate) return;
          const delta = g.dx < -50 ? +1 : g.dx > 50 ? -1 : 0; // rtl = forward
          if (!delta) return;
          const next = new Date(date);
          next.setDate(date.getDate() + delta);
          onChangeDate(next);
        },
      }),
    [date, onChangeDate]
  );

  return (
    <View style={{ flex: 1 }} {...panResponder.panHandlers}>
      <BigCalendar
        events={mapped}
        mode="day"
        date={date}
        swipeEnabled={false} /* we page manually */
        height={600}
        onPressEvent={(evt) => onPressEvent?.(evt.id)}
      />
    </View>
  );
}
