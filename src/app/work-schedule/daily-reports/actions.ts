"use server";

import { requireUser } from "@/lib/auth";
import { getCurrentAuditLogRequestData } from "@/lib/audit-log-request";
import { canWriteDailyReport, isDailyReportDirector, parseDailyReportForm, type DailyReportState } from "@/lib/daily-report-core";
import { revalidateDailyReports } from "@/lib/daily-report-cache";
import { DailyReportInputError, dailyReportWriteForbidden, dailyReportReviewForbidden, saveDailyReport, reviewDailyReport } from "@/lib/daily-report-mutations";

export async function saveDailyReportAction(_previous: DailyReportState, form: FormData): Promise<DailyReportState> {
  const actor = await requireUser();
  if (!canWriteDailyReport(actor)) return { error: dailyReportWriteForbidden };
  const { values, version, intent, fieldErrors } = parseDailyReportForm(form);
  if (Object.keys(fieldErrors).length) return { error: "입력 내용을 확인해 주세요.", fieldErrors };
  try {
    const entry = await saveDailyReport({ actor, requestData: await getCurrentAuditLogRequestData() }, { values, version, intent: intent as "draft" | "submit" });
    revalidateDailyReports();
    return { success: intent === "submit" ? "시설장에게 업무보고를 제출했습니다." : "임시저장했습니다. 제출 전에는 나에게만 보입니다.", entry };
  } catch (error) {
    if (error instanceof DailyReportInputError) return { error: error.message, ...(error.code === "REPORT_CONFLICT" ? { conflict: true } : {}) };
    console.error("Failed to save daily report", error);
    return { error: "업무보고를 저장하지 못했습니다. 입력은 유지됩니다. 잠시 후 다시 시도해 주세요." };
  }
}

export async function reviewDailyReportAction(_previous: DailyReportState, form: FormData): Promise<DailyReportState> {
  const actor = await requireUser();
  if (!isDailyReportDirector(actor)) return { error: dailyReportReviewForbidden };
  const id = String(form.get("id") ?? ""), version = Number(form.get("version"));
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id) || !Number.isSafeInteger(version) || version < 1) return { error: "보고서 정보를 확인해 주세요." };
  try {
    await reviewDailyReport({ actor, requestData: await getCurrentAuditLogRequestData() }, { id, version });
    revalidateDailyReports();
    return { success: "확인 완료로 표시했습니다." };
  } catch (error) {
    if (error instanceof DailyReportInputError) return { error: error.message };
    console.error("Failed to review daily report", error);
    return { error: "확인 상태를 저장하지 못했습니다. 다시 시도해 주세요." };
  }
}
