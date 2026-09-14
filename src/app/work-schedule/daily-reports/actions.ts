"use server";

import { revalidatePath } from "next/cache";
import { AuditAction, Prisma } from "@/generated/prisma/client";
import { requireUser } from "@/lib/auth";
import { getCurrentAuditLogRequestData } from "@/lib/audit-log-request";
import { prisma } from "@/lib/prisma";
import { canWriteDailyReport, dailyReportPath, isDailyReportDirector, parseDailyReportForm, readYouthReports, type DailyReportState } from "@/lib/daily-report-core";
import { dailyReportSelect, mapDailyReport, reportYouthWhere } from "@/lib/daily-reports";
import { getWorkLogToday, parseWorkLogDateValue } from "@/lib/work-log-core";

class ReportConflict extends Error {}
class ReportInputError extends Error {}

export async function saveDailyReportAction(_previous: DailyReportState, form: FormData): Promise<DailyReportState> {
  const user = await requireUser();
  if (!canWriteDailyReport(user)) return { error: "시설장을 제외한 재직 직원만 업무보고를 작성할 수 있습니다." };
  const { values, version, intent, fieldErrors } = parseDailyReportForm(form);
  if (Object.keys(fieldErrors).length) return { error: "입력 내용을 확인해 주세요.", fieldErrors };
  const workDate = parseWorkLogDateValue(values.workDate);
  const requestData = await getCurrentAuditLogRequestData();
  try {
    const entry = await prisma.$transaction(async tx => {
      const existing = await tx.dailyWorkReport.findUnique({
        where: { authorId_workDate: { authorId: user.id, workDate } }, select: dailyReportSelect,
      });
      if ((existing?.version ?? 0) !== version) throw new ReportConflict();
      if (existing?.submittedAt && intent === "draft") throw new ReportInputError("제출한 보고서는 임시저장으로 되돌릴 수 없습니다. 수정 후 다시 제출해 주세요.");
      if (intent === "submit") {
        const today = getWorkLogToday();
        const recipients = await tx.user.findMany({ where: { status: "ACTIVE", AND: [
          { OR: [{ resignationDate: null }, { resignationDate: { gte: today } }] },
          { OR: [{ hireDate: null }, { hireDate: { lte: today } }] },
        ] }, select: { position: { select: { name: true } } } });
        if (!recipients.some(isDailyReportDirector)) throw new ReportInputError("수신할 시설장이 등록되어 있지 않습니다. 임시저장 후 직원 정보의 시설장 설정을 확인해 주세요.");
      }
      const youths = await tx.youth.findMany({ where: reportYouthWhere(values.workDate), select: { id: true, name: true } });
      const names = new Map(youths.map(youth => [youth.id, youth.name]));
      // Preserve submitted names even after a youth is renamed, discharged or deleted.
      for (const note of readYouthReports(existing?.youthReports)) names.set(note.youthId, note.youthName);
      const youthReports = values.youthReports.map(note => {
        const youthName = names.get(note.youthId);
        if (!youthName) throw new ReportInputError("보고 날짜에 해당하는 청소년 명단이 변경되었습니다. 입력 내용을 보관한 뒤 새로고침해 주세요.");
        return { ...note, youthName };
      });
      const data = {
        mainContent: values.mainContent, youthReports,
        submittedAt: intent === "submit" ? (existing?.submittedAt ?? new Date()) : null,
        reviewedAt: null, reviewedById: null,
      };
      let id: string;
      if (existing) {
        const result = await tx.dailyWorkReport.updateMany({
          where: { id: existing.id, authorId: user.id, version }, data: { ...data, version: { increment: 1 } },
        });
        if (result.count !== 1) throw new ReportConflict();
        id = existing.id;
      } else {
        id = (await tx.dailyWorkReport.create({ data: { ...data, authorId: user.id, workDate }, select: { id: true } })).id;
      }
      await tx.auditLog.create({ data: {
        ...requestData, actorId: user.id, action: AuditAction.UPDATE_WORK_LOG, targetType: "DailyWorkReport", targetId: id,
        message: `${values.workDate} 일일 업무보고를 ${intent === "submit" ? "제출" : "임시저장"}했습니다.`,
        metadata: { changeType: `dailyReport.${intent}`, workDate: values.workDate, youthReportCount: youthReports.length },
      } });
      const saved = await tx.dailyWorkReport.findUniqueOrThrow({ where: { id }, select: dailyReportSelect });
      return mapDailyReport(saved);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    revalidatePath(dailyReportPath);
    return { success: intent === "submit" ? "시설장에게 업무보고를 제출했습니다." : "임시저장했습니다. 제출 전에는 나에게만 보입니다.", entry };
  } catch (error) {
    if (error instanceof ReportInputError) return { error: error.message };
    if (error instanceof ReportConflict || (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code))) {
      return { conflict: true, error: "다른 창에서 먼저 저장한 내용이 있습니다. 현재 입력을 복사해 보관한 뒤 새로고침하여 최신 보고서를 확인해 주세요." };
    }
    console.error("Failed to save daily report", error);
    return { error: "업무보고를 저장하지 못했습니다. 입력은 유지됩니다. 잠시 후 다시 시도해 주세요." };
  }
}

export async function reviewDailyReportAction(_previous: DailyReportState, form: FormData): Promise<DailyReportState> {
  const user = await requireUser();
  if (!isDailyReportDirector(user)) return { error: "시설장만 보고서를 확인 처리할 수 있습니다." };
  const id = String(form.get("id") ?? "");
  const version = Number(form.get("version"));
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id) || !Number.isSafeInteger(version) || version < 1) return { error: "보고서 정보를 확인해 주세요." };
  const requestData = await getCurrentAuditLogRequestData();
  try {
    await prisma.$transaction(async tx => {
      const changed = await tx.dailyWorkReport.updateMany({
        where: { id, version, submittedAt: { not: null }, reviewedAt: null },
        data: { reviewedAt: new Date(), reviewedById: user.id },
      });
      if (changed.count !== 1) throw new ReportConflict();
      await tx.auditLog.create({ data: {
        ...requestData, actorId: user.id, action: AuditAction.UPDATE_WORK_LOG, targetType: "DailyWorkReport", targetId: id,
        message: "일일 업무보고를 확인했습니다.", metadata: { changeType: "dailyReport.review", version },
      } });
    });
    revalidatePath(dailyReportPath);
    return { success: "확인 완료로 표시했습니다." };
  } catch (error) {
    if (error instanceof ReportConflict) return { error: "보고서가 변경되었거나 이미 확인되었습니다. 새로고침 후 확인해 주세요." };
    console.error("Failed to review daily report", error);
    return { error: "확인 상태를 저장하지 못했습니다. 다시 시도해 주세요." };
  }
}
