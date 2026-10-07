import "server-only";
import { queueStaffPushEvent } from "@/lib/mobile-push-events";

import { AuditAction, type Prisma, type PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { scheduleStart } from "@/lib/mobile-push-events-core";
import { formatWorkScheduleDateLabel, getWorkScheduleWeekday, isWorkScheduleDate } from "@/lib/work-schedule-calendar";
import { mapWorkSchedule, workScheduleSelect } from "@/lib/work-schedules";
import { getYouthLearningScheduleStartHourFromMinute, getYouthLearningScheduleEndHourFromMinute, isYouthLearningScheduleStartMinute, isYouthLearningScheduleEndMinute } from "@/lib/youth-management-core";

export type WorkScheduleBaseline = { manualScheduleId: string | null; expectedUpdatedAt: string };
export type WorkScheduleMutationContext = { actorId: string; requestData: { ipAddress?: string | null; userAgent?: string | null }; client: "mobile" | "web"; db?: Pick<PrismaClient, "$transaction"> };
export type WorkScheduleSaveInput = { scheduleDate: string; startMinute: number; endMinute: number; content: string };
export type WorkScheduleSource = { id: string; expectedUpdatedAt: string } | { scheduleDate: string; startMinute: number; baseline?: WorkScheduleBaseline };
export class WorkScheduleMutationError extends Error {
  constructor(message: string, readonly code = "INVALID_REQUEST", readonly status = 400) { super(message); }
}
const conflict = () => new WorkScheduleMutationError("일정이 변경되었습니다. 최신 일정을 다시 확인한 후 입력 내용을 비교해 주세요.", "SCHEDULE_CONFLICT", 409);
class ConditionalScheduleRace extends Error {}
type ScheduleRecord = Prisma.WorkScheduleGetPayload<{ select: typeof workScheduleSelect }>;
export function validateWorkScheduleInput(input: WorkScheduleSaveInput, source?: { scheduleDate: string; startMinute: number }) {
  if (!isWorkScheduleDate(input.scheduleDate)) throw new WorkScheduleMutationError("날짜를 다시 선택하세요.");
  if (source && !isWorkScheduleDate(source.scheduleDate)) throw new WorkScheduleMutationError("기존 날짜를 다시 확인하세요.");
  if (!isYouthLearningScheduleStartMinute(input.startMinute)) throw new WorkScheduleMutationError("시작 시간을 다시 선택하세요.");
  if (source && !isYouthLearningScheduleStartMinute(source.startMinute)) throw new WorkScheduleMutationError("기존 시작 시간을 다시 확인하세요.");
  if (!isYouthLearningScheduleEndMinute(input.endMinute, input.startMinute)) throw new WorkScheduleMutationError("종료 시간을 다시 선택하세요.");
  if (typeof input.content !== "string") throw new WorkScheduleMutationError("일정 내용을 입력하세요.");
}
function validateBaseline(baseline: WorkScheduleBaseline) {
  if (!baseline || (baseline.manualScheduleId === null ? baseline.expectedUpdatedAt !== "" : typeof baseline.manualScheduleId !== "string" || !baseline.manualScheduleId || !exactIso(baseline.expectedUpdatedAt))) throw new WorkScheduleMutationError("수정 기준 시간이 올바르지 않습니다. 최신 일정을 다시 확인하세요.");
}
function exactIso(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}
async function activeActor(tx: Prisma.TransactionClient, actorId: string) {
  const actor = await tx.user.findUnique({ where: { id: actorId }, select: { id: true, status: true } });
  if (!actor || actor.status !== "ACTIVE") throw new WorkScheduleMutationError("로그인이 필요합니다.", "UNAUTHORIZED", 401);
}
async function sourceRecord(tx: Prisma.TransactionClient, source: WorkScheduleSource): Promise<ScheduleRecord | null> {
  if ("id" in source) {
    if (!exactIso(source.expectedUpdatedAt)) throw new WorkScheduleMutationError("수정 기준 시간이 올바르지 않습니다.");
    const row = await tx.workSchedule.findUnique({ where: { id: source.id }, select: workScheduleSelect });
    if (row && row.updatedAt.toISOString() !== source.expectedUpdatedAt) throw conflict();
    return row;
  }
  if (source.baseline) {
    validateBaseline(source.baseline);
    if (source.baseline.manualScheduleId !== null) {
      const row = await tx.workSchedule.findUnique({ where: { id: source.baseline.manualScheduleId }, select: workScheduleSelect });
      if (row && (row.scheduleDate !== source.scheduleDate || row.startMinute !== source.startMinute || row.updatedAt.toISOString() !== source.baseline.expectedUpdatedAt)) throw conflict();
      return row;
    }
  }
  const row = await tx.workSchedule.findUnique({ where: { scheduleDate_startMinute: { scheduleDate: source.scheduleDate, startMinute: source.startMinute } }, select: workScheduleSelect });
  if (row && source.baseline) throw conflict();
  return row;
}
function errorRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : null;
}
function adapterWriteConflict(value: unknown): boolean {
  const adapter = errorRecord(value);
  // Prisma 7's pg adapter reports SQLSTATE 40001/40P01 as this exact payload.
  // A message mentioning a conflict, or an unrelated PostgreSQL error, is not enough.
  return adapter?.name === "DriverAdapterError" && errorRecord(adapter.cause)?.kind === "TransactionWriteConflict";
}
function retryableTransactionError(value: unknown): boolean {
  const seen = new Set<Error>();
  let error = value;
  // Only inspect a bounded Error.cause chain and Prisma's documented adapter payload.
  // Do not scan arbitrary metadata, messages or raw SQLSTATE-looking strings.
  for (let depth = 0; depth <= 4 && error instanceof Error && !seen.has(error); depth++) {
    seen.add(error);
    const record = errorRecord(error)!;
    if (error.name === "PrismaClientKnownRequestError") {
      if (record.code === "P2002" || record.code === "P2034") return true;
      if (adapterWriteConflict(errorRecord(record.meta)?.driverAdapterError)) return true;
    }
    if (adapterWriteConflict(error)) return true;
    error = record.cause;
  }
  return false;
}
async function transact<T>(db: Pick<PrismaClient, "$transaction">, operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return await db.$transaction(operation, { isolationLevel: "Serializable" }); }
    catch (error) {
      if (!(error instanceof ConditionalScheduleRace) && !retryableTransactionError(error)) throw error;
      if (attempt === 2) throw conflict();
    }
  }
  throw conflict();
}
function timeLabel(start: number, end: number) {
  const minute = (value: number) => { const hour = Math.floor(value / 60), part = value % 60; return `${hour < 12 ? "오전" : "오후"} ${hour <= 12 ? hour : hour - 12}시${part ? ` ${part}분` : ""}`; };
  return `${minute(start)} - ${minute(end)}`;
}
async function audit(tx: Prisma.TransactionClient, context: WorkScheduleMutationContext, change: "create" | "update" | "delete", previous: ScheduleRecord | null, next: ScheduleRecord | null, source?: WorkScheduleSource) {
  const row = next ?? previous!;
  const end = scheduleStart(row.scheduleDate, row.endMinute);
  const changed = !previous || !next || previous.content !== next.content || previous.scheduleDate !== next.scheduleDate || previous.startMinute !== next.startMinute || previous.endMinute !== next.endMinute;
  if (changed && end > new Date()) await queueStaffPushEvent(tx, { eventKey: `schedule:${row.id}:${change}:${row.updatedAt.toISOString()}`, kind: change === "create" ? "WORK_SCHEDULE_CREATED" : change === "update" ? "WORK_SCHEDULE_UPDATED" : "WORK_SCHEDULE_CANCELLED", targetId: row.id, targetVersion: change === "delete" ? undefined : row.updatedAt.toISOString(), actorId: context.actorId, expiresAt: end });
  await tx.auditLog.create({ data: { actorId: context.actorId, ...context.requestData, action: AuditAction.UPDATE_WORK_SCHEDULE, targetType: "WorkSchedule", targetId: row.id,
    message: `업무 일정표 ${formatWorkScheduleDateLabel(row.scheduleDate)} ${timeLabel(row.startMinute, row.endMinute)} 일정이 ${change === "create" ? "입력" : change === "update" ? "변경" : "삭제"}되었습니다.`,
    metadata: { changeType: `workSchedule.${change}`, source: "work-schedule", scheduleDate: row.scheduleDate,
      sourceScheduleDate: previous?.scheduleDate ?? (source && "scheduleDate" in source ? source.scheduleDate : row.scheduleDate), sourceStartMinute: previous?.startMinute ?? (source && "startMinute" in source ? source.startMinute : row.startMinute),
      previousContent: previous?.content ?? null, previousScheduleDate: previous?.scheduleDate ?? null, previousStartHour: previous?.startHour ?? null, previousStartMinute: previous?.startMinute ?? null, previousEndHour: previous?.endHour ?? null, previousEndMinute: previous?.endMinute ?? null,
      nextContent: next?.content ?? null, nextScheduleDate: next?.scheduleDate ?? null, nextStartHour: next?.startHour ?? null, nextStartMinute: next?.startMinute ?? null, nextEndHour: next?.endHour ?? null, nextEndMinute: next?.endMinute ?? null,
      content: row.content, weekday: row.weekday, startHour: row.startHour, startMinute: row.startMinute, endHour: row.endHour, endMinute: row.endMinute, timeLabel: timeLabel(row.startMinute, row.endMinute) } } });
}
export async function saveWorkSchedule(context: WorkScheduleMutationContext, input: WorkScheduleSaveInput, source?: WorkScheduleSource) {
  validateWorkScheduleInput(input, source && "scheduleDate" in source ? source : undefined);
  const content = input.content.trim();
  if (!content && context.client === "mobile") throw new WorkScheduleMutationError("일정 내용을 입력하세요.");
  return transact(context.db ?? prisma, async tx => {
    await activeActor(tx, context.actorId);
    const previous = source ? await sourceRecord(tx, source) : null;
    if (source && !previous && ("id" in source || source.baseline?.manualScheduleId)) {
      if (context.client === "mobile") throw new WorkScheduleMutationError("일정을 찾을 수 없습니다.", "NOT_FOUND", 404);
      throw conflict();
    }
    if (!content) {
      if (previous) {
        const removed = await tx.workSchedule.deleteMany({ where: { id: previous.id, updatedAt: previous.updatedAt } });
        if (removed.count !== 1) throw new ConditionalScheduleRace();
        await audit(tx, context, "delete", previous, null);
      }
      return { change: previous ? "deleted" as const : "missing" as const, schedule: null, sourceDate: previous?.scheduleDate ?? input.scheduleDate };
    }
    // CAS is already checked, including a replacement ID, before a mobile no-op.
    if (previous && context.client === "mobile" && previous.scheduleDate === input.scheduleDate && previous.startMinute === input.startMinute && previous.endMinute === input.endMinute && previous.content === content) return { change: "unchanged" as const, schedule: mapWorkSchedule(previous), sourceDate: previous.scheduleDate };
    const overlap = await tx.workSchedule.findFirst({ where: { scheduleDate: input.scheduleDate, startMinute: { lt: input.endMinute }, endMinute: { gt: input.startMinute }, ...(previous ? { id: { not: previous.id } } : {}) }, orderBy: [{ startMinute: "asc" }, { id: "asc" }], select: workScheduleSelect });
    if (overlap) throw new WorkScheduleMutationError(`${formatWorkScheduleDateLabel(input.scheduleDate)} ${timeLabel(overlap.startMinute, overlap.endMinute)} 일정과 시간이 겹칩니다.`, "SCHEDULE_OVERLAP", 409);
    const data = { scheduleDate: input.scheduleDate, startMinute: input.startMinute, endMinute: input.endMinute, content, startHour: getYouthLearningScheduleStartHourFromMinute(input.startMinute), endHour: getYouthLearningScheduleEndHourFromMinute(input.endMinute), weekday: getWorkScheduleWeekday(input.scheduleDate), updatedAt: new Date(previous ? Math.max(Date.now(), previous.updatedAt.getTime() + 1) : Date.now()) };
    let next: ScheduleRecord;
    if (previous) {
      const changed = await tx.workSchedule.updateMany({ where: { id: previous.id, updatedAt: previous.updatedAt }, data });
      if (changed.count !== 1) throw new ConditionalScheduleRace();
      next = await tx.workSchedule.findUniqueOrThrow({ where: { id: previous.id }, select: workScheduleSelect });
    } else next = await tx.workSchedule.create({ data, select: workScheduleSelect });
    const change = previous ? "update" as const : "create" as const;
    await audit(tx, context, change, previous, next, source);
    return { change, schedule: mapWorkSchedule(next), sourceDate: previous?.scheduleDate ?? next.scheduleDate };
  });
}
export async function deleteWorkSchedule(context: WorkScheduleMutationContext, source: WorkScheduleSource) {
  if ("scheduleDate" in source) {
    if (!isWorkScheduleDate(source.scheduleDate)) throw new WorkScheduleMutationError("날짜를 다시 선택하세요.");
    if (!isYouthLearningScheduleStartMinute(source.startMinute)) throw new WorkScheduleMutationError("시작 시간을 다시 선택하세요.");
  }
  return transact(context.db ?? prisma, async tx => {
    await activeActor(tx, context.actorId);
    const previous = await sourceRecord(tx, source);
    if (!previous) return { change: "missing" as const, schedule: null };
    const removed = await tx.workSchedule.deleteMany({ where: { id: previous.id, updatedAt: previous.updatedAt } });
    if (removed.count !== 1) throw new ConditionalScheduleRace();
    await audit(tx, context, "delete", previous, null);
    return { change: "deleted" as const, schedule: mapWorkSchedule(previous) };
  });
}
