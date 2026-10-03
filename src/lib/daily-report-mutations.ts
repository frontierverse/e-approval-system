import "server-only";

import { AuditAction, Prisma } from "@/generated/prisma/client";
import type { AuditLogRequestData } from "@/lib/audit-log-request";
import { prisma } from "@/lib/prisma";
import { getOperationalYouthIds } from "@/lib/youth-record-access";
import { canWriteDailyReport, isDailyReportDirector, parseDailyReportForm, readYouthReports, type DailyReportValues } from "@/lib/daily-report-core";
import { dailyReportSelect, getDailyReportActor, mapDailyReport, reportYouthWhere, type DailyReportActor } from "@/lib/daily-report-queries";
import { getWorkLogToday, parseWorkLogDateValue } from "@/lib/work-log-core";

export type DailyReportSaveInput = { values: DailyReportValues; version: number; intent: "draft" | "submit" };
export type DailyReportMutationContext = { actor: DailyReportActor; requestData?: AuditLogRequestData; client?: "mobile"; db?: Pick<typeof prisma, "$transaction"> };
export type DailyReportErrorCode = "UNAUTHORIZED" | "INVALID_REQUEST" | "FORBIDDEN" | "NOT_ELIGIBLE" | "NOT_FOUND" | "REPORT_CONFLICT" | "DIRECTOR_UNAVAILABLE" | "ROSTER_CHANGED";
export class DailyReportInputError extends Error {
  constructor(message: string, public code: DailyReportErrorCode = "INVALID_REQUEST", public fields?: Record<string, string>) { super(message); }
}
export const dailyReportWriteForbidden = "시설장을 제외한 재직 직원만 업무보고를 작성할 수 있습니다.";
export const dailyReportReviewForbidden = "시설장만 보고서를 확인 처리할 수 있습니다.";
const conflict = (review = false) => new DailyReportInputError(review
  ? "보고서가 변경되었거나 이미 확인되었습니다. 새로고침 후 확인해 주세요."
  : "다른 창에서 먼저 저장한 내용이 있습니다. 현재 입력을 복사해 보관한 뒤 새로고침하여 최신 보고서를 확인해 주세요.", "REPORT_CONFLICT");

// Authenticated adapters supply the actor; permission and mutable eligibility are checked again in the transaction.
export async function saveDailyReport(context: DailyReportMutationContext, input: DailyReportSaveInput) {
  if (isDailyReportDirector(context.actor)) throw new DailyReportInputError(dailyReportWriteForbidden, "FORBIDDEN");
  if (!canWriteDailyReport(context.actor)) throw new DailyReportInputError(dailyReportWriteForbidden, "NOT_ELIGIBLE");
  const form = new FormData();
  form.set("workDate", input.values.workDate); form.set("mainContent", input.values.mainContent);
  form.set("youthReports", JSON.stringify(input.values.youthReports)); form.set("version", String(input.version)); form.set("intent", input.intent);
  const { values, version, intent, fieldErrors } = parseDailyReportForm(form);
  if (Object.keys(fieldErrors).length) throw new DailyReportInputError("입력 내용을 확인해 주세요.", "INVALID_REQUEST", fieldErrors);
  const workDate = parseWorkLogDateValue(values.workDate);
  try {
    return await (context.db ?? prisma).$transaction(async tx => {
      const actor = await getDailyReportActor(context.actor.id, tx);
      const today = getWorkLogToday();
      if (!actor || actor.status !== "ACTIVE") throw new DailyReportInputError(context.client === "mobile" ? "로그인이 필요합니다." : dailyReportWriteForbidden, "UNAUTHORIZED");
      if (isDailyReportDirector(actor)) throw new DailyReportInputError(dailyReportWriteForbidden, "FORBIDDEN");
      if (!canWriteDailyReport(actor, today)) throw new DailyReportInputError(dailyReportWriteForbidden, "NOT_ELIGIBLE");
      const existing = await tx.dailyWorkReport.findUnique({ where: { authorId_workDate: { authorId: actor.id, workDate } }, select: dailyReportSelect });
      if ((existing?.version ?? 0) !== version) throw conflict();
      if (existing?.submittedAt && intent === "draft") throw new DailyReportInputError("제출한 보고서는 임시저장으로 되돌릴 수 없습니다. 수정 후 다시 제출해 주세요.");
      if (intent === "submit") {
        const recipients = await tx.user.findMany({ where: { status: "ACTIVE", AND: [
          { OR: [{ resignationDate: null }, { resignationDate: { gte: today } }] },
          { OR: [{ hireDate: null }, { hireDate: { lte: today } }] },
        ] }, select: { position: { select: { name: true } } } });
        if (!recipients.some(isDailyReportDirector)) throw new DailyReportInputError("수신할 시설장이 등록되어 있지 않습니다. 임시저장 후 직원 정보의 시설장 설정을 확인해 주세요.", "DIRECTOR_UNAVAILABLE");
      }
      const youths = await tx.youth.findMany({ where: reportYouthWhere(values.workDate, today), select: { id: true, name: true } });
      const names = new Map(youths.map(youth => [youth.id, youth.name]));
      const allowedYouthIds = new Set(await getOperationalYouthIds(tx));
      // Ordinary editing must neither reveal nor erase retained notes.
      const previousNotes = readYouthReports(existing?.youthReports);
      for (const note of previousNotes) if (allowedYouthIds.has(note.youthId)) names.set(note.youthId, note.youthName);
      const youthReports = values.youthReports.map(note => {
        const youthName = allowedYouthIds.has(note.youthId) ? names.get(note.youthId) : undefined;
        if (!youthName) {
          const message = "보고 날짜에 해당하는 청소년 명단이 변경되었습니다. 입력 내용을 보관한 뒤 새로고침해 주세요.";
          throw new DailyReportInputError(message, "ROSTER_CHANGED", { youthReports: message });
        }
        return { ...note, youthName };
      });
      const data = { mainContent: values.mainContent, youthReports: [...youthReports, ...previousNotes.filter(note => !allowedYouthIds.has(note.youthId))],
        submittedAt: intent === "submit" ? (existing?.submittedAt ?? new Date()) : null, reviewedAt: null, reviewedById: null };
      let id: string;
      if (existing) {
        const changed = await tx.dailyWorkReport.updateMany({ where: { id: existing.id, authorId: actor.id, version }, data: { ...data, version: { increment: 1 } } });
        if (changed.count !== 1) throw conflict();
        id = existing.id;
      } else {
        id = (await tx.dailyWorkReport.create({ data: { ...data, authorId: actor.id, workDate }, select: { id: true } })).id;
      }
      await tx.auditLog.create({ data: { ...context.requestData, actorId: actor.id, action: AuditAction.UPDATE_WORK_LOG, targetType: "DailyWorkReport", targetId: id,
        message: `${values.workDate} 일일 업무보고를 ${intent === "submit" ? "제출" : "임시저장"}했습니다.`,
        metadata: { changeType: `dailyReport.${intent}`, workDate: values.workDate, youthReportCount: youthReports.length } } });
      const saved = await tx.dailyWorkReport.findUniqueOrThrow({ where: { id }, select: dailyReportSelect });
      return mapDailyReport(saved, allowedYouthIds);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) throw conflict();
    throw error;
  }
}

export async function reviewDailyReport(context: DailyReportMutationContext, input: { id: string; version: number }) {
  if (!isDailyReportDirector(context.actor)) throw new DailyReportInputError(dailyReportReviewForbidden, "FORBIDDEN");
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(input.id) || !Number.isSafeInteger(input.version) || input.version < 1) throw new DailyReportInputError("보고서 정보를 확인해 주세요.");
  return (context.db ?? prisma).$transaction(async tx => {
    const actor = await getDailyReportActor(context.actor.id, tx);
    if (!actor || actor.status !== "ACTIVE") throw new DailyReportInputError(context.client === "mobile" ? "로그인이 필요합니다." : dailyReportReviewForbidden, "UNAUTHORIZED");
    if (!isDailyReportDirector(actor)) throw new DailyReportInputError(dailyReportReviewForbidden, "FORBIDDEN");
    if (context.client === "mobile") {
      const visible = await tx.dailyWorkReport.findFirst({ where: { id: input.id, submittedAt: { not: null } }, select: { id: true } });
      if (!visible) throw new DailyReportInputError("보고서를 찾을 수 없습니다.", "NOT_FOUND");
    }
    const changed = await tx.dailyWorkReport.updateMany({ where: { id: input.id, version: input.version, submittedAt: { not: null }, reviewedAt: null },
      data: { reviewedAt: new Date(), reviewedById: actor.id } });
    if (changed.count !== 1) throw conflict(true);
    await tx.auditLog.create({ data: { ...context.requestData, actorId: actor.id, action: AuditAction.UPDATE_WORK_LOG, targetType: "DailyWorkReport", targetId: input.id,
      message: "일일 업무보고를 확인했습니다.", metadata: { changeType: "dailyReport.review", version: input.version } } });
    const saved = await tx.dailyWorkReport.findUniqueOrThrow({ where: { id: input.id }, select: dailyReportSelect });
    return mapDailyReport(saved, new Set(await getOperationalYouthIds(tx)));
  });
}
