import "server-only";

import { getAuditLogRequestData } from "@/lib/audit-log-request";
import { getLoginRequestInfo } from "@/lib/login-history-core";
import { getMobileSession, mobileJson } from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";
import { canWriteDailyReport, isDailyReportDirector } from "@/lib/daily-report-core";
import { getWorkLogToday } from "@/lib/work-log-core";
import { revalidateDailyReports } from "@/lib/daily-report-cache";
import { DailyReportInputError, dailyReportWriteForbidden, dailyReportReviewForbidden, saveDailyReport, reviewDailyReport } from "@/lib/daily-report-mutations";
import { getDailyReportActor, getDailyReportHomeSummaryForActor, getDailyReportListForActor, getDailyReportEditorForActor, getDailyReportDetailForActor, type DailyReportActor, type DailyReportDb } from "@/lib/daily-report-queries";
import { MobileDailyReportRequestError, parseMobileDailyReportListQuery, parseMobileDailyReportEditorQuery, parseMobileDailyReportId, parseMobileDailyReportSave, parseMobileDailyReportReview } from "@/lib/mobile-daily-reports-core";

const unauthorized = () => new MobileDailyReportRequestError("로그인이 필요합니다.", 401, "UNAUTHORIZED");
function failure(error: unknown) {
  if (error instanceof MobileDailyReportRequestError) return mobileJson({ error: error.message, code: error.code, ...(error.fields ? { fields: error.fields } : {}) }, error.status);
  if (error instanceof DailyReportInputError) {
    const status = error.code === "UNAUTHORIZED" ? 401 : error.code === "NOT_FOUND" ? 404 : error.code === "REPORT_CONFLICT" ? 409 : error.code === "FORBIDDEN" || error.code === "NOT_ELIGIBLE" ? 403 : 400;
    return mobileJson({ error: error.message, code: error.code, ...(error.fields ? { fields: error.fields } : {}) }, status);
  }
  return mobileJson({ error: "업무보고를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.", code: "INTERNAL_ERROR" }, 500);
}
async function actorForRequest(request: Request) {
  const session = await getMobileSession(request);
  if (!session) throw unauthorized();
  const actor = await getDailyReportActor(session.userId);
  if (!actor || actor.status !== "ACTIVE") throw unauthorized();
  return actor;
}
async function queryResponse(request: Request, operation: (actor: DailyReportActor, db: DailyReportDb, today: string) => Promise<unknown>) {
  try {
    const session = await getMobileSession(request);
    if (!session) throw unauthorized();
    const data = await prisma.$transaction(async tx => {
      const actor = await getDailyReportActor(session.userId, tx);
      if (!actor || actor.status !== "ACTIVE") throw unauthorized();
      return operation(actor, tx, getWorkLogToday());
    }, { isolationLevel: "RepeatableRead" });
    return mobileJson(data);
  } catch (error) { return failure(error); }
}
async function boundedJson(request: Request, maxBytes: number): Promise<unknown> {
  if (!/^application\/json(?:;|$)/i.test(request.headers.get("content-type") ?? "")) throw new MobileDailyReportRequestError("JSON 요청이 필요합니다.");
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || !Number.isSafeInteger(Number(declared)))) throw new MobileDailyReportRequestError("요청 크기를 확인해 주세요.");
  const tooLarge = () => new MobileDailyReportRequestError("업무보고 요청이 너무 큽니다.", 413, "PAYLOAD_TOO_LARGE");
  if (declared !== null && Number(declared) > maxBytes) throw tooLarge();
  if (!request.body) throw new MobileDailyReportRequestError("보고서 입력 정보를 확인해 주세요.");
  const reader = request.body.getReader(), chunks: Uint8Array[] = [], deadline = Date.now() + 10000;
  let size = 0;
  try {
    while (true) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => { reject(new MobileDailyReportRequestError("요청 시간이 초과되었습니다. 입력을 보관하고 다시 시도해 주세요.", 408, "REQUEST_TIMEOUT")); void reader.cancel().catch(() => undefined); }, Math.max(1, deadline - Date.now()));
      });
      const next = await Promise.race([reader.read(), timeout]).finally(() => clearTimeout(timer));
      if (next.done) break;
      size += next.value.byteLength;
      if (size > maxBytes) { void reader.cancel().catch(() => undefined); throw tooLarge(); }
      chunks.push(next.value);
    }
  } finally { reader.releaseLock(); }
  if (declared !== null && Number(declared) !== size) throw new MobileDailyReportRequestError("요청 크기를 확인해 주세요.");
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, size))); }
  catch { throw new MobileDailyReportRequestError("보고서 입력 정보를 확인해 주세요."); }
}
export function getMobileDailyReportListResponse(request: Request) {
  return queryResponse(request, (actor, db, today) => getDailyReportListForActor(actor, parseMobileDailyReportListQuery(new URL(request.url).searchParams, isDailyReportDirector(actor), today), db, today));
}
export function getMobileDailyReportEditorResponse(request: Request) {
  return queryResponse(request, async (actor, db, today) => {
    if (isDailyReportDirector(actor)) throw new DailyReportInputError(dailyReportWriteForbidden, "FORBIDDEN");
    return getDailyReportEditorForActor(actor, parseMobileDailyReportEditorQuery(new URL(request.url).searchParams, today), db, today);
  });
}
export function getMobileDailyReportDetailResponse(request: Request, inputId: unknown) {
  return queryResponse(request, async (actor, db, today) => {
    const entry = await getDailyReportDetailForActor(actor, parseMobileDailyReportId(inputId), db);
    if (!entry) throw new DailyReportInputError("보고서를 찾을 수 없습니다.", "NOT_FOUND");
    const director = isDailyReportDirector(actor);
    return { mode: director ? "director" : "employee", today, canWrite: canWriteDailyReport(actor, today), canReview: director && !entry.reviewedAt, entry };
  });
}
export async function saveMobileDailyReportResponse(request: Request) {
  try {
    const actor = await actorForRequest(request);
    if (isDailyReportDirector(actor)) throw new DailyReportInputError(dailyReportWriteForbidden, "FORBIDDEN");
    if (!canWriteDailyReport(actor)) throw new DailyReportInputError(dailyReportWriteForbidden, "NOT_ELIGIBLE");
    const input = parseMobileDailyReportSave(await boundedJson(request, 8 * 1024 * 1024));
    const entry = await saveDailyReport({ actor, requestData: getAuditLogRequestData(getLoginRequestInfo(request.headers)), client: "mobile" }, input);
    revalidateDailyReports();
    return mobileJson({ ok: true, message: input.intent === "submit" ? "시설장에게 업무보고를 제출했습니다." : "임시저장했습니다. 제출 전에는 나에게만 보입니다.", entry });
  } catch (error) { return failure(error); }
}
export async function reviewMobileDailyReportResponse(request: Request, inputId: unknown) {
  try {
    const actor = await actorForRequest(request);
    if (!isDailyReportDirector(actor)) throw new DailyReportInputError(dailyReportReviewForbidden, "FORBIDDEN");
    const id = parseMobileDailyReportId(inputId), input = parseMobileDailyReportReview(await boundedJson(request, 8 * 1024));
    const entry = await reviewDailyReport({ actor, requestData: getAuditLogRequestData(getLoginRequestInfo(request.headers)), client: "mobile" }, { id, ...input });
    revalidateDailyReports();
    return mobileJson({ ok: true, message: "확인 완료로 표시했습니다.", entry });
  } catch (error) { return failure(error); }
}
export async function getMobileDailyReportHomeSummary(userId: string) {
  const today = getWorkLogToday();
  try {
    return await prisma.$transaction(async tx => {
      const actor = await getDailyReportActor(userId, tx);
      if (!actor || actor.status !== "ACTIVE") return { mode: "unavailable" as const, today };
      return getDailyReportHomeSummaryForActor(actor, tx, today);
    }, { isolationLevel: "RepeatableRead" });
  } catch { return { mode: "unavailable" as const, today }; }
}
