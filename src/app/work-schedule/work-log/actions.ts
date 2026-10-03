"use server";

import { getCurrentAuditLogRequestData } from "@/lib/audit-log-request";
import { requireUser } from "@/lib/auth";
import { getWorkLogToday, hasWorkLogFormErrors, normalizeWorkLogFormValues, validateWorkLogFormValues, type WorkLogDeleteFormState, type WorkLogFormState } from "@/lib/work-log-core";
import { revalidateWorkLogs } from "@/lib/work-log-cache";
import { deleteOwnWorkLog, saveOwnWorkLog, WorkLogMutationError } from "@/lib/work-log-mutations";

export async function saveWorkLogAction(_previousState: WorkLogFormState, formData: FormData): Promise<WorkLogFormState> {
  const user = await requireUser();
  const values = normalizeWorkLogFormValues(formData);
  const expectedUpdatedAt = String(formData.get("expectedUpdatedAt") ?? "").trim();
  const fieldErrors = validateWorkLogFormValues(values, getWorkLogToday());
  if (hasWorkLogFormErrors(fieldErrors)) return { error: "입력 내용을 확인해 주세요.", fieldErrors, values };
  const requestData = await getCurrentAuditLogRequestData();
  let savedResult;
  try { savedResult = await saveOwnWorkLog({ actor: user, requestData, client: "web" }, { values, expectedUpdatedAt }); }
  catch (error) {
    if (error instanceof WorkLogMutationError && error.code === "WORK_LOG_CONFLICT") return { conflictUpdatedAt: error.currentUpdatedAt, error: error.message, values };
    console.error("Failed to save work log", error);
    return { error: "업무일지를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.", values };
  }
  if (savedResult.change !== "unchanged") revalidateWorkLogs();
  return { success: savedResult.change === "update" ? "업무일지를 수정했습니다." : savedResult.change === "create" ? "업무일지를 등록했습니다." : "변경된 내용이 없습니다.", entry: savedResult.entry, values };
}
export async function deleteWorkLogAction(_previousState: WorkLogDeleteFormState, formData: FormData): Promise<WorkLogDeleteFormState> {
  const user = await requireUser();
  const workLogId = String(formData.get("workLogId") ?? "").trim(), expectedUpdatedAt = String(formData.get("expectedUpdatedAt") ?? "").trim();
  const date = new Date(expectedUpdatedAt);
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(workLogId) || Number.isNaN(date.getTime()) || date.toISOString() !== expectedUpdatedAt) return { error: "삭제할 업무일지 정보를 확인할 수 없습니다. 창을 닫고 다시 시도해 주세요." };
  const requestData = await getCurrentAuditLogRequestData();
  let deleteResult;
  try { deleteResult = await deleteOwnWorkLog({ actor: user, requestData, client: "web" }, { manualLogId: workLogId, expectedUpdatedAt }); }
  catch (error) {
    if (error instanceof WorkLogMutationError && error.code === "WORK_LOG_CONFLICT") return { conflict: true, error: error.message };
    console.error("Failed to delete work log", error);
    return { error: "업무일지를 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }
  revalidateWorkLogs();
  return { deletedId: workLogId, success: deleteResult.kind === "deleted" ? "업무일지를 삭제했습니다." : "업무일지가 이미 삭제되었습니다." };
}
