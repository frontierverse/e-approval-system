import { useLocalSearchParams } from "expo-router";
import { TaskDetailScreen } from "@/components/task-detail-screen";
import { taskPage } from "@/lib/tasks";
export default function TaskDetail() {
  const { id, page, notice, assigned } = useLocalSearchParams<{ id: string; page?: string; notice?: string; assigned?: string }>();
  return <TaskDetailScreen taskId={id} page={taskPage(page)} created={notice === "created"} assigned={assigned === "1"} />;
}
