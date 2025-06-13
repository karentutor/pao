import { CalendarList } from "react-native-calendars";

/**
 * @param {{
 *   date: Date,
 *   onChangeDate?:(d:Date)=>void
 * }} props
 */
export default function YearCalendar({ date, onChangeDate }) {
  return (
    <CalendarList
      /** horizontal, one‑month pages */
      horizontal
      pagingEnabled
      /** start at the month containing `date` */
      current={date.toISOString().split("T")[0]}
      /** update parent when month changes */
      onVisibleMonthsChange={(ms) => {
        if (ms?.[0]?.dateString) onChangeDate?.(new Date(ms[0].dateString));
      }}
      pastScrollRange={12}
      futureScrollRange={12}
      showScrollIndicator
      theme={{ todayTextColor: "#00adf5" }}
    />
  );
}
