"use server";

import { getCurrentAuditLogRequestData } from "@/lib/audit-log-request";
import { requireUser } from "@/lib/auth";
import { getWorkScheduleChangeLogs, type WorkSchedule, type WorkScheduleChangeLogFilters, type WorkScheduleChangeLogsResult } from "@/lib/work-schedules";
import { deleteWorkSchedule, saveWorkSchedule, WorkScheduleMutationError, type WorkScheduleBaseline } from "@/lib/work-schedule-mutations";
import { safelyRevalidateWorkSchedules } from "@/lib/work-schedule-cache";
import type { YouthActionResult } from "@/lib/youth-management-core";

export async function getWorkScheduleChangeLogsAction(filters: Pick<WorkScheduleChangeLogFilters, "actorId" | "page" | "scheduleDate">): Promise<YouthActionResult<{ changeLogResult: WorkScheduleChangeLogsResult }>> {
  await requireUser();
  return { ok: true, data: { changeLogResult: await getWorkScheduleChangeLogs(filters) } };
}
export async function saveWorkScheduleAction(scheduleDate: string, startMinute: number, endMinute: number, content: string, sourceScheduleDate = scheduleDate, sourceStartMinute = startMinute, baseline?: WorkScheduleBaseline): Promise<YouthActionResult<{ schedule: WorkSchedule | null }>> {
  const user = await requireUser();
  try {
    const result = await saveWorkSchedule({ actorId: user.id, requestData: await getCurrentAuditLogRequestData(), client: "web" }, { scheduleDate, startMinute, endMinute, content }, { scheduleDate: sourceScheduleDate, startMinute: sourceStartMinute, baseline });
    safelyRevalidateWorkSchedules(scheduleDate, sourceScheduleDate);
    return { ok: true, data: { schedule: result.schedule } };
  } catch (error) { if (error instanceof WorkScheduleMutationError) return { ok: false, error: error.message }; throw error; }
}
export async function deleteWorkScheduleAction(scheduleDate: string, startMinute: number, baseline?: WorkScheduleBaseline): Promise<YouthActionResult<{ scheduleDate: string; startMinute: number }>> {
  const user = await requireUser();
  try {
    await deleteWorkSchedule({ actorId: user.id, requestData: await getCurrentAuditLogRequestData(), client: "web" }, { scheduleDate, startMinute, baseline });
    safelyRevalidateWorkSchedules(scheduleDate);
    return { ok: true, data: { scheduleDate, startMinute } };
  } catch (error) { if (error instanceof WorkScheduleMutationError) return { ok: false, error: error.message }; throw error; }
}
