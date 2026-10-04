import "server-only";
import { getMobileSession } from "@/lib/mobile-auth";
import { getAuditLogRequestData } from "@/lib/audit-log-request";
import { getLoginRequestInfo } from "@/lib/login-history-core";
import { CafeError, cafeQuery, cafeId, cafePage, parseCafePageQuery, parseCafeHistoryQuery, parseMealMenuDate, readCafeJson } from "@/lib/mobile-cafe-core";
import { getMobileMealMenu, getMobileCafeItems, getMobileCafeItem, getMobileCafeHistory, getMobileCafeNotes } from "@/lib/cafe-queries";
import { cafeToday, type CafeContext } from "@/lib/cafe-context";
import { parseCafeCommand, type CafeOperation } from "@/lib/cafe-mutations-core";
import { mutateCafe, getCafeMutationStatus } from "@/lib/cafe-mutations";
export const cafePrivateHeaders = { "Cache-Control": "private, no-store", Pragma: "no-cache", Vary: "Authorization, Cookie", "X-Content-Type-Options": "nosniff" };
export const cafeJson = (data: unknown, status = 200) => Response.json(data, { status, headers: cafePrivateHeaders });
export function cafeFailure(error: unknown) { return error instanceof CafeError ? cafeJson({ error: error.message, code: error.code, ...(error.fields ? { fields: error.fields } : {}) }, error.status) : cafeJson({ error: "요청을 처리하지 못했습니다. 같은 요청으로 결과를 다시 확인해 주세요.", code: "INTERNAL_ERROR" }, 500); }
export type CafeRouteAction = "meal-menu" | "items" | "item" | "history" | "notes" | "mutation-status" | CafeOperation;
export async function mobileCafeResponse(request: Request, action: CafeRouteAction, id?: () => Promise<string>) {
  try {
    const session = await getMobileSession(request); if (!session) throw new CafeError("인증이 필요합니다.", "UNAUTHORIZED", 401);
    const now = new Date(), context: CafeContext = { actorId: session.userId, now: () => now, requestData: getAuditLogRequestData(getLoginRequestInfo(request.headers)) }, url = new URL(request.url), target = id ? cafeId(await id(), action === "mutation-status") : undefined;
    if (action === "meal-menu") return cafeJson(await getMobileMealMenu(context, parseMealMenuDate(url, cafeToday(now))));
    if (action === "items") return cafeJson(await getMobileCafeItems(context, parseCafePageQuery(url)));
    if (action === "history") return cafeJson(await getMobileCafeHistory(context, parseCafeHistoryQuery(url)));
    if (action === "notes") { const q = cafeQuery(url, ["page"]); return cafeJson(await getMobileCafeNotes(context, cafePage(q.page))); }
    cafeQuery(url);
    if (action === "item") return cafeJson(await getMobileCafeItem(context, target!));
    if (action === "mutation-status") return cafeJson(await getCafeMutationStatus(context, target!));
    const result = await mutateCafe(context, parseCafeCommand(action, target, await readCafeJson(request)));
    return cafeJson(result, action.endsWith(".create") && !result.replayed ? 201 : 200);
  } catch (error) { return cafeFailure(error); }
}
