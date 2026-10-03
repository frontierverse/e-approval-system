import { useLocalSearchParams } from "expo-router";
import { WorkSchedulesScreen } from "@/components/work-schedules-screen";
import { scheduleDate } from "@/lib/schedules";
export default function WorkSchedulesRoute() {
  const { date, month } = useLocalSearchParams<{ date?: string | string[]; month?: string | string[] }>();
  return <WorkSchedulesScreen date={scheduleDate(date)} month={scheduleDate(month)} />;
}
