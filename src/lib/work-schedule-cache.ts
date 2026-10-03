import "server-only";
import { revalidatePath } from "next/cache";
import { getWorkScheduleMonthFromDate } from "@/lib/work-schedule-calendar";
import { getSafeErrorDigest, logServerEvent } from "@/lib/observability";

export function safelyRevalidateWorkSchedules(...dates: string[]) {
  try {
    revalidatePath("/work-schedule");
    for (const month of new Set(dates.map(getWorkScheduleMonthFromDate))) revalidatePath(`/work-schedule?month=${month}`);
  } catch (error) { logServerEvent("error", "work_schedule.cache_invalidation_failed", { errorDigest: getSafeErrorDigest(error) }); }
}
