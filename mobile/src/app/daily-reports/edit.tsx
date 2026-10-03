import { useLocalSearchParams } from "expo-router";
import { DailyReportEditor } from "@/components/daily-report-editor";
export default function DailyReportEditRoute() {
  const { date } = useLocalSearchParams<{ date?: string | string[] }>();
  return <DailyReportEditor date={Array.isArray(date) ? "invalid-date" : date} />;
}
