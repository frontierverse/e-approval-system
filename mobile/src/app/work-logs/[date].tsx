import { useLocalSearchParams } from "expo-router";
import { WorkLogDetailScreen } from "@/components/work-log-detail-screen";
import { workLogDate } from "@/lib/work-logs";
export default function WorkLogDetailRoute() { const { date } = useLocalSearchParams<{ date?: string | string[] }>(); return <WorkLogDetailScreen date={workLogDate(date) ?? "invalid-date"} />; }
