import "server-only";
import { getMobileSession } from "@/lib/mobile-auth";
import { getAuditLogRequestData } from "@/lib/audit-log-request";
import { getLoginRequestInfo } from "@/lib/login-history-core";
import { YouthError, readYouthJson } from "@/lib/mobile-youth-core";
import { youthJson, youthFailure } from "@/lib/mobile-youth";
import { activityId, activityQuery } from "@/lib/youth-mobile-activity-core";
import type { YouthContext } from "@/lib/youth-mobile-context";
import { getMobilePersonalSchedules, getMobilePersonalSchedule, createMobilePersonalSchedule, updateMobilePersonalSchedule, deleteMobilePersonalSchedule, getMobileCommonSchedules, mutateMobileCommonSchedules } from "@/lib/youth-mobile-schedules";
import { getMobileYouthConcepts, getMobileYouthLearning, createMobileYouthConcept, deleteMobileYouthConcept, checkMobileYouthConcept } from "@/lib/youth-mobile-learning";
import { getMobileYouthRules, createMobileYouthRule, deleteMobileYouthRule } from "@/lib/youth-mobile-rules";
import { getMobileCommonScheduleHistory, getMobileYouthLearningHistory, getMobileYouthRuleHistory } from "@/lib/youth-mobile-activity-history";
export type YouthActivityAction = "personal-list" | "personal-detail" | "personal-create" | "personal-update" | "personal-delete" | "common-list" | "common-batch" | "common-history" | "concepts" | "learning" | "learning-history" | "concept-create" | "concept-delete" | "concept-check" | "rules" | "rule-create" | "rule-delete" | "rule-history";
export async function mobileYouthActivityResponse(request: Request, action: YouthActivityAction, params?: () => Promise<Record<string, string>>) {
  try {
    const session = await getMobileSession(request);
    if (!session) throw new YouthError("인증이 필요합니다.", "UNAUTHORIZED", 401);
    const ctx: YouthContext = { actorId: session.userId, requestData: getAuditLogRequestData(getLoginRequestInfo(request.headers)), client: "mobile" }, url = new URL(request.url), ids = params ? await params() : {};
    const id = ids.id === undefined ? undefined : activityId(ids.id), conceptId = ids.conceptId === undefined ? undefined : activityId(ids.conceptId);
    if (action === "personal-list") return youthJson(await getMobilePersonalSchedules(ctx, id!, url));
    if (action === "common-list") { const query = activityQuery(url, ["weekday"]); if (query.weekday !== undefined && !/^[1-5]$/.test(query.weekday)) throw new YouthError("요일을 확인하세요.", "INVALID_REQUEST", 400); return youthJson(await getMobileCommonSchedules(ctx, Number(query.weekday ?? "1"))); }
    if (action === "concepts") return youthJson(await getMobileYouthConcepts(ctx, url));
    if (action === "learning") return youthJson(await getMobileYouthLearning(ctx, id!, url));
    if (action === "rules") return youthJson(await getMobileYouthRules(ctx, url));
    if (action === "common-history") return youthJson(await getMobileCommonScheduleHistory(ctx, url));
    if (action === "learning-history") return youthJson(await getMobileYouthLearningHistory(ctx, id!, url));
    if (action === "rule-history") return youthJson(await getMobileYouthRuleHistory(ctx, url));
    activityQuery(url, []);
    if (action === "personal-detail") return youthJson(await getMobilePersonalSchedule(ctx, id!));
    const body = await readYouthJson(request, action === "common-batch" ? 8 * 1024 * 1024 : 65536);
    const result = action === "personal-create" ? await createMobilePersonalSchedule(ctx, id!, body) : action === "personal-update" ? await updateMobilePersonalSchedule(ctx, id!, body) : action === "personal-delete" ? await deleteMobilePersonalSchedule(ctx, id!, body) : action === "common-batch" ? await mutateMobileCommonSchedules(ctx, body) : action === "concept-create" ? await createMobileYouthConcept(ctx, body) : action === "concept-delete" ? await deleteMobileYouthConcept(ctx, id!, body) : action === "concept-check" ? await checkMobileYouthConcept(ctx, id!, conceptId!, body) : action === "rule-create" ? await createMobileYouthRule(ctx, body) : action === "rule-delete" ? await deleteMobileYouthRule(ctx, id!, body) : null;
    if (!result) throw new YouthError();
    return youthJson(result, action.endsWith("create") && !result.replayed ? 201 : 200);
  } catch (error) { return youthFailure(error); }
}
