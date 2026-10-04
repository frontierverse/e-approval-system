"use server";
import { assertYouthWebActor, youthActivityFailure, type YouthActivityResult } from "@/lib/youth-activity-web-core";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getCurrentAuditLogRequestData } from "@/lib/audit-log-request";
import { requireYouthPermission } from "@/lib/youth-permissions";
import { createMobilePersonalSchedule, updateMobilePersonalSchedule, deleteMobilePersonalSchedule, getMobilePersonalSchedule } from "@/lib/youth-mobile-schedules";
import type { YouthPersonalScheduleInput } from "@/lib/youth-personal-schedule-core";
import type { YouthPersonalSchedule } from "@/lib/youth-personal-schedules";
export type PersonalScheduleBaseline = { youthId: string; expectedUpdatedAt: string; requestId?: string; expectedActorId?: string };
function revalidatePersonalScheduleConsumers() { for (const path of ["/youth/personal-schedule", "/work-schedule", "/work-schedule/work-log"]) revalidatePath(path); }
export async function createYouthPersonalScheduleAction(youthId: string, input: YouthPersonalScheduleInput, options?: { requestId?: string; expectedActorId?: string }): Promise<YouthActivityResult<{ schedule: YouthPersonalSchedule }>> {
  try {
    const user = await requireYouthPermission("canManageYouth");
    assertYouthWebActor(user.id, options?.expectedActorId);
    const result = await createMobilePersonalSchedule({ actorId: user.id, requestData: await getCurrentAuditLogRequestData(), client: "web" }, youthId, { requestId: options?.requestId ?? randomUUID(), input });
    if (!result.result) return { ok: false, error: "등록한 일정을 더 이상 확인할 수 없습니다." };
    revalidatePersonalScheduleConsumers(); return { ok: true, data: { schedule: result.result.schedule } };
  } catch (error) { return youthActivityFailure(error); }
}
export async function updateYouthPersonalScheduleAction(scheduleId: string, input: YouthPersonalScheduleInput, baseline?: PersonalScheduleBaseline): Promise<YouthActivityResult<{ schedule: YouthPersonalSchedule }>> {
  try {
    const user = await requireYouthPermission("canManageYouth"), ctx = { actorId: user.id, requestData: await getCurrentAuditLogRequestData(), client: "web" as const };
    assertYouthWebActor(user.id, baseline?.expectedActorId);
    const youthId = baseline?.youthId ?? (await getMobilePersonalSchedule(ctx, scheduleId)).youth.id;
    const result = await updateMobilePersonalSchedule(ctx, scheduleId, { requestId: baseline?.requestId ?? randomUUID(), youthId, ...(baseline ? { expectedUpdatedAt: baseline.expectedUpdatedAt } : {}), input }, !baseline);
    if (!result.result) return { ok: false, error: "일정을 더 이상 확인할 수 없습니다." };
    revalidatePersonalScheduleConsumers(); return { ok: true, data: { schedule: result.result.schedule } };
  } catch (error) { return youthActivityFailure(error); }
}
export async function deleteYouthPersonalScheduleAction(scheduleId: string, baseline?: PersonalScheduleBaseline): Promise<YouthActivityResult<{ scheduleId: string }>> {
  try {
    const user = await requireYouthPermission("canManageYouth"), ctx = { actorId: user.id, requestData: await getCurrentAuditLogRequestData(), client: "web" as const };
    assertYouthWebActor(user.id, baseline?.expectedActorId);
    const youthId = baseline?.youthId ?? (await getMobilePersonalSchedule(ctx, scheduleId)).youth.id;
    await deleteMobilePersonalSchedule(ctx, scheduleId, { requestId: baseline?.requestId ?? randomUUID(), youthId, ...(baseline ? { expectedUpdatedAt: baseline.expectedUpdatedAt } : {}) }, !baseline);
    revalidatePersonalScheduleConsumers(); return { ok: true, data: { scheduleId } };
  } catch (error) { return youthActivityFailure(error); }
}
