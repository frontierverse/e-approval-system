import { useLocalSearchParams } from "expo-router";
import { WorkScheduleHistoryScreen } from "@/components/work-schedule-history-screen";
import { scheduleDate } from "@/lib/schedules";
export default function WorkScheduleHistoryRoute() { const params = useLocalSearchParams<{ date?: string | string[] }>(); return <WorkScheduleHistoryScreen date={scheduleDate(params.date)} />; }
