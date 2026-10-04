import "server-only";
import { AuditAction, Prisma } from "@/generated/prisma/client";
import { YouthError } from "@/lib/mobile-youth-core";
import { activityId, activityPage, activityQuery } from "@/lib/youth-mobile-activity-core";
import { withYouthRead, lockOperationalYouth, youthPermissions, type YouthContext } from "@/lib/youth-mobile-context";
import { youthOperationalWhere } from "@/lib/youth-retention-core";
import { isYouthStudySubunitId } from "@/lib/youth-subject-progress-core";
import { ruleQuery } from "@/lib/youth-mobile-rules";
const historySelect = { id: true, createdAt: true, metadata: true, actor: { select: { name: true } } } satisfies Prisma.AuditLogSelect;
type LogRecord = Prisma.AuditLogGetPayload<{ select: typeof historySelect }>;
const metadata = (value: Prisma.JsonValue | null): Record<string, Prisma.JsonValue | undefined> => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const string = (value: unknown) => typeof value === "string" ? value : null;
const scalar = (value: unknown) => typeof value === "string" ? value : typeof value === "number" || typeof value === "boolean" ? String(value) : null;
function mapHistory(row: LogRecord) {
  const data = metadata(row.metadata), type = string(data.changeType) ?? "unknown";
  const changes: Array<{ field: string; label: string; before: string | null; after: string | null }> = [];
  if (type.startsWith("commonSchedule.")) {
    for (const [field, label] of [["Content", "내용"], ["StartMinute", "시작(분)"], ["EndMinute", "종료(분)"]] as const) changes.push({ field: field[0].toLowerCase() + field.slice(1), label, before: scalar(data[`previous${field}`]), after: scalar(data[`next${field}`]) });
    changes.push({ field: "weekday", label: "요일", before: null, after: scalar(data.weekday) });
  } else if (type === "studyConcept.toggle") changes.push({ field: "checked", label: "숙지 상태", before: scalar(data.previousChecked), after: scalar(data.nextChecked) });
  else if (type.startsWith("studyConcept.")) changes.push({ field: "content", label: "개념", before: type.endsWith("delete") ? string(data.content) : null, after: type.endsWith("create") ? string(data.content) : null });
  else if (type.startsWith("youthRule.")) changes.push({ field: "category", label: "카테고리", before: type.endsWith("delete") ? string(data.category) : null, after: type.endsWith("create") ? string(data.category) : null });
  return { id: row.id, createdAt: row.createdAt.toISOString(), actorName: row.actor.name, changeType: type, message: type.endsWith("create") ? "등록했습니다." : type.endsWith("delete") ? "삭제했습니다." : type.endsWith("toggle") ? "숙지 상태를 변경했습니다." : "수정했습니다.", changes };
}
async function historyPage(tx: Prisma.TransactionClient, where: Prisma.AuditLogWhereInput, requestedPage: number) {
  const total = await tx.auditLog.count({ where }), totalPages = Math.max(1, Math.ceil(total / 10)), page = Math.min(requestedPage, totalPages);
  const rows = await tx.auditLog.findMany({ where, select: historySelect, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 10, skip: (page - 1) * 10 });
  return { page, pageSize: 10, total, totalPages, logs: rows.map(mapHistory) };
}
export async function getMobileCommonScheduleHistory(ctx: YouthContext, url: URL) {
  const query = activityQuery(url, ["weekday", "page"]), page = activityPage(query.page);
  if (!query.weekday || !/^[1-5]$/.test(query.weekday)) throw new YouthError("요일을 확인하세요.", "INVALID_REQUEST", 400);
  return withYouthRead(ctx, async (tx, actor, today) => ({ today, permissions: youthPermissions(actor), weekday: Number(query.weekday), ...await historyPage(tx, { action: AuditAction.UPDATE_YOUTH, targetType: "YouthCommonSchedule", metadata: { path: ["weekday"], equals: Number(query.weekday) } }, page) }));
}
export async function getMobileYouthLearningHistory(ctx: YouthContext, youthId: string, url: URL) {
  const query = activityQuery(url, ["subject", "subunitId", "page"]), page = activityPage(query.page);
  if ((query.subject !== undefined && query.subject !== "math") || (query.subunitId !== undefined && !isYouthStudySubunitId("math", query.subunitId))) throw new YouthError("수학 단원을 확인하세요.", "INVALID_REQUEST", 400);
  return withYouthRead(ctx, async (tx, actor, today) => {
    await lockOperationalYouth(tx, activityId(youthId), today);
    const where: Prisma.AuditLogWhereInput = { action: AuditAction.UPDATE_YOUTH, AND: [{ OR: [{ targetType: "StudyConcept" }, { targetType: "StudyConceptCheck", metadata: { path: ["youthId"], equals: youthId } }] }, { metadata: { path: ["subject"], equals: "math" } }, ...(query.subunitId ? [{ metadata: { path: ["subunitId"], equals: query.subunitId } }] : [])] };
    return { today, permissions: youthPermissions(actor), youthId, subject: "math", subunitId: query.subunitId ?? null, ...await historyPage(tx, where, page) };
  });
}
export async function getMobileYouthRuleHistory(ctx: YouthContext, url: URL) {
  const query = ruleQuery(url);
  return withYouthRead(ctx, async (tx, actor, today) => {
    const allowedIds = query.target === "all" ? (await tx.youth.findMany({ where: youthOperationalWhere(today), select: { id: true } })).map(row => row.id) : [];
    if (query.target !== "all" && query.target !== "common") await lockOperationalYouth(tx, query.target, today);
    const scope: Prisma.AuditLogWhereInput = query.target === "all" ? { OR: [{ metadata: { path: ["targetYouthId"], equals: Prisma.JsonNull } }, ...allowedIds.map(id => ({ metadata: { path: ["targetYouthId"], equals: id } }))] } : { metadata: { path: ["targetYouthId"], equals: query.target === "common" ? Prisma.JsonNull : query.target } };
    const where: Prisma.AuditLogWhereInput = { action: AuditAction.UPDATE_YOUTH, targetType: "YouthRule", AND: [scope, ...(query.category !== "all" ? [{ metadata: { path: ["category"], equals: query.category } }] : [])] };
    return { today, permissions: youthPermissions(actor), target: query.target, category: query.category, ...await historyPage(tx, where, query.page) };
  });
}
