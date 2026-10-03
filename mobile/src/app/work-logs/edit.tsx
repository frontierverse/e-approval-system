import { useLocalSearchParams } from "expo-router";
import { WorkLogEditor } from "@/components/work-log-editor";
import { workLogDate } from "@/lib/work-logs";
export default function WorkLogEditRoute() { const { date } = useLocalSearchParams<{ date?: string | string[] }>(); return <WorkLogEditor date={workLogDate(date)} />; }
