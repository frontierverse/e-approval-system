"use server";
import { assertYouthWebActor, youthActivityFailure, type YouthActivityResult } from "@/lib/youth-activity-web-core";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getCurrentAuditLogRequestData } from "@/lib/audit-log-request";
import { requireYouthBasicAccess, requireYouthPermission } from "@/lib/youth-permissions";
import { mutateWebCommonSchedules } from "@/lib/youth-mobile-schedules";
import type { CommonBaseline } from "@/lib/youth-mobile-activity-core";
import { getYouthCommonScheduleChangeLogs, type YouthCommonScheduleChangeLogsResult } from "@/lib/youth-common-schedules";
import { isYouthCommonScheduleWeekday, normalizeYouthCommonScheduleWeekdays, type YouthActionResult, type YouthCommonSchedule, type YouthCommonScheduleChangeLogFilters, type YouthLearningScheduleWeekday } from "@/lib/youth-management-core";
const commonSchedulePath = "/youth/common-schedule";
export async function getYouthCommonScheduleChangeLogsAction(
  filters: Pick<
    YouthCommonScheduleChangeLogFilters,
    "actorId" | "page" | "weekday"
  >,
): Promise<
  YouthActionResult<{ changeLogResult: YouthCommonScheduleChangeLogsResult }>
> {
  await requireYouthBasicAccess();
  const changeLogResult = await getYouthCommonScheduleChangeLogs({
    actorId: filters.actorId,
    page: filters.page,
    weekday: filters.weekday,
  });

  return {
    ok: true,
    data: {
      changeLogResult,
    },
  };
}


export async function saveYouthCommonScheduleAction(weekday: number, startMinute: number, endMinute: number, content: string, recurrenceWeekdaysOrSourceStartMinute: number[] | number = [weekday], maybeSourceStartMinute?: number, baseline?: { requestId?: string; expectedActorId?: string; baselines: CommonBaseline[] }): Promise<YouthActivityResult<{ schedules: YouthCommonSchedule[]; sourceStartMinute: number; targetWeekdays: YouthLearningScheduleWeekday[] }>> {
  try {
  const user = await requireYouthPermission("canManageYouth");
  if (!isYouthCommonScheduleWeekday(weekday)) return { ok: false, error: "요일을 다시 선택하세요." };
  const sourceStartMinute = Array.isArray(recurrenceWeekdaysOrSourceStartMinute) ? (maybeSourceStartMinute ?? startMinute) : recurrenceWeekdaysOrSourceStartMinute;
  const targetWeekdays = normalizeYouthCommonScheduleWeekdays([weekday, ...(Array.isArray(recurrenceWeekdaysOrSourceStartMinute) ? recurrenceWeekdaysOrSourceStartMinute : [])]);
    assertYouthWebActor(user.id, baseline?.expectedActorId);
    const result = await mutateWebCommonSchedules({ actorId: user.id, requestData: await getCurrentAuditLogRequestData(), client: "web" }, { requestId: baseline?.requestId ?? randomUUID(), operation: content.trim() ? "save" : "delete", targetWeekdays, sourceStartMinute, ...(baseline ? { baselines: baseline.baselines } : {}), ...(content.trim() ? { startMinute, endMinute, content } : {}) });
    revalidatePath(commonSchedulePath);
    return { ok: true, data: { schedules: (result.result?.items ?? []) as YouthCommonSchedule[], sourceStartMinute, targetWeekdays } };
  } catch (error) { return youthActivityFailure(error); }
}
export async function deleteYouthCommonScheduleAction(weekday: number, startMinute: number, baseline?: { requestId?: string; expectedActorId?: string; scheduleId: string | null; expectedUpdatedAt: string | null }): Promise<YouthActivityResult<{ weekday: YouthLearningScheduleWeekday; startMinute: number }>> {
  try {
  const user = await requireYouthPermission("canManageYouth");
  if (!isYouthCommonScheduleWeekday(weekday)) return { ok: false, error: "요일을 다시 선택하세요." };
    assertYouthWebActor(user.id, baseline?.expectedActorId);
    await mutateWebCommonSchedules({ actorId: user.id, requestData: await getCurrentAuditLogRequestData(), client: "web" }, { requestId: baseline?.requestId ?? randomUUID(), operation: "delete", targetWeekdays: [weekday], sourceStartMinute: startMinute, ...(baseline ? { baselines: [{ weekday, startMinute, scheduleId: baseline.scheduleId, expectedUpdatedAt: baseline.expectedUpdatedAt }] } : {}) });
    revalidatePath(commonSchedulePath); return { ok: true, data: { weekday, startMinute } };
  } catch (error) { return youthActivityFailure(error); }
}
