import { CalendarList } from "react-native-calendars";

export default function YearCalendar() {
  return (
    <CalendarList
      pastScrollRange={0}
      futureScrollRange={11}    // show 12 months starting from current
      showScrollIndicator
      theme={{ todayTextColor: "#00adf5" }}
    />
  );
}
