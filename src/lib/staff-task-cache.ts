import "server-only";

import { revalidatePath } from "next/cache";

export function revalidateStaffTasks(deletedTaskId?: string) {
  revalidatePath("/work-schedule/work-log");
  revalidatePath("/");
  revalidatePath("/tasks");
  revalidatePath("/admin/tasks");
  revalidatePath("/tasks/[id]/history", "page");
  if (deletedTaskId) revalidatePath(`/tasks/${deletedTaskId}/history`);
}
