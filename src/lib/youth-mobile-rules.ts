import "server-only";
import { randomUUID } from "node:crypto";
import { AuditAction, type Prisma } from "@/generated/prisma/client";
import { YouthError } from "@/lib/mobile-youth-core";
import { activityId, activityObject, activityToken, activityPage, activityQuery, assertActivityVersion, parseRuleCreate } from "@/lib/youth-mobile-activity-core";
import { withYouthRead, withYouthMutation, lockOperationalYouth, youthPermissions, type YouthContext } from "@/lib/youth-mobile-context";
import { isYouthRuleCategory } from "@/lib/youth-management-core";
import { youthOperationalWhere } from "@/lib/youth-retention-core";
const ruleSelect = { id: true, category: true, detail: true, targetYouthId: true, targetYouth: { select: { name: true } }, createdAt: true, updatedAt: true } satisfies Prisma.YouthRuleSelect;
type RuleRecord = Prisma.YouthRuleGetPayload<{ select: typeof ruleSelect }>;
const mapRule = (row: RuleRecord) => ({ id: row.id, category: row.category, detail: row.detail, targetYouthId: row.targetYouthId, targetYouthName: row.targetYouth?.name ?? null, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
export function ruleQuery(url: URL) {
  const query = activityQuery(url, ["target", "category", "page"]), target = query.target ?? "all", category = query.category ?? "all", page = activityPage(query.page);
  if (target !== "all" && target !== "common") activityId(target);
  if (category !== "all" && !isYouthRuleCategory(category)) throw new YouthError("규칙 카테고리를 확인하세요.", "INVALID_REQUEST", 400);
  return { target, category, page };
}
export async function getMobileYouthRules(ctx: YouthContext, url: URL) {
  const query = ruleQuery(url);
  return withYouthRead(ctx, async (tx, actor, today) => {
    if (query.target !== "all" && query.target !== "common") await lockOperationalYouth(tx, query.target, today);
    const where: Prisma.YouthRuleWhereInput = { ...(query.category === "all" ? {} : { category: query.category }), ...(query.target === "all" ? { OR: [{ targetYouthId: null }, { targetYouth: { is: youthOperationalWhere(today) } }] } : { targetYouthId: query.target === "common" ? null : query.target }) };
    const total = await tx.youthRule.count({ where }), totalPages = Math.max(1, Math.ceil(total / 10)), page = Math.min(query.page, totalPages);
    const rows = await tx.youthRule.findMany({ where, select: ruleSelect, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * 10, take: 10 });
    return { today, permissions: youthPermissions(actor), target: query.target, category: query.category, page, pageSize: 10, total, totalPages, rules: rows.map(mapRule) };
  });
}
export async function createMobileYouthRule(ctx: YouthContext, raw: unknown) {
  const body = parseRuleCreate(raw);
  return withYouthMutation(ctx, { operation: "rule.create", requestId: body.requestId, payload: { category: body.category, detail: body.detail }, youthId: body.targetYouthId, targetType: "YouthRule", replay: async (tx, _actor, today, _now, receipt) => { const row = await tx.youthRule.findUnique({ where: { id: receipt.targetId }, select: ruleSelect }); if (!row || row.targetYouthId !== body.targetYouthId) return null; if (row.targetYouthId) await lockOperationalYouth(tx, row.targetYouthId, today); return { rule: mapRule(row) }; } }, async (tx, actor, _today, now) => {
    const row = await tx.youthRule.create({ data: { id: `youth-rule-${randomUUID()}`, category: body.category, detail: body.detail, targetYouthId: body.targetYouthId, createdAt: now, updatedAt: now }, select: ruleSelect });
    await ruleAudit(tx, ctx, actor.id, "create", row);
    return { targetId: row.id, committedUpdatedAt: row.updatedAt, result: { rule: mapRule(row) } };
  });
}
export async function deleteMobileYouthRule(ctx: YouthContext, id: string, raw: unknown, legacy = false) {
  const body = activityObject(raw, ["requestId", "expectedUpdatedAt", "targetYouthId"]), requestId = activityId(body.requestId, true), targetYouthId = body.targetYouthId === null ? null : activityId(body.targetYouthId), expected = legacy && body.expectedUpdatedAt === undefined ? undefined : activityToken(body.expectedUpdatedAt);
  return withYouthMutation(ctx, { operation: "rule.delete", requestId, payload: { expectedUpdatedAt: expected ?? null }, youthId: targetYouthId, targetType: "YouthRule", targetId: activityId(id), replay: async () => ({ ruleId: id }) }, async (tx, actor, today) => {
    await tx.$queryRaw`SELECT "id" FROM "YouthRule" WHERE "id" = ${id} FOR UPDATE`;
    const row = await tx.youthRule.findUnique({ where: { id }, select: ruleSelect });
    if (!row || row.targetYouthId !== targetYouthId) throw new YouthError("규칙을 확인할 수 없습니다.", "NOT_FOUND", 404);
    if (row.targetYouthId) await lockOperationalYouth(tx, row.targetYouthId, today);
    assertActivityVersion(row.updatedAt, expected);
    await tx.youthRule.delete({ where: { id } });
    await ruleAudit(tx, ctx, actor.id, "delete", row);
    return { targetId: id, committedUpdatedAt: row.updatedAt, result: { ruleId: id } };
  });
}
async function ruleAudit(tx: Prisma.TransactionClient, ctx: YouthContext, actorId: string, type: string, row: RuleRecord) {
  await tx.auditLog.create({ data: { ...ctx.requestData, actorId, action: AuditAction.UPDATE_YOUTH, targetType: "YouthRule", targetId: row.id, message: `청소년 규칙을 ${type === "create" ? "등록" : "삭제"}했습니다.`, metadata: { source: "youth-rules", changeType: `youthRule.${type}`, category: row.category, targetYouthId: row.targetYouthId, targetYouthName: row.targetYouth?.name ?? null } } });
}
