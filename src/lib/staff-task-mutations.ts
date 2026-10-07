import "server-only";
import { queueStaffPushEvent } from "@/lib/mobile-push-events";

import { AuditAction, Prisma, UserRole } from "@/generated/prisma/client";
import type { AuditLogRequestData } from "@/lib/audit-log-request";
import { prisma } from "@/lib/prisma";
import { eligibleStaffTaskAssigneeWhere, mapStaffTask, staffTaskSelect } from "@/lib/staff-task-queries";
import {
  getStaffTaskToday,
  isValidStaffTaskId,
  isValidStaffTaskVersion,
  validateStaffTaskFormValues,
  type StaffTaskFormValues,
} from "@/lib/staff-tasks-core";

export type StaffTaskActor = { id: string; role: UserRole };
export type StaffTaskMutationContext = {
  actor: StaffTaskActor;
  requestData?: AuditLogRequestData;
  client?: "mobile";
};
export type StaffTaskErrorCode = "INVALID_INPUT" | "FORBIDDEN" | "NOT_FOUND" | "TASK_CONFLICT" | "REQUEST_CONFLICT" | "NOT_ELIGIBLE";
export class StaffTaskInputError extends Error {
  constructor(message: string, public code: StaffTaskErrorCode = "INVALID_INPUT") { super(message); }
}
const conflictMessage = "다른 창에서 할 일이 변경되었습니다. 최신 내용을 확인한 뒤 다시 시도해 주세요.";

// Only authenticated web/mobile adapters create this trusted context. This is not a Server Action.
export async function createStaffTask(
  context: StaffTaskMutationContext,
  inputValues: StaffTaskFormValues,
  selfOnly: boolean,
) {
  const { actor, requestData } = context;
  const values = selfOnly ? { ...inputValues, assigneeId: actor.id } : inputValues;
  if (!selfOnly && actor.role !== UserRole.ADMIN) throw new StaffTaskInputError("관리자만 할 일을 등록할 수 있습니다.", "FORBIDDEN");
  const error = validateStaffTaskFormValues(values);
  if (error) throw new StaffTaskInputError(error);
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(values.requestId)) {
    throw new StaffTaskInputError("등록 요청을 확인할 수 없습니다. 입력 내용을 복사한 뒤 화면을 새로 열어 주세요.");
  }
  return runStaffTaskTransaction(async (tx) => {
    const existing = await tx.staffTask.findUnique({ where: { requestId: values.requestId } });
    if (existing) {
      if (existing.deletedAt) throw new StaffTaskInputError("이미 삭제된 등록 요청입니다. 새 등록 창에서 다시 추가해 주세요.", "REQUEST_CONFLICT");
      if (existing.createdById !== actor.id || !matchesTaskValues(existing, values)) {
        throw new StaffTaskInputError("이미 처리된 등록 요청입니다. 새 할 일 등록 화면에서 다시 입력해 주세요.", "REQUEST_CONFLICT");
      }
      return { task: await savedTaskItem(tx, existing.id), replayed: true };
    }
    await assertEligibleAssignee(tx, values.assigneeId);
    const task = await tx.staffTask.create({
      data: { ...taskData(values), requestId: values.requestId, createdById: actor.id },
    });
    await tx.auditLog.create({
      data: {
        ...requestData,
        actorId: actor.id,
        action: AuditAction.UPDATE_STAFF_TASK,
        targetType: "StaffTask",
        targetId: task.id,
        message: "직원 할 일을 등록했습니다.",
        metadata: { ...clientMetadata(context), changeType: "staffTask.create", assigneeId: task.assigneeId, dueDate: task.dueDate, before: null, after: taskSnapshot(task) },
      },
    });
    await queueStaffPushEvent(tx, { eventKey: `task:${task.id}:0`, kind: "TASK_ASSIGNED", targetId: task.id, targetVersion: "0", userIds: [task.assigneeId], actorId: actor.id });
    return { task: await savedTaskItem(tx, task.id), replayed: false };
  });
}

export async function updateStaffTask(
  context: StaffTaskMutationContext,
  input: { id: string; version: number; values: StaffTaskFormValues },
) {
  const { actor, requestData } = context;
  if (actor.role !== UserRole.ADMIN) throw new StaffTaskInputError("관리자만 할 일을 수정할 수 있습니다.", "FORBIDDEN");
  const error = validateStaffTaskFormValues(input.values);
  if (error) throw new StaffTaskInputError(error);
  if (!isValidStaffTaskId(input.id) || !isValidStaffTaskVersion(input.version)) {
    throw new StaffTaskInputError("수정할 할 일을 확인할 수 없습니다. 화면을 새로 열어 주세요.");
  }
  const { id, version, values } = input;
  return runStaffTaskTransaction(async (tx) => {
    const existing = await tx.staffTask.findUnique({ where: { id } });
    if (!existing) throw new StaffTaskInputError("할 일을 찾을 수 없습니다. 목록을 새로고침해 주세요.", "NOT_FOUND");
    if (existing.deletedAt) throw new StaffTaskInputError("삭제된 할 일은 수정할 수 없습니다. 목록을 새로고침해 주세요.", "NOT_FOUND");
    if (existing.version !== version) throw conflict();
    if (existing.assigneeId !== values.assigneeId) {
      if (existing.completedAt) throw new StaffTaskInputError("완료한 할 일의 담당자는 변경할 수 없습니다. 새 할 일로 등록해 주세요.");
      await assertEligibleAssignee(tx, values.assigneeId);
    }
    if (matchesTaskValues(existing, values)) return { task: await savedTaskItem(tx, id), changed: false };
    const updated = await tx.staffTask.updateMany({
      where: { id, version, deletedAt: null },
      data: { ...taskData(values), version: { increment: 1 } },
    });
    if (updated.count !== 1) throw conflict();
    await tx.auditLog.create({
      data: {
        ...requestData,
        actorId: actor.id,
        action: AuditAction.UPDATE_STAFF_TASK,
        targetType: "StaffTask",
        targetId: id,
        message: "직원 할 일을 수정했습니다.",
        metadata: {
          ...clientMetadata(context), changeType: "staffTask.update",
          previousAssigneeId: existing.assigneeId, assigneeId: values.assigneeId,
          dueDate: values.dueDate || null, before: taskSnapshot(existing),
          after: taskSnapshot({ ...existing, ...taskData(values), version: version + 1 }),
        },
      },
    });
    await queueStaffPushEvent(tx, { eventKey: `task:${id}:${version + 1}`, kind: existing.assigneeId === values.assigneeId ? "TASK_UPDATED" : "TASK_ASSIGNED", targetId: id, targetVersion: String(version + 1), userIds: [values.assigneeId], actorId: actor.id });
    if (existing.assigneeId !== values.assigneeId) await queueStaffPushEvent(tx, { eventKey: `task:${id}:${version + 1}:removed`, kind: "TASK_UNASSIGNED", targetId: id, userIds: [existing.assigneeId], actorId: actor.id });
    return { task: await savedTaskItem(tx, id), changed: true };
  });
}

export async function setOwnStaffTaskCompleted(
  context: StaffTaskMutationContext,
  input: { id: string; completed: boolean; version: number },
) {
  if (!input || !isValidStaffTaskId(input.id) || !isValidStaffTaskVersion(input.version) || typeof input.completed !== "boolean") {
    throw new StaffTaskInputError("할 일 정보를 확인할 수 없습니다. 목록을 새로고침해 주세요.");
  }
  const { actor, requestData } = context;
  return runStaffTaskTransaction(async (tx) => {
    const existing = await tx.staffTask.findFirst({ where: { id: input.id, assigneeId: actor.id, deletedAt: null } });
    if (!existing) throw new StaffTaskInputError("본인에게 배정된 할 일만 변경할 수 있습니다. 목록을 새로고침해 주세요.", "NOT_FOUND");
    if (existing.version !== input.version) throw conflict();
    if (Boolean(existing.completedAt) === input.completed) return { task: await savedTaskItem(tx, input.id), changed: false };
    const completedAt = input.completed ? new Date() : null;
    const updated = await tx.staffTask.updateMany({
      where: { id: input.id, assigneeId: actor.id, version: input.version, deletedAt: null },
      data: { completedAt, version: { increment: 1 } },
    });
    if (updated.count !== 1) throw conflict();
    await tx.auditLog.create({
      data: {
        ...requestData, actorId: actor.id, action: AuditAction.UPDATE_STAFF_TASK,
        targetType: "StaffTask", targetId: input.id,
        message: input.completed ? "본인 할 일을 완료했습니다." : "본인 할 일의 완료를 취소했습니다.",
        metadata: { ...clientMetadata(context), changeType: input.completed ? "staffTask.complete" : "staffTask.reopen", completedAt: completedAt?.toISOString() ?? null, before: taskSnapshot(existing), after: taskSnapshot({ ...existing, completedAt, version: existing.version + 1 }) },
      },
    });
    await queueStaffPushEvent(tx, { eventKey: `task:${input.id}:${input.version + 1}`, kind: input.completed ? "TASK_COMPLETED" : "TASK_REOPENED", targetId: input.id, targetVersion: String(input.version + 1), userIds: [existing.createdById], actorId: actor.id });
    return { task: await savedTaskItem(tx, input.id), changed: true };
  });
}

export async function deleteOwnStaffTask(
  context: StaffTaskMutationContext,
  input: { id: string; version: number },
) {
  if (!input || !isValidStaffTaskId(input.id) || !isValidStaffTaskVersion(input.version)) {
    throw new StaffTaskInputError("할 일 정보를 확인할 수 없습니다. 목록을 새로고침해 주세요.");
  }
  const { actor, requestData } = context;
  return runStaffTaskTransaction(async (tx) => {
    const task = await tx.staffTask.findFirst({ where: { id: input.id, assigneeId: actor.id } });
    if (!task) throw new StaffTaskInputError("본인에게 배정된 할 일만 삭제할 수 있습니다.", "NOT_FOUND");
    // Preserve the web's deletion replay semantics without writing a second audit.
    if (task.deletedAt) return { task: await savedTaskItem(tx, input.id), changed: false };
    if (task.version !== input.version) throw conflict();
    const deletedAt = new Date();
    const result = await tx.staffTask.updateMany({
      where: { id: input.id, assigneeId: actor.id, version: input.version, deletedAt: null },
      data: { deletedAt, version: { increment: 1 } },
    });
    if (result.count !== 1) throw conflict();
    await tx.auditLog.create({ data: {
      ...requestData, actorId: actor.id, action: AuditAction.UPDATE_STAFF_TASK,
      targetType: "StaffTask", targetId: task.id, message: "본인 할 일을 삭제했습니다. 업무 내용과 이력은 보존됩니다.",
      metadata: { ...clientMetadata(context), changeType: "staffTask.delete", before: taskSnapshot(task), after: taskSnapshot({ ...task, deletedAt, version: task.version + 1 }) },
    } });
    await queueStaffPushEvent(tx, { eventKey: `task:${input.id}:${input.version + 1}`, kind: "TASK_DELETED", targetId: input.id, targetVersion: String(input.version + 1), userIds: [task.createdById], actorId: actor.id });
    return { task: await savedTaskItem(tx, input.id), changed: true };
  });
}

async function savedTaskItem(tx: Prisma.TransactionClient, id: string) {
  const task = await tx.staffTask.findFirst({ where: { id }, select: staffTaskSelect });
  if (!task) throw new Error("Saved staff task is unavailable");
  return mapStaffTask(task);
}
function clientMetadata(context: StaffTaskMutationContext) { return context.client ? { client: context.client } : {}; }
function conflict() { return new StaffTaskInputError(conflictMessage, "TASK_CONFLICT"); }
function taskSnapshot(task: {
  title: string; description: string | null; meetingTitle: string | null;
  assigneeId: string; dueDate: string | null; completedAt: Date | null;
  deletedAt: Date | null; version: number;
}) {
  return { title: task.title, description: task.description, meetingTitle: task.meetingTitle,
    assigneeId: task.assigneeId, dueDate: task.dueDate, completedAt: task.completedAt?.toISOString() ?? null,
    deletedAt: task.deletedAt?.toISOString() ?? null, version: task.version };
}
async function assertEligibleAssignee(tx: Prisma.TransactionClient, assigneeId: string) {
  const assignee = await tx.user.findFirst({
    where: { id: assigneeId, ...eligibleStaffTaskAssigneeWhere(getStaffTaskToday()) }, select: { id: true },
  });
  if (!assignee) throw new StaffTaskInputError("현재 재직 중인 활성 직원을 담당자로 선택해 주세요.", "NOT_ELIGIBLE");
}
function taskData(values: StaffTaskFormValues) {
  return { title: values.title, description: values.description || null, meetingTitle: values.meetingTitle || null,
    dueDate: values.dueDate || null, assigneeId: values.assigneeId };
}
function matchesTaskValues(existing: ReturnType<typeof taskData>, values: StaffTaskFormValues) {
  const next = taskData(values);
  return existing.title === next.title && existing.description === next.description &&
    existing.meetingTitle === next.meetingTitle && existing.dueDate === next.dueDate && existing.assigneeId === next.assigneeId;
}
async function runStaffTaskTransaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try { return await prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }
    catch (error) {
      // Concurrent duplicate creation is re-read on retry; conditional versions protect updates.
      if (attempt < 2 && error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2002" || error.code === "P2034")) continue;
      throw error;
    }
  }
}
