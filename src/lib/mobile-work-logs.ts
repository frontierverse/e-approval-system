import "server-only";

import { getAuditLogRequestData } from "@/lib/audit-log-request";
import { getLoginRequestInfo } from "@/lib/login-history-core";
import { getMobileSession, mobileJson } from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";
import { getWorkLogToday } from "@/lib/work-log-core";
import { getWorkLogEntry, getWorkLogPageData } from "@/lib/work-logs";
import { getWorkLogLinkedScheduleLoadState } from "@/lib/work-log-linked-schedules";
import { deleteOwnWorkLog, saveOwnWorkLog, WorkLogMutationError } from "@/lib/work-log-mutations";
import { safelyRevalidateWorkLogs } from "@/lib/work-log-cache";
import { MobileWorkLogRequestError, parseMobileWorkLogDate, parseMobileWorkLogQuery, parseMobileWorkLogSave, parseMobileWorkLogDelete, toMobileWorkLogEntry, toMobileWorkLogRecent } from "@/lib/mobile-work-logs-core";
import type { Prisma } from "@/generated/prisma/client";

const unauthorized = () => new MobileWorkLogRequestError("로그인이 필요합니다.", 401, "UNAUTHORIZED");
function failure(error: unknown, query = false) {
  if (error instanceof MobileWorkLogRequestError) return mobileJson({ error: error.message, code: error.code, ...(error.fields ? { fields: error.fields } : {}) }, error.status);
  if (error instanceof WorkLogMutationError) return mobileJson({ error: error.message, code: error.code, ...(error.fields ? { fields: error.fields } : {}), ...(error.currentUpdatedAt !== undefined ? { currentUpdatedAt: error.currentUpdatedAt } : {}) }, error.code === "UNAUTHORIZED" ? 401 : error.code === "WORK_LOG_CONFLICT" ? 409 : 400);
  return mobileJson({ error: query ? "업무일지와 자동 연동 기록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." : "업무일지를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.", code: query ? "LOAD_FAILED" : "INTERNAL_ERROR" }, query ? 503 : 500);
}
async function freshActor(id: string, db: Pick<Prisma.TransactionClient, "user"> = prisma) {
  const actor = await db.user.findUnique({ where: { id }, select: { id: true, name: true, status: true } });
  if (!actor || actor.status !== "ACTIVE") throw unauthorized();
  return actor;
}
async function actorForRequest(request: Request) {
  const session = await getMobileSession(request);
  if (!session) throw unauthorized();
  return freshActor(session.userId);
}
async function boundedJson(request: Request): Promise<unknown> {
  if (!/^application\/json(?:;|$)/i.test(request.headers.get("content-type") ?? "")) throw new MobileWorkLogRequestError("JSON 요청이 필요합니다.");
  const declared = request.headers.get("content-length"), maxBytes = 64 * 1024;
  if (declared !== null && (!/^\d+$/.test(declared) || !Number.isSafeInteger(Number(declared)))) throw new MobileWorkLogRequestError("요청 크기를 확인해 주세요.");
  const tooLarge = () => new MobileWorkLogRequestError("업무일지 요청이 너무 큽니다.", 413, "PAYLOAD_TOO_LARGE");
  if (declared !== null && Number(declared) > maxBytes) throw tooLarge();
  if (!request.body) throw new MobileWorkLogRequestError("업무일지 입력 정보를 확인해 주세요.");
  const reader = request.body.getReader(), chunks: Uint8Array[] = [], deadline = Date.now() + 10000;
  let size = 0;
  try {
    while (true) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => {
        reject(new MobileWorkLogRequestError("요청 시간이 초과되었습니다. 입력을 보관하고 다시 시도해 주세요.", 408, "REQUEST_TIMEOUT")); void reader.cancel().catch(() => undefined);
      }, Math.max(1, deadline - Date.now())); });
      const next = await Promise.race([reader.read(), timeout]).finally(() => clearTimeout(timer));
      if (next.done) break;
      size += next.value.byteLength;
      if (size > maxBytes) { void reader.cancel().catch(() => undefined); throw tooLarge(); }
      chunks.push(next.value);
    }
  } finally { reader.releaseLock(); }
  if (declared !== null && Number(declared) !== size) throw new MobileWorkLogRequestError("요청 크기를 확인해 주세요.");
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, size))); }
  catch { throw new MobileWorkLogRequestError("업무일지 입력 정보를 확인해 주세요."); }
}
async function queryResponse(request: Request, inputDate?: unknown) {
  try {
    const session = await getMobileSession(request);
    if (!session) throw unauthorized();
    const data = await prisma.$transaction(async tx => {
      const actor = await freshActor(session.userId, tx), today = getWorkLogToday();
      const params = new URL(request.url).searchParams;
      if (inputDate !== undefined) {
        parseMobileWorkLogQuery(params, today, false);
        const workDate = parseMobileWorkLogDate(inputDate, today), entry = await getWorkLogEntry({ authorId: actor.id, workDate }, tx);
        const linkedScheduleState = await getWorkLogLinkedScheduleLoadState(workDate, tx, today);
        return { today, workDate, entry: entry ? toMobileWorkLogEntry(entry, actor.name) : null, linkedScheduleState };
      }
      const selectedDate = parseMobileWorkLogQuery(params, today)!, page = await getWorkLogPageData({ authorId: actor.id, selectedDate, today }, tx);
      return { today, selectedDate, userName: actor.name, contributionDates: page.contributionDates, recentLogs: page.recentLogs.map(toMobileWorkLogRecent), selectedEntry: page.selectedLog ? toMobileWorkLogEntry(page.selectedLog, actor.name) : null, linkedScheduleState: page.linkedScheduleState };
    }, { isolationLevel: "RepeatableRead" });
    return mobileJson(data);
  } catch (error) { return failure(error, true); }
}
export function getMobileWorkLogPageResponse(request: Request) { return queryResponse(request); }
export function getMobileWorkLogDateResponse(request: Request, date: unknown) { return queryResponse(request, date); }
export async function saveMobileWorkLogResponse(request: Request) {
  try {
    const actor = await actorForRequest(request), today = getWorkLogToday();
    parseMobileWorkLogQuery(new URL(request.url).searchParams, today, false);
    const input = parseMobileWorkLogSave(await boundedJson(request), today);
    const result = await saveOwnWorkLog({ actor, client: "mobile", today, requestData: getAuditLogRequestData(getLoginRequestInfo(request.headers)) }, input);
    if (result.change !== "unchanged") safelyRevalidateWorkLogs();
    return mobileJson({ ok: true, message: result.change === "create" ? "업무일지를 등록했습니다." : result.change === "update" ? "업무일지를 수정했습니다." : "변경된 내용이 없습니다.", change: result.change, entry: toMobileWorkLogEntry(result.entry, actor.name) });
  } catch (error) { return failure(error); }
}
export async function deleteMobileWorkLogResponse(request: Request, date: unknown) {
  try {
    const actor = await actorForRequest(request), today = getWorkLogToday();
    parseMobileWorkLogQuery(new URL(request.url).searchParams, today, false);
    const workDate = parseMobileWorkLogDate(date, today), input = parseMobileWorkLogDelete(await boundedJson(request));
    const result = await deleteOwnWorkLog({ actor, client: "mobile", today, requestData: getAuditLogRequestData(getLoginRequestInfo(request.headers)) }, { ...input, workDate });
    safelyRevalidateWorkLogs();
    return mobileJson({ ok: true, message: result.kind === "deleted" ? "업무일지를 삭제했습니다." : "업무일지가 이미 삭제되었습니다.", change: result.kind, deletedId: input.manualLogId, workDate, entry: result.combinedEntry ? toMobileWorkLogEntry(result.combinedEntry, actor.name) : null });
  } catch (error) { return failure(error); }
}
