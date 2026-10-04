import "server-only";

import { getAuditLogRequestData } from "@/lib/audit-log-request";
import { getLoginRequestInfo } from "@/lib/login-history-core";
import { getMobileSession, mobileJson } from "@/lib/mobile-auth";
import { revalidateStaffTasks } from "@/lib/staff-task-cache";
import { createStaffTask, deleteOwnStaffTask, setOwnStaffTaskCompleted, StaffTaskInputError } from "@/lib/staff-task-mutations";
import { getStaffTaskCounts, getStaffTaskHistoryForActor, getStaffTaskPage, staffTaskPageSize } from "@/lib/staff-task-queries";
import { getStaffTaskToday } from "@/lib/staff-tasks-core";
import { prisma } from "@/lib/prisma";
import { MobileStaffTaskRequestError, parseMobileStaffTaskCompletion, parseMobileStaffTaskCreate, parseMobileStaffTaskDelete, parseMobileStaffTaskFilters, parseMobileStaffTaskId, parseMobileStaffTaskPage } from "@/lib/mobile-staff-tasks-core";

const maxJsonBytes = 16 * 1024;
function refreshCommittedTaskCache(taskId?: string) {
  try { revalidateStaffTasks(taskId); }
  catch { /* The task and its audit have committed; cache failure cannot change that outcome. */ }
}
const unauthenticated = () => mobileJson({ error: "로그인이 필요합니다.", code: "UNAUTHORIZED" }, 401);
export function mobileStaffTaskFailure(cause: unknown) {
  if (cause instanceof MobileStaffTaskRequestError) return mobileJson({ error: cause.message, code: cause.code, ...(cause.fields ? { fields: cause.fields } : {}) }, cause.status);
  if (cause instanceof StaffTaskInputError) {
    if (cause.code === "NOT_FOUND") return mobileJson({ error: "할 일을 찾을 수 없습니다.", code: "NOT_FOUND" }, 404);
    const status = cause.code === "TASK_CONFLICT" || cause.code === "REQUEST_CONFLICT" ? 409 : cause.code === "NOT_ELIGIBLE" || cause.code === "FORBIDDEN" ? 403 : 400;
    return mobileJson({ error: cause.message, code: cause.code }, status);
  }
  return mobileJson({ error: "할 일을 처리하지 못했습니다. 잠시 후 다시 시도하세요.", code: "INTERNAL_ERROR" }, 500);
}
async function boundedJson(request: Request): Promise<unknown> {
  if (!/^application\/json(?:;|$)/i.test(request.headers.get("content-type") ?? "")) throw new MobileStaffTaskRequestError("JSON 요청이 필요합니다.");
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || !Number.isSafeInteger(Number(declared)))) throw new MobileStaffTaskRequestError("요청 크기가 올바르지 않습니다.");
  if (declared !== null && Number(declared) > maxJsonBytes) throw new MobileStaffTaskRequestError("할 일 요청이 너무 큽니다.", 413, "PAYLOAD_TOO_LARGE");
  if (!request.body) throw new MobileStaffTaskRequestError("할 일 요청이 올바르지 않습니다.");
  const reader = request.body.getReader();
  const deadline = Date.now() + 10_000;
  const chunks: Uint8Array[] = [];
  let size = 0;
  const checkDeadline = () => {
    if (Date.now() < deadline) return;
    void reader.cancel().catch(() => undefined);
    throw new MobileStaffTaskRequestError("요청 시간이 초과되었습니다. 연결을 확인하고 다시 시도하세요.", 408, "REQUEST_TIMEOUT");
  };
  try {
    while (true) {
      checkDeadline();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new MobileStaffTaskRequestError("요청 시간이 초과되었습니다. 연결을 확인하고 다시 시도하세요.", 408, "REQUEST_TIMEOUT"));
          void reader.cancel().catch(() => undefined);
        }, Math.max(1, deadline - Date.now()));
      });
      const next = await Promise.race([reader.read(), timeout]).finally(() => clearTimeout(timer));
      checkDeadline();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > maxJsonBytes) { void reader.cancel().catch(() => undefined); throw new MobileStaffTaskRequestError("할 일 요청이 너무 큽니다.", 413, "PAYLOAD_TOO_LARGE"); }
      chunks.push(next.value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, size))); }
  catch { throw new MobileStaffTaskRequestError("할 일 요청이 올바르지 않습니다."); }
}

export async function getMobileStaffTasksResponse(request: Request) {
  try {
    const session = await getMobileSession(request);
    if (!session) return unauthenticated();
    const filters = parseMobileStaffTaskFilters(new URL(request.url).searchParams);
    const today = getStaffTaskToday();
    const data = await prisma.$transaction(tx => getStaffTaskPage({ assigneeId: session.userId }, filters, tx, today), { isolationLevel: "RepeatableRead" });
    return mobileJson({ ...data, status: filters.status, today, pageSize: staffTaskPageSize });
  } catch (cause) { return mobileStaffTaskFailure(cause); }
}
export async function getMobileHomeTaskCounts(userId: string) {
  const counts = await prisma.$transaction(tx => getStaffTaskCounts({ assigneeId: userId }, getStaffTaskToday(), tx), { isolationLevel: "RepeatableRead" });
  return { pending: counts.pending, overdue: counts.overdue };
}
export async function createMobileStaffTaskResponse(request: Request) {
  try {
    const session = await getMobileSession(request);
    if (!session) return unauthenticated();
    const values = parseMobileStaffTaskCreate(await boundedJson(request), session.userId);
    const result = await createStaffTask(mutationContext(request, session.userId), values, true);
    refreshCommittedTaskCache();
    return mobileJson({ ok: true, message: "할 일을 등록했습니다.", task: result.task }, result.replayed ? 200 : 201);
  } catch (cause) { return mobileStaffTaskFailure(cause); }
}
export async function completeMobileStaffTaskResponse(request: Request, id: unknown) {
  try {
    const session = await getMobileSession(request);
    if (!session) return unauthenticated();
    const taskId = parseMobileStaffTaskId(id);
    const input = parseMobileStaffTaskCompletion(await boundedJson(request));
    const result = await setOwnStaffTaskCompleted(mutationContext(request, session.userId), { id: taskId, ...input });
    refreshCommittedTaskCache();
    return mobileJson({ ok: true, message: input.completed ? "완료했습니다." : "완료를 취소했습니다.", task: result.task });
  } catch (cause) { return mobileStaffTaskFailure(cause); }
}
export async function deleteMobileStaffTaskResponse(request: Request, id: unknown) {
  try {
    const session = await getMobileSession(request);
    if (!session) return unauthenticated();
    const taskId = parseMobileStaffTaskId(id);
    const input = parseMobileStaffTaskDelete(await boundedJson(request));
    const result = await deleteOwnStaffTask(mutationContext(request, session.userId), { id: taskId, ...input });
    refreshCommittedTaskCache(taskId);
    return mobileJson({ ok: true, message: "삭제했습니다. 삭제된 업무와 이력은 ‘삭제됨’에서 확인할 수 있습니다.", task: result.task });
  } catch (cause) { return mobileStaffTaskFailure(cause); }
}
function mutationContext(request: Request, userId: string) {
  return { actor: { id: userId, role: "USER" as const }, requestData: getAuditLogRequestData(getLoginRequestInfo(request.headers)), client: "mobile" as const };
}

const historyFields = {
  title: "할 일", description: "상세 내용", meetingTitle: "회의명", assigneeId: "담당자",
  dueDate: "기한", completedAt: "완료 일시", deletedAt: "삭제 일시",
} as const;
const knownChanges = new Set(["staffTask.create", "staffTask.update", "staffTask.complete", "staffTask.reopen", "staffTask.delete"]);
function record(value: unknown): Record<string, unknown> | null { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; }
export async function getMobileStaffTaskHistoryResponse(request: Request, id: unknown) {
  try {
    const session = await getMobileSession(request);
    if (!session) return unauthenticated();
    const taskId = parseMobileStaffTaskId(id);
    const page = parseMobileStaffTaskPage(new URL(request.url).searchParams);
    const today = getStaffTaskToday();
    const data = await prisma.$transaction(tx => getStaffTaskHistoryForActor({ id: session.userId, role: "USER" }, taskId, page, tx), { isolationLevel: "RepeatableRead" });
    if (!data) return mobileJson({ error: "할 일을 찾을 수 없습니다.", code: "NOT_FOUND" }, 404);
    const names = new Map(data.assignees.map(user => [user.id, user.name]));
    const logs = data.logs.map(log => {
      const metadata = record(log.metadata);
      const before = record(metadata?.before);
      const after = record(metadata?.after);
      const changes = after ? Object.entries(historyFields).flatMap(([field, label]) => {
        const oldValue = typeof before?.[field] === "string" ? before[field] as string : null;
        const newValue = typeof after[field] === "string" ? after[field] as string : null;
        if (oldValue === newValue) return [];
        const display = (value: string | null) => field === "assigneeId" && value ? names.get(value) ?? "이전 담당자" : value;
        return [{ field: field === "assigneeId" ? "assigneeName" : field, label, before: display(oldValue), after: display(newValue) }];
      }) : [];
      return { id: log.id, createdAt: log.createdAt.toISOString(), message: log.message, actorName: log.actor.name,
        changeType: typeof metadata?.changeType === "string" && knownChanges.has(metadata.changeType) ? metadata.changeType : null, changes };
    });
    return mobileJson({ task: data.task, logs, today, page: data.page, pageSize: staffTaskPageSize, total: data.total, totalPages: data.totalPages });
  } catch (cause) { return mobileStaffTaskFailure(cause); }
}
