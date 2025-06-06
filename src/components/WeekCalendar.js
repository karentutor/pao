import { View } from "react-native";
import { Calendar as BigCalendar } from "react-native-big-calendar";

/**
 * @param {{ date: Date, onSelectDate: (date: Date) => void }} props
 */
export default function WeekCalendar({ date, onSelectDate }) {
  const events = [
    {
      title: "Demo event",
      start: date,
      end:   new Date(date.getTime() + 2 * 60 * 60 * 1000),
    },
  ];

  return (
    <View style={{ flex: 1 }}>
      <BigCalendar
        events={events}
        mode="week"
        date={date}
        weekStartsOn={1}
        height={600}
        /* when the user taps a header cell (Mon 2, Tue 3, …) */
        onPressDateHeader={(d) => onSelectDate?.(d)}
      />
    </View>
  );
}
