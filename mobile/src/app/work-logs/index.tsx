import { useLocalSearchParams } from "expo-router";
import { WorkLogsScreen } from "@/components/work-logs-screen";
import { workLogDate } from "@/lib/work-logs";
export default function WorkLogsRoute() { const { date } = useLocalSearchParams<{ date?: string | string[] }>(); return <WorkLogsScreen date={workLogDate(date)} />; }
