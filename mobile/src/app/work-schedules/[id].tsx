import { useLocalSearchParams } from "expo-router";
import { WorkScheduleDetailScreen } from "@/components/work-schedule-detail-screen";
import { scheduleDate } from "@/lib/schedules";
export default function WorkScheduleDetailRoute() { const params = useLocalSearchParams<{ id?: string | string[]; date?: string | string[] }>(); return <WorkScheduleDetailScreen id={scheduleDate(params.id) ?? ""} date={scheduleDate(params.date)} />; }
