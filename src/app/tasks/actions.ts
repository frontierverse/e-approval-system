"use server";

import { revalidatePath } from "next/cache";
import { AuditAction, Prisma, UserRole } from "@/generated/prisma/client";
import { getCurrentAuditLogRequestData } from "@/lib/audit-log-request";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { eligibleStaffTaskAssigneeWhere } from "@/lib/staff-tasks";
import {
  getStaffTaskToday,
  isValidStaffTaskId,
  isValidStaffTaskVersion,
  normalizeStaffTaskFormValues,
  validateStaffTaskFormValues,
  type StaffTaskFormState,
  type StaffTaskFormValues,
} from "@/lib/staff-tasks-core";

export type { StaffTaskFormState } from "@/lib/staff-tasks-core";

const conflictMessage = "다른 창에서 할 일이 변경되었습니다. 최신 내용을 확인한 뒤 다시 시도해 주세요.";

export async function createStaffTaskAction(
  _state: StaffTaskFormState,
  formData: FormData,
): Promise<StaffTaskFormState> {
  const user = await requireUser();
  const values = normalizeStaffTaskFormValues(formData);
  if (user.role !== UserRole.ADMIN) return { error: "관리자만 할 일을 등록할 수 있습니다.", values };
  const error = validateStaffTaskFormValues(values);
  if (error) return { error, values };
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(values.requestId)) {
    return { error: "등록 요청을 확인할 수 없습니다. 입력 내용을 복사한 뒤 화면을 새로 열어 주세요.", values };
  }

  try {
    const requestData = await getCurrentAuditLogRequestData();
    const savedTask = await runStaffTaskTransaction(async (tx) => {
      const existing = await tx.staffTask.findUnique({ where: { requestId: values.requestId } });
      if (existing) {
        if (existing.createdById !== user.id || !matchesTaskValues(existing, values)) {
          throw new StaffTaskInputError("이미 처리된 등록 요청입니다. 새 할 일 등록 화면에서 다시 입력해 주세요.");
        }
        return existing;
      }
      await assertEligibleAssignee(tx, values.assigneeId);
      const task = await tx.staffTask.create({
        data: { ...taskData(values), requestId: values.requestId, createdById: user.id },
      });
      await tx.auditLog.create({
        data: {
          ...requestData,
          actorId: user.id,
          action: AuditAction.UPDATE_STAFF_TASK,
          targetType: "StaffTask",
          targetId: task.id,
          message: "직원 할 일을 등록했습니다.",
          metadata: { changeType: "staffTask.create", assigneeId: task.assigneeId, dueDate: task.dueDate },
        },
      });
      return task;
    });
    revalidateStaffTasks();
    return { success: "할 일을 등록했습니다.", savedTaskId: savedTask.id };
  } catch (error) {
    return staffTaskFormFailure(error, values, "할 일을 등록하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }
}

export async function updateStaffTaskAction(
  _state: StaffTaskFormState,
  formData: FormData,
): Promise<StaffTaskFormState> {
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
    await runStaffTaskTransaction(async (tx) => {
      const existing = await tx.staffTask.findUnique({ where: { id } });
      if (!existing) throw new StaffTaskInputError("할 일을 찾을 수 없습니다. 목록을 새로고침해 주세요.");
      if (existing.version !== version) throw new StaffTaskInputError(conflictMessage);
      if (existing.assigneeId !== values.assigneeId) {
        if (existing.completedAt) throw new StaffTaskInputError("완료한 할 일의 담당자는 변경할 수 없습니다. 새 할 일로 등록해 주세요.");
        await assertEligibleAssignee(tx, values.assigneeId);
      }
      if (matchesTaskValues(existing, values)) return;
      const updated = await tx.staffTask.updateMany({
        where: { id, version },
        data: { ...taskData(values), version: { increment: 1 } },
      });
      if (updated.count !== 1) throw new StaffTaskInputError(conflictMessage);
      await tx.auditLog.create({
        data: {
          ...requestData,
          actorId: user.id,
          action: AuditAction.UPDATE_STAFF_TASK,
          targetType: "StaffTask",
          targetId: id,
          message: "직원 할 일을 수정했습니다.",
          metadata: {
            changeType: "staffTask.update",
            previousAssigneeId: existing.assigneeId,
            assigneeId: values.assigneeId,
            dueDate: values.dueDate || null,
          },
        },
      });
    });
    revalidateStaffTasks();
    return { success: "할 일을 수정했습니다.", savedTaskId: id };
  } catch (error) {
    return staffTaskFormFailure(error, values, "할 일을 수정하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }
}

export async function setStaffTaskCompletedAction(input: {
  id: string;
  completed: boolean;
  version: number;
}): Promise<{ error?: string; success?: string }> {
  const user = await requireUser();
  if (!input || !isValidStaffTaskId(input.id) || !isValidStaffTaskVersion(input.version) || typeof input.completed !== "boolean") {
    return { error: "할 일 정보를 확인할 수 없습니다. 목록을 새로고침해 주세요." };
  }

  try {
    const requestData = await getCurrentAuditLogRequestData();
    await runStaffTaskTransaction(async (tx) => {
      const existing = await tx.staffTask.findFirst({ where: { id: input.id, assigneeId: user.id } });
      if (!existing) throw new StaffTaskInputError("본인에게 배정된 할 일만 변경할 수 있습니다. 목록을 새로고침해 주세요.");
      if (existing.version !== input.version) throw new StaffTaskInputError(conflictMessage);
      if (Boolean(existing.completedAt) === input.completed) return;
      const completedAt = input.completed ? new Date() : null;
      const updated = await tx.staffTask.updateMany({
        where: { id: input.id, assigneeId: user.id, version: input.version },
        data: { completedAt, version: { increment: 1 } },
      });
      if (updated.count !== 1) throw new StaffTaskInputError(conflictMessage);
      await tx.auditLog.create({
        data: {
          ...requestData,
          actorId: user.id,
          action: AuditAction.UPDATE_STAFF_TASK,
          targetType: "StaffTask",
          targetId: input.id,
          message: input.completed ? "본인 할 일을 완료했습니다." : "본인 할 일의 완료를 취소했습니다.",
          metadata: { changeType: input.completed ? "staffTask.complete" : "staffTask.reopen", completedAt: completedAt?.toISOString() ?? null },
        },
      });
    });
    revalidateStaffTasks();
    return { success: input.completed ? "완료했습니다." : "완료를 취소했습니다." };
  } catch (error) {
    if (error instanceof StaffTaskInputError) return { error: error.message };
    console.error("Failed to change staff task completion", error);
    return { error: "완료 상태를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }
}

async function assertEligibleAssignee(tx: Prisma.TransactionClient, assigneeId: string) {
  const assignee = await tx.user.findFirst({
    where: { id: assigneeId, ...eligibleStaffTaskAssigneeWhere(getStaffTaskToday()) },
    select: { id: true },
  });
  if (!assignee) throw new StaffTaskInputError("현재 재직 중인 활성 직원을 담당자로 선택해 주세요.");
}

function taskData(values: StaffTaskFormValues) {
  return {
    title: values.title,
    description: values.description || null,
    meetingTitle: values.meetingTitle || null,
    dueDate: values.dueDate || null,
    assigneeId: values.assigneeId,
  };
}

function matchesTaskValues(existing: ReturnType<typeof taskData>, values: StaffTaskFormValues) {
  const next = taskData(values);
  return existing.title === next.title && existing.description === next.description &&
    existing.meetingTitle === next.meetingTitle && existing.dueDate === next.dueDate && existing.assigneeId === next.assigneeId;
}

async function runStaffTaskTransaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      // A concurrent duplicate create is re-read on retry; conditional versions protect updates.
      if (attempt < 2 && error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2002" || error.code === "P2034")) continue;
      throw error;
    }
  }
}

function staffTaskFormFailure(error: unknown, values: StaffTaskFormValues, fallback: string): StaffTaskFormState {
  if (error instanceof StaffTaskInputError) return { error: error.message, values };
  console.error("Failed to save staff task", error);
  return { error: fallback, values };
}

function revalidateStaffTasks() {
  revalidatePath("/");
  revalidatePath("/tasks");
  revalidatePath("/admin/tasks");
}

class StaffTaskInputError extends Error {}
