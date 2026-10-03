import { useLocalSearchParams } from "expo-router";
import { WorkScheduleEditor } from "@/components/work-schedule-editor";
import { scheduleDate } from "@/lib/schedules";
export default function WorkScheduleEditRoute() { const params = useLocalSearchParams<{ id?: string | string[]; date?: string | string[] }>(); return <WorkScheduleEditor id={scheduleDate(params.id)} date={scheduleDate(params.date)} />; }
