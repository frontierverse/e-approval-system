import "server-only";

import { AuditAction, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { AuditLogRequestData } from "@/lib/audit-log-request";
import { formatWorkLogDateLabel, getWorkLogToday, isExactWorkLogTimestamp, hasWorkLogSaveConflict, parseWorkLogDateValue, validateWorkLogFormValues, type WorkLogEntry, type WorkLogFormValues } from "@/lib/work-log-core";
import { getWorkLogEntry, mapWorkLogRecord, workLogSelect } from "@/lib/work-logs";

export const workLogSaveConflictMessage = "다른 창에서 이 업무일지가 먼저 저장되었습니다. 현재 입력은 유지했습니다. 확인 후 다시 저장하면 현재 내용으로 덮어씁니다.";
export const workLogDeleteConflictMessage = "다른 창에서 이 업무일지가 수정되었습니다. 최신 내용을 확인한 뒤 다시 삭제해 주세요.";
export class WorkLogMutationError extends Error {
  constructor(message: string, public code: "UNAUTHORIZED" | "INVALID_REQUEST" | "WORK_LOG_CONFLICT", public currentUpdatedAt?: string, public fields?: Record<string, string>) { super(message); }
}
class WorkLogDeleteRaceError extends Error {}
export type WorkLogMutationContext = {
  actor: { id: string }; requestData?: AuditLogRequestData; client?: "mobile" | "web";
  db?: Pick<typeof prisma, "$transaction">; today?: string; now?: () => Date;
};
export type WorkLogSaveInput = { values: WorkLogFormValues; expectedUpdatedAt: string; manualLogId?: string | null };
export type WorkLogSaveResult = { change: "create" | "update" | "unchanged"; entry: WorkLogEntry };
export type WorkLogDeleteResult = { kind: "deleted" | "missing"; entry?: WorkLogEntry; combinedEntry?: WorkLogEntry | null };
async function freshMobileActor(tx: Prisma.TransactionClient, context: WorkLogMutationContext) {
  if (context.client !== "mobile") return;
  const actor = await tx.user.findUnique({ where: { id: context.actor.id }, select: { status: true } });
  if (!actor || actor.status !== "ACTIVE") throw new WorkLogMutationError("로그인이 필요합니다.", "UNAUTHORIZED");
}
async function transaction<T>(context: WorkLogMutationContext, operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  const db = context.db ?? prisma;
  for (let attempt = 0; ; attempt++) {
    try { return await db.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }
    catch (error) {
      const retryable = error instanceof WorkLogDeleteRaceError || (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2002" || error.code === "P2034"));
      if (attempt >= 2 || !retryable) throw error;
    }
  }
}
export async function saveOwnWorkLog(context: WorkLogMutationContext, input: WorkLogSaveInput): Promise<WorkLogSaveResult> {
  const { values, expectedUpdatedAt } = input;
  if (context.client === "mobile" && (!Object.hasOwn(input, "manualLogId") ||
    !(input.manualLogId === null ? expectedUpdatedAt === "" : typeof input.manualLogId === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(input.manualLogId) && isExactWorkLogTimestamp(expectedUpdatedAt)))) {
    throw new WorkLogMutationError("업무일지 정보를 확인해 주세요.", "INVALID_REQUEST");
  }
  const fields = validateWorkLogFormValues(values, context.today ?? getWorkLogToday());
  if (Object.keys(fields).length) throw new WorkLogMutationError("입력 내용을 확인해 주세요.", "INVALID_REQUEST", undefined, fields);
  const workDate = parseWorkLogDateValue(values.workDate), authorId = context.actor.id;
  return transaction(context, async tx => {
    await freshMobileActor(tx, context);
    const existingLog = await tx.workLog.findUnique({ where: { authorId_workDate: { authorId, workDate } }, select: workLogSelect });
    const currentUpdatedAt = existingLog?.updatedAt.toISOString() ?? null;
    // Mobile must carry both tokens. Web preserves its existing expected-only form.
    if (hasWorkLogSaveConflict(expectedUpdatedAt, currentUpdatedAt) || (Object.hasOwn(input, "manualLogId") && input.manualLogId !== (existingLog?.id ?? null))) {
      throw new WorkLogMutationError(workLogSaveConflictMessage, "WORK_LOG_CONFLICT", currentUpdatedAt ?? "");
    }
    if (existingLog && existingLog.keyword === values.keyword && existingLog.content === values.content) {
      return { change: "unchanged", entry: (await getWorkLogEntry({ authorId, workDate: values.workDate }, tx))! };
    }
    const change = existingLog ? "update" : "create";
    const now = (context.now ?? (() => new Date()))();
    const updatedAt = existingLog ? new Date(Math.max(now.getTime(), existingLog.updatedAt.getTime() + 1)) : now;
    const savedLog = await tx.workLog.upsert({
      where: { authorId_workDate: { authorId, workDate } },
      create: { authorId, content: values.content, keyword: values.keyword, workDate },
      update: { content: values.content, keyword: values.keyword, updatedById: authorId, updatedAt }, select: workLogSelect,
    });
    await tx.auditLog.create({ data: { actorId: authorId, ...context.requestData, action: AuditAction.UPDATE_WORK_LOG, targetId: savedLog.id, targetType: "WorkLog",
      message: `${formatWorkLogDateLabel(values.workDate)} 업무일지를 ${change === "update" ? "수정" : "등록"}했습니다.`, metadata: { changeType: `workLog.${change}`, workDate: values.workDate } } });
    return { change, entry: (await getWorkLogEntry({ authorId, workDate: values.workDate }, tx))! };
  });
}
export async function deleteOwnWorkLog(context: WorkLogMutationContext, input: { manualLogId: string; expectedUpdatedAt: string; workDate?: string }): Promise<WorkLogDeleteResult> {
  const authorId = context.actor.id;
  return transaction(context, async tx => {
    await freshMobileActor(tx, context);
    const existingLog = await tx.workLog.findFirst({ where: { authorId, id: input.manualLogId, ...(input.workDate ? { workDate: parseWorkLogDateValue(input.workDate) } : {}) }, select: workLogSelect });
    const projection = () => input.workDate ? getWorkLogEntry({ authorId, workDate: input.workDate }, tx) : undefined;
    if (!existingLog) return { kind: "missing", ...(input.workDate ? { combinedEntry: await projection() } : {}) };
    const entry = mapWorkLogRecord(existingLog);
    if (entry.updatedAt !== input.expectedUpdatedAt) throw new WorkLogMutationError(workLogDeleteConflictMessage, "WORK_LOG_CONFLICT");
    const deleted = await tx.workLog.deleteMany({ where: { authorId, id: input.manualLogId, updatedAt: existingLog.updatedAt, ...(input.workDate ? { workDate: existingLog.workDate } : {}) } });
    if (deleted.count !== 1) throw new WorkLogDeleteRaceError();
    await tx.auditLog.create({ data: { actorId: authorId, ...context.requestData, action: AuditAction.UPDATE_WORK_LOG, targetId: entry.id, targetType: "WorkLog",
      message: `${formatWorkLogDateLabel(entry.workDate)} 업무일지를 삭제했습니다.`, metadata: { changeType: "workLog.delete", next: null,
        previous: { authorName: entry.authorName, createdAt: entry.createdAt, keyword: entry.keyword, updatedAt: entry.updatedAt, updatedByName: entry.updatedByName, workDate: entry.workDate }, source: "work-log", workDate: entry.workDate } } });
    return { entry, kind: "deleted", ...(input.workDate ? { combinedEntry: await projection() } : {}) };
  });
}
