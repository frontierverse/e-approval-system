import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { getAuditLogRequestData } from "@/lib/audit-log-request";
import { getKoreanDateValue } from "@/lib/document-archive-policy";
import { getLoginRequestInfo } from "@/lib/login-history-core";
import { getMobileSession, mobileJson } from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";
import { getWorkSchedules, getWorkScheduleChangeLogs, getWorkScheduleChangeLogActors, mapWorkSchedule, workScheduleSelect } from "@/lib/work-schedules";
import { saveWorkSchedule, deleteWorkSchedule, WorkScheduleMutationError } from "@/lib/work-schedule-mutations";
import { safelyRevalidateWorkSchedules } from "@/lib/work-schedule-cache";
import { MobileScheduleRequestError, parseMobileScheduleQuery, parseMobileScheduleChangesQuery, parseMobileScheduleId, parseMobileScheduleSave, parseMobileScheduleDelete, requireNoMobileScheduleQuery, toMobileSchedule, toMobileManualSchedule, toMobileScheduleChange, mobileScheduleCounts } from "@/lib/mobile-schedules-core";

const unauthorized = () => new MobileScheduleRequestError("로그인이 필요합니다.", 401, "UNAUTHORIZED");
function failure(error: unknown, query = false) {
  if (error instanceof MobileScheduleRequestError) return mobileJson({ error: error.message, code: error.code, ...(error.fields ? { fields: error.fields } : {}) }, error.status);
  if (error instanceof WorkScheduleMutationError) return mobileJson({ error: error.message, code: error.code }, error.status);
  return mobileJson({ error: query ? "업무 일정을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." : "업무 일정을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.", code: query ? "LOAD_FAILED" : "INTERNAL_ERROR" }, query ? 503 : 500);
}
async function freshActor(id: string, db: Pick<Prisma.TransactionClient, "user"> = prisma) {
  const actor = await db.user.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!actor || actor.status !== "ACTIVE") throw unauthorized();
  return actor;
}
async function actorForRequest(request: Request) {
  const session = await getMobileSession(request);
  if (!session) throw unauthorized();
  return freshActor(session.userId);
}
async function boundedJson(request: Request): Promise<unknown> {
  if (!/^application\/json(?:;|$)/i.test(request.headers.get("content-type") ?? "")) throw new MobileScheduleRequestError("JSON 요청이 필요합니다.");
  const declared = request.headers.get("content-length"), maxBytes = 8 * 1024 * 1024;
  if (declared !== null && (!/^\d+$/.test(declared) || !Number.isSafeInteger(Number(declared)))) throw new MobileScheduleRequestError("요청 크기를 확인해 주세요.");
  const tooLarge = () => new MobileScheduleRequestError("업무 일정 요청이 너무 큽니다.", 413, "PAYLOAD_TOO_LARGE");
  if (declared !== null && Number(declared) > maxBytes) throw tooLarge();
  if (!request.body) throw new MobileScheduleRequestError("업무 일정 입력 정보를 확인해 주세요.");
  const reader = request.body.getReader(), chunks: Uint8Array[] = [], deadline = Date.now() + 10000;
  let size = 0;
  try {
    while (true) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => {
        reject(new MobileScheduleRequestError("요청 시간이 초과되었습니다. 입력을 보관하고 다시 시도해 주세요.", 408, "REQUEST_TIMEOUT")); void reader.cancel().catch(() => undefined);
      }, Math.max(1, deadline - Date.now())); });
      const next = await Promise.race([reader.read(), timeout]).finally(() => clearTimeout(timer));
      if (next.done) break;
      size += next.value.byteLength;
      if (size > maxBytes) { void reader.cancel().catch(() => undefined); throw tooLarge(); }
      chunks.push(next.value);
    }
  } finally { reader.releaseLock(); }
  if (declared !== null && Number(declared) !== size) throw new MobileScheduleRequestError("요청 크기를 확인해 주세요.");
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, size))); }
  catch { throw new MobileScheduleRequestError("업무 일정 입력 정보를 확인해 주세요."); }
}
async function queryResponse(request: Request, kind: "page" | "manual" | "changes", rawId?: unknown) {
  try {
    const session = await getMobileSession(request);
    if (!session) throw unauthorized();
    const data = await prisma.$transaction(async tx => {
      await freshActor(session.userId, tx);
      const today = getKoreanDateValue(), params = new URL(request.url).searchParams;
      if (kind === "manual") {
        requireNoMobileScheduleQuery(params);
        const id = parseMobileScheduleId(rawId), row = await tx.workSchedule.findUnique({ where: { id }, select: workScheduleSelect });
        if (!row) throw new MobileScheduleRequestError("일정을 찾을 수 없습니다.", 404, "NOT_FOUND");
        return { today, item: toMobileManualSchedule(mapWorkSchedule(row)) };
      }
      if (kind === "changes") {
        const filters = parseMobileScheduleChangesQuery(params);
        const result = await getWorkScheduleChangeLogs(filters, tx), actors = await getWorkScheduleChangeLogActors(tx);
        return { ...result, logs: result.logs.map(toMobileScheduleChange), actors: actors.map(actor => ({ id: actor.id, name: actor.name })) };
      }
      const filters = parseMobileScheduleQuery(params, today), items = (await getWorkSchedules(filters.month, tx, today)).map(toMobileSchedule);
      items.sort((a, b) => a.scheduleDate.localeCompare(b.scheduleDate) || Number(b.allDay) - Number(a.allDay) || ("startMinute" in a ? a.startMinute ?? 0 : 0) - ("startMinute" in b ? b.startMinute ?? 0 : 0) || ("endMinute" in a ? a.endMinute ?? 0 : 0) - ("endMinute" in b ? b.endMinute ?? 0 : 0) || a.id.localeCompare(b.id));
      return { today, ...filters, canManage: true, items, monthCounts: mobileScheduleCounts(items), selectedCounts: mobileScheduleCounts(items.filter(item => item.scheduleDate === filters.selectedDate)) };
    }, { isolationLevel: "RepeatableRead" });
    return mobileJson(data);
  } catch (error) { return failure(error, true); }
}
export function getMobileSchedulePageResponse(request: Request) { return queryResponse(request, "page"); }
export function getMobileManualScheduleResponse(request: Request, id: unknown) { return queryResponse(request, "manual", id); }
export function getMobileScheduleChangesResponse(request: Request) { return queryResponse(request, "changes"); }
export async function saveMobileScheduleResponse(request: Request, rawId?: unknown) {
  try {
    const actor = await actorForRequest(request);
    requireNoMobileScheduleQuery(new URL(request.url).searchParams);
    const id = rawId === undefined ? undefined : parseMobileScheduleId(rawId), input = parseMobileScheduleSave(await boundedJson(request), id === undefined);
    const result = await saveWorkSchedule({ actorId: actor.id, client: "mobile", requestData: getAuditLogRequestData(getLoginRequestInfo(request.headers)) }, input, id === undefined ? undefined : { id, expectedUpdatedAt: input.expectedUpdatedAt });
    if (!result.schedule || (result.change !== "create" && result.change !== "update" && result.change !== "unchanged")) throw new Error("Unexpected schedule result");
    if (result.change !== "unchanged") safelyRevalidateWorkSchedules(result.sourceDate, result.schedule.scheduleDate);
    return mobileJson({ ok: true, message: result.change === "create" ? "업무 일정을 등록했습니다." : result.change === "update" ? "업무 일정을 수정했습니다." : "변경된 내용이 없습니다.", change: result.change, item: toMobileManualSchedule(result.schedule) });
  } catch (error) { return failure(error); }
}
export async function deleteMobileScheduleResponse(request: Request, rawId: unknown) {
  try {
    const actor = await actorForRequest(request);
    requireNoMobileScheduleQuery(new URL(request.url).searchParams);
    const id = parseMobileScheduleId(rawId), expectedUpdatedAt = parseMobileScheduleDelete(await boundedJson(request));
    const result = await deleteWorkSchedule({ actorId: actor.id, client: "mobile", requestData: getAuditLogRequestData(getLoginRequestInfo(request.headers)) }, { id, expectedUpdatedAt });
    if (result.schedule) safelyRevalidateWorkSchedules(result.schedule.scheduleDate);
    return mobileJson({ ok: true, message: result.change === "deleted" ? "업무 일정을 삭제했습니다." : "업무 일정이 이미 삭제되었습니다.", change: result.change, deletedId: id });
  } catch (error) { return failure(error); }
}
