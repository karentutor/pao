import { View } from "react-native";
import { Calendar as BigCalendar } from "react-native-big-calendar";

export default function DayCalendar({ date }) {
  const events = [
    {
      title: "Demo event",
      start: date,
      end:   new Date(date.getTime() + 60 * 60 * 1000),
    },
  ];

  return (
    <View style={{ flex: 1 }}>
      <BigCalendar
        events={events}
        mode="day"
        date={date}     // ← show the selected date
        height={600}
      />
    </View>
  );
}
