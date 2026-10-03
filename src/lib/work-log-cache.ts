import "server-only";
import { revalidatePath } from "next/cache";
import { getSafeErrorDigest, logServerEvent } from "@/lib/observability";

export function revalidateWorkLogs() { revalidatePath("/work-schedule/work-log"); }
export function safelyRevalidateWorkLogs() {
  try { revalidateWorkLogs(); }
  catch (error) { logServerEvent("error", "work_log.cache_refresh_failed", { errorDigest: getSafeErrorDigest(error) }); }
}
