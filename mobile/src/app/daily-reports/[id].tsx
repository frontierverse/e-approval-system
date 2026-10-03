import { useLocalSearchParams } from "expo-router";
import { DailyReportDetailScreen } from "@/components/daily-report-detail-screen";
export default function DailyReportDetailRoute() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  return <DailyReportDetailScreen reportId={typeof id === "string" ? id : ""} />;
}
