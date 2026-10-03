"use server";

import { UserRole } from "@/generated/prisma/client";
import { getCurrentAuditLogRequestData } from "@/lib/audit-log-request";
import { requireUser } from "@/lib/auth";
import { revalidateStaffTasks } from "@/lib/staff-task-cache";
import {
  createStaffTask,
  deleteOwnStaffTask,
  setOwnStaffTaskCompleted,
  StaffTaskInputError,
  updateStaffTask,
} from "@/lib/staff-task-mutations";
import {
  isValidStaffTaskId,
  isValidStaffTaskVersion,
  normalizeStaffTaskFormValues,
  validateStaffTaskFormValues,
  type StaffTaskFormState,
  type StaffTaskFormValues,
} from "@/lib/staff-tasks-core";

export type { StaffTaskFormState } from "@/lib/staff-tasks-core";

export async function createStaffTaskAction(_state: StaffTaskFormState, formData: FormData): Promise<StaffTaskFormState> {
  return createTask(formData, false);
}
export async function createMyStaffTaskAction(_state: StaffTaskFormState, formData: FormData): Promise<StaffTaskFormState> {
  return createTask(formData, true);
}
async function createTask(formData: FormData, selfOnly: boolean): Promise<StaffTaskFormState> {
  const user = await requireUser();
  const values = normalizeStaffTaskFormValues(formData);
  if (selfOnly) values.assigneeId = user.id;
  else if (user.role !== UserRole.ADMIN) return { error: "관리자만 할 일을 등록할 수 있습니다.", values };
  const error = validateStaffTaskFormValues(values);
  if (error) return { error, values };
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(values.requestId)) {
    return { error: "등록 요청을 확인할 수 없습니다. 입력 내용을 복사한 뒤 화면을 새로 열어 주세요.", values };
  }
  try {
    const requestData = await getCurrentAuditLogRequestData();
    const result = await createStaffTask({ actor: user, requestData }, values, selfOnly);
    revalidateStaffTasks();
    return { success: "할 일을 등록했습니다.", savedTaskId: result.task.id };
  } catch (error) {
    return staffTaskFormFailure(error, values, "할 일을 등록하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }
}

export async function updateStaffTaskAction(_state: StaffTaskFormState, formData: FormData): Promise<StaffTaskFormState> {
  const user = await requireUser();
  const values = normalizeStaffTaskFormValues(formData);
  if (user.role !== UserRole.ADMIN) return { error: "관리자만 할 일을 수정할 수 있습니다.", values };
  const error = validateStaffTaskFormValues(values);
  if (error) return { error, values };
  const id = formData.get("id");
  const versionText = formData.get("version");
  const version = typeof versionText === "string" && /^\d+$/.test(versionText) ? Number(versionText) : NaN;
  if (!isValidStaffTaskId(id) || !isValidStaffTaskVersion(version)) {
    return { error: "수정할 할 일을 확인할 수 없습니다. 화면을 새로 열어 주세요.", values };
  }
  try {
    const requestData = await getCurrentAuditLogRequestData();
    await updateStaffTask({ actor: user, requestData }, { id, version, values });
    revalidateStaffTasks();
    return { success: "할 일을 수정했습니다.", savedTaskId: id };
  } catch (error) {
    return staffTaskFormFailure(error, values, "할 일을 수정하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }
}

export async function setStaffTaskCompletedAction(input: { id: string; completed: boolean; version: number }): Promise<{ error?: string; success?: string }> {
  const user = await requireUser();
  if (!input || !isValidStaffTaskId(input.id) || !isValidStaffTaskVersion(input.version) || typeof input.completed !== "boolean") {
    return { error: "할 일 정보를 확인할 수 없습니다. 목록을 새로고침해 주세요." };
  }
  try {
    const requestData = await getCurrentAuditLogRequestData();
    await setOwnStaffTaskCompleted({ actor: user, requestData }, input);
    revalidateStaffTasks();
    return { success: input.completed ? "완료했습니다." : "완료를 취소했습니다." };
  } catch (error) {
    if (error instanceof StaffTaskInputError) return { error: error.message };
    console.error("Failed to change staff task completion", error);
    return { error: "완료 상태를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }
}

export async function deleteMyStaffTaskAction(input: { id: string; version: number }): Promise<{ error?: string; success?: string }> {
  const user = await requireUser();
  if (!input || !isValidStaffTaskId(input.id) || !isValidStaffTaskVersion(input.version)) {
    return { error: "할 일 정보를 확인할 수 없습니다. 목록을 새로고침해 주세요." };
  }
  try {
    const requestData = await getCurrentAuditLogRequestData();
    await deleteOwnStaffTask({ actor: user, requestData }, input);
    revalidateStaffTasks(input.id);
    return { success: "삭제했습니다. 삭제된 업무와 이력은 ‘삭제됨’에서 확인할 수 있습니다." };
  } catch (error) {
    if (error instanceof StaffTaskInputError) return { error: error.message };
    console.error("Failed to delete staff task", error);
    return { error: "삭제하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }
}
function staffTaskFormFailure(error: unknown, values: StaffTaskFormValues, fallback: string): StaffTaskFormState {
  if (error instanceof StaffTaskInputError) return { error: error.message, values };
  console.error("Failed to save staff task", error);
  return { error: fallback, values };
}
