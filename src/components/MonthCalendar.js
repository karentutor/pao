// MonthCalendar.js
import React from "react";
import { View } from "react-native";
import { Calendar as BigCalendar } from "react-native-big-calendar";

/**
 * @param {{
 *   date:          Date,
 *   events:        any[],
 *   onChangeDate?: (d: Date) => void,   // fires when user pages ← / →
 *   onSelectDate?: (d: Date) => void,   // tap any day cell
 *   onPressEvent?: (id: number) => void // tap a specific event
 * }} props
 */
export default function MonthCalendar({
  date,
  events,
  onChangeDate,
  onSelectDate,
  onPressEvent,
}) {
  /* transform your event objects → BigCalendar objects */
  const mapped = events.map((ev) => ({
    title: ev.title,
    start: new Date(ev.date),
    end:   new Date(
      new Date(ev.date).getTime() + (ev.durationMinutes ?? 60) * 60000
    ),
    id: ev.id,
  }));

  /* helper: same calendar month? */
  const sameMonth = (a, b) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();

  return (
    <View style={{ flex: 1 }}>
      <BigCalendar
        events={mapped}
        mode="month"
        swipeEnabled          /* horizontal paging between months */
        weekStartsOn={1}      /* 0 = Sunday, 1 = Monday */
        date={date}           /* any day inside the current month */
        height={600}
        onChangeDate={([start]) => {
          /* only forward when the *month* really changes
             to avoid infinite setState loops */
          if (onChangeDate && !sameMonth(start, date)) {
            onChangeDate(start);
          }
        }}
        onPressCell={(d) => onSelectDate?.(d)}   /* day cell tap */
        onPressEvent={(evt) => onPressEvent?.(evt.id)}
      />
    </View>
  );
}
