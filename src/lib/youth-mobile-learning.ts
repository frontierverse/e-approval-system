import "server-only";
import { youthOperationalWhere } from "@/lib/youth-retention-core";
import { randomUUID } from "node:crypto";
import { AuditAction, type Prisma } from "@/generated/prisma/client";
import { YouthError } from "@/lib/mobile-youth-core";
import { activityId, activityObject, activityToken, activityQuery, assertActivityVersion, nextActivityToken, parseConceptCreate } from "@/lib/youth-mobile-activity-core";
import { withYouthRead, withYouthMutation, lockOperationalYouth, mapYouthBasic, youthPermissions, type YouthContext } from "@/lib/youth-mobile-context";
import { getYouthStudyCurriculum, getYouthStudySubunits, isYouthStudySubunitId } from "@/lib/youth-subject-progress-core";
const conceptSelect = { id: true, subject: true, subunitId: true, content: true, updatedAt: true } satisfies Prisma.StudyConceptSelect;
type ConceptRecord = Prisma.StudyConceptGetPayload<{ select: typeof conceptSelect }>;
const mapConcept = (row: ConceptRecord) => ({ ...row, updatedAt: row.updatedAt.toISOString() });
const notFound = () => new YouthError("수학 개념을 확인할 수 없습니다.", "NOT_FOUND", 404);
export async function getMobileYouthLearning(ctx: YouthContext, youthId: string, url: URL) {
  const query = activityQuery(url, ["subject", "subunitId"]), subject = query.subject ?? "math", subunitId = query.subunitId ?? getYouthStudySubunits("math")[0].id;
  if (subject !== "math" || !isYouthStudySubunitId(subject, subunitId)) throw new YouthError("수학 단원을 확인하세요.", "INVALID_REQUEST", 400);
  return withYouthRead(ctx, async (tx, actor, today) => {
    const youth = await lockOperationalYouth(tx, activityId(youthId), today);
    const rows = await tx.studyConcept.findMany({ where: { subject, subunitId }, select: { ...conceptSelect, checks: { where: { youthId }, select: { checkedAt: true } } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    return { today, permissions: youthPermissions(actor), youth: mapYouthBasic(youth), subject, subunitId, youthUpdatedAt: youth.updatedAt.toISOString(), curriculum: getYouthStudyCurriculum("math"), concepts: rows.map(row => ({ id: row.id, content: row.content, updatedAt: row.updatedAt.toISOString(), checked: row.checks.length > 0, checkedAt: row.checks[0]?.checkedAt.toISOString() ?? null })) };
  });
}
export async function createMobileYouthConcept(ctx: YouthContext, raw: unknown) {
  const body = parseConceptCreate(raw);
  return withYouthMutation(ctx, { operation: "concept.create", requestId: body.requestId, payload: { subject: body.subject, subunitId: body.subunitId, content: body.content }, targetType: "StudyConcept", replay: async (tx, _actor, _today, _now, receipt) => { const row = await tx.studyConcept.findUnique({ where: { id: receipt.targetId }, select: conceptSelect }); return row ? { concept: mapConcept(row) } : null; } }, async (tx, actor, _today, now) => {
    const row = await tx.studyConcept.create({ data: { id: randomUUID(), subject: body.subject, subunitId: body.subunitId, content: body.content, updatedAt: now }, select: conceptSelect });
    await conceptAudit(tx, ctx, actor.id, "create", row);
    return { targetId: row.id, committedUpdatedAt: row.updatedAt, result: { concept: mapConcept(row) } };
  });
}
export async function deleteMobileYouthConcept(ctx: YouthContext, id: string, raw: unknown, legacy = false) {
  const body = activityObject(raw, ["requestId", "expectedUpdatedAt"]), requestId = activityId(body.requestId, true), expected = legacy && body.expectedUpdatedAt === undefined ? undefined : activityToken(body.expectedUpdatedAt);
  return withYouthMutation(ctx, { operation: "concept.delete", requestId, payload: { expectedUpdatedAt: expected ?? null }, targetType: "StudyConcept", targetId: activityId(id), replay: async () => ({ conceptId: id }) }, async (tx, actor) => {
    await tx.$queryRaw`SELECT "id" FROM "StudyConcept" WHERE "id" = ${id} FOR UPDATE`;
    const row = await tx.studyConcept.findUnique({ where: { id }, select: conceptSelect });
    if (!row) {
      if (legacy) return { targetId: id, result: { conceptId: id } };
      throw notFound();
    }
    assertActivityVersion(row.updatedAt, expected);
    await tx.studyConcept.delete({ where: { id } }); // FK cascade removes checks for every youth atomically.
    await conceptAudit(tx, ctx, actor.id, "delete", row);
    return { targetId: id, committedUpdatedAt: row.updatedAt, result: { conceptId: id } };
  });
}
export async function checkMobileYouthConcept(ctx: YouthContext, youthId: string, conceptId: string, raw: unknown, legacy = false) {
  const body = activityObject(raw, ["requestId", "checked", "expectedYouthUpdatedAt", "expectedConceptUpdatedAt"]), requestId = activityId(body.requestId, true);
  if (typeof body.checked !== "boolean") throw new YouthError("숙지 상태를 확인하세요.", "INVALID_REQUEST", 400);
  const checked = body.checked, expectedYouth = legacy && body.expectedYouthUpdatedAt === undefined ? undefined : activityToken(body.expectedYouthUpdatedAt), expectedConcept = legacy && body.expectedConceptUpdatedAt === undefined ? undefined : activityToken(body.expectedConceptUpdatedAt);
  return withYouthMutation(ctx, { operation: "concept.check", requestId, payload: { checked, expectedYouthUpdatedAt: expectedYouth ?? null, expectedConceptUpdatedAt: expectedConcept ?? null }, youthId: activityId(youthId), targetType: "StudyConceptCheck", targetId: activityId(conceptId), replay: async (tx, _actor, today) => {
    const youth = await lockOperationalYouth(tx, youthId, today), concept = await tx.studyConcept.findUnique({ where: { id: conceptId }, select: conceptSelect });
    if (!concept) return null;
    const check = await tx.studyConceptCheck.findUnique({ where: { conceptId_youthId: { conceptId, youthId } }, select: { checkedAt: true } });
    return { conceptId, youthId, checked: Boolean(check), checkedAt: check?.checkedAt.toISOString() ?? null, youthUpdatedAt: youth.updatedAt.toISOString(), conceptUpdatedAt: concept.updatedAt.toISOString() };
  } }, async (tx, actor, today, now) => {
    const youth = await lockOperationalYouth(tx, youthId, today);
    await tx.$queryRaw`SELECT "id" FROM "StudyConcept" WHERE "id" = ${conceptId} FOR SHARE`;
    const concept = await tx.studyConcept.findUnique({ where: { id: conceptId }, select: conceptSelect });
    if (!concept || concept.subject !== "math" || !isYouthStudySubunitId(concept.subject, concept.subunitId)) throw notFound();
    // Both fences precede a desired-state no-op: checked→unchecked→checked is still a change.
    assertActivityVersion(youth.updatedAt, expectedYouth); assertActivityVersion(concept.updatedAt, expectedConcept);
    const previous = await tx.studyConceptCheck.findUnique({ where: { conceptId_youthId: { conceptId, youthId } }, select: { checkedAt: true } });
    const checkedAt = checked ? (await tx.studyConceptCheck.upsert({ where: { conceptId_youthId: { conceptId, youthId } }, create: { id: randomUUID(), conceptId, youthId, checkedAt: now }, update: { checkedAt: now }, select: { checkedAt: true } })).checkedAt : null;
    if (!checked) await tx.studyConceptCheck.deleteMany({ where: { conceptId, youthId } });
    const updatedAt = nextActivityToken(now, youth.updatedAt);
    await tx.youth.update({ where: { id: youthId }, data: { updatedAt } });
    await tx.auditLog.create({ data: { ...ctx.requestData, actorId: actor.id, action: AuditAction.UPDATE_YOUTH, targetType: "StudyConceptCheck", targetId: conceptId, message: `${youth.name} 청소년의 수학 개념을 ${checked ? "숙지 완료" : "미숙지"}로 표시했습니다.`, metadata: { source: "learning-progress", changeType: "studyConcept.toggle", youthId, youthName: youth.name, subject: concept.subject, subunitId: concept.subunitId, content: concept.content, previousChecked: Boolean(previous), nextChecked: checked } } });
    return { targetId: conceptId, committedUpdatedAt: updatedAt, result: { conceptId, youthId, checked, checkedAt: checkedAt?.toISOString() ?? null, youthUpdatedAt: updatedAt.toISOString(), conceptUpdatedAt: concept.updatedAt.toISOString() } };
  });
}
async function conceptAudit(tx: Prisma.TransactionClient, ctx: YouthContext, actorId: string, type: "create" | "delete", concept: ConceptRecord) {
  await tx.auditLog.create({ data: { ...ctx.requestData, actorId, action: AuditAction.UPDATE_YOUTH, targetType: "StudyConcept", targetId: concept.id, message: `수학 단원의 개념을 ${type === "create" ? "등록" : "삭제"}했습니다.`, metadata: { source: "learning-progress", changeType: `studyConcept.${type}`, subject: concept.subject, subunitId: concept.subunitId, content: concept.content } } });
}

export async function getMobileYouthConcepts(ctx: YouthContext, url: URL) {
  const query = activityQuery(url, ["subject", "subunitId"]), subject = query.subject ?? "math", subunitId = query.subunitId ?? getYouthStudySubunits("math")[0].id;
  if (subject !== "math" || !isYouthStudySubunitId(subject, subunitId)) throw new YouthError("수학 단원을 확인하세요.", "INVALID_REQUEST", 400);
  return withYouthRead(ctx, async (tx, actor, today) => ({ today, permissions: youthPermissions(actor), subject, subunitId, curriculum: getYouthStudyCurriculum("math"), concepts: (await tx.studyConcept.findMany({ where: { subject, subunitId }, select: conceptSelect, orderBy: [{ createdAt: "asc" }, { id: "asc" }] })).map(mapConcept) }));
}

export async function getYouthLearningParents(ctx: YouthContext) {
  return withYouthRead(ctx, async (tx, _actor, today) => (await tx.youth.findMany({ where: youthOperationalWhere(today), select: { id: true, name: true, updatedAt: true }, orderBy: [{ name: "asc" }, { id: "asc" }] })).map(row => ({ id: row.id, name: row.name, updatedAt: row.updatedAt.toISOString() })));
}
