import { View, PanResponder } from "react-native";
import { Calendar as BigCalendar } from "react-native-big-calendar";

/*

* @param {{
 *   date:   Date,
 *   events: any[],
/** called when user swipes to a different week */  
/*   onChangeDate?:(d:Date)=>void,
 *   /** tap a day header -> go to Day view */  
/*   onSelectDate?:(d:Date)=>void,
 *   onPressEvent?:(id:number)=>void
 * }} props

 */
export default function WeekCalendar({
  date,
  events,
  onChangeDate,
  onSelectDate,
  onPressEvent,
}) {
  /* map data → BigCalendar shape */
  const mapped = events.map((ev) => ({
    title: ev.title,
    start: new Date(ev.date),
    end:   new Date(new Date(ev.date).getTime() + (ev.durationMinutes ?? 60) * 60000),
    id:    ev.id,
  }));

  /* ---------- swipe handler ---------- */
  const panResponder = PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) =>
      Math.abs(g.dx) > 20 && Math.abs(g.dy) < 20,          // horizontal only
    onPanResponderRelease: (_, g) => {
      if (!onChangeDate) return;
      const delta = g.dx < -50 ? -7 : g.dx > 50 ? +7 : 0;  // 7 days = 1 week
      if (!delta) return;
      const next = new Date(date);
      next.setDate(date.getDate() + delta);
      onChangeDate(next);
    },
  });

  return (
    <View style={{ flex: 1 }} {...panResponder.panHandlers}>
      <BigCalendar
        events={mapped}
        mode="week"
        date={date}
        weekStartsOn={1}
        height={600}
        onPressDateHeader={(d) => onSelectDate?.(d)}
        onPressEvent={(evt) => onPressEvent?.(evt.id)}
      />
    </View>
  );
}
