import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { cafeTransaction, type CafeContext } from "@/lib/cafe-context";
import { cafeId, type CafePageQuery, type CafeHistoryQuery, type MobileMealMenuResponse, type MobileCafeItemSummary, type MobileCafeItemPage, type MobileCafeItemDetailResponse, type MobileCafeHistoryResponse, type MobileCafeNote, type MobileCafeNotePage, CafeError } from "@/lib/mobile-cafe-core";
import { createCafeItemWhere, createCafeItemOrderBy } from "@/lib/cafe-items";
import { formatCafeItemDateValue, getCafeItemUsageDday, isCafeItemCategory, isCafeItemChangeLogActionFilter, getCafeItemChangeLogActionLabel } from "@/lib/cafe-items-core";
import { parseGregorianDate, isGregorianDate } from "@/lib/gregorian-date";
import { lunchBoxCountFields, normalizeLunchBoxMenuItems } from "@/lib/lunch-box-counts-core";
export const cafeItemSelect = { id: true, name: true, category: true, purchasedAt: true, priceWon: true, purchaseReason: true, expirationDate: true, expirationHoldReason: true, createdAt: true, updatedAt: true } satisfies Prisma.CafeItemSelect;
const cafeSummarySelect = { id: true, name: true, category: true, purchasedAt: true, priceWon: true, expirationDate: true, expirationHoldReason: true } satisfies Prisma.CafeItemSelect;
export type CafeItemRecord = Prisma.CafeItemGetPayload<{ select: typeof cafeItemSelect }>;
export const cafeNoteSelect = { id: true, content: true, createdAt: true, updatedAt: true, createdBy: { select: { id: true, name: true } } } satisfies Prisma.CafeComplianceNoteSelect;
export type CafeNoteRecord = Prisma.CafeComplianceNoteGetPayload<{ select: typeof cafeNoteSelect }>;
export function mapCafeSummary(item: Prisma.CafeItemGetPayload<{ select: typeof cafeSummarySelect }>, today: string): MobileCafeItemSummary {
  const category = isCafeItemCategory(item.category) ? item.category : "other", purchasedAt = formatCafeItemDateValue(item.purchasedAt), expirationDate = item.expirationDate ? formatCafeItemDateValue(item.expirationDate) : null;
  return { id: item.id, name: item.name, category, purchasedAt, priceWon: item.priceWon, expirationDate, isHeld: item.expirationHoldReason !== null, usage: getCafeItemUsageDday({ category, purchasedAt, expirationDate }, today) };
}
export function mapCafeDetail(item: CafeItemRecord, today: string): MobileCafeItemDetailResponse { return { today, item: { ...mapCafeSummary(item, today), purchaseReason: item.purchaseReason, expirationHoldReason: item.expirationHoldReason, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() } }; }
export function mapCafeNote(note: CafeNoteRecord): MobileCafeNote { return { id: note.id, content: note.content, createdAt: note.createdAt.toISOString(), updatedAt: note.updatedAt.toISOString(), createdBy: note.createdBy ? { id: note.createdBy.id, name: note.createdBy.name } : null }; }
export async function getMobileMealMenu(context: CafeContext, requestedDate?: string): Promise<MobileMealMenuResponse> {
  return cafeTransaction(context, async (tx, today) => {
    const date = requestedDate ?? today; if (!isGregorianDate(date)) throw new CafeError("조회 날짜를 확인해 주세요.");
    const dateValue = parseGregorianDate(date);
    const [schools, menu, counts] = await Promise.all([
      tx.lunchBoxSchool.findMany({ where: { active: true }, orderBy: [{ order: "asc" }, { name: "asc" }, { id: "asc" }], select: { id: true, name: true, type: true } }),
      tx.lunchBoxMenu.findUnique({ where: { date: dateValue }, select: { items: true } }),
      tx.lunchBoxCount.findMany({ where: { date: dateValue, school: { active: true } }, select: { schoolId: true, preservationCount: true, deliveryDriverCount: true, class1Count: true, class2Count: true, class3Count: true, class4Count: true, linkedCount: true } }),
    ]);
    const byId = new Map(counts.map(row => [row.schoolId, row])), rows = schools.map(school => {
      const count = byId.get(school.id);
      return { schoolId: school.id, schoolName: school.name, schoolType: school.type === "kindergarten" ? "kindergarten" as const : "elementary" as const, totalCount: lunchBoxCountFields.reduce((sum, field) => sum + (count?.[field] ?? 0), 0), preservationCount: count?.preservationCount ?? 0, deliveryDriverCount: count?.deliveryDriverCount ?? 0 };
    });
    return { today, date, menuItems: normalizeLunchBoxMenuItems(menu?.items ?? []), summary: { schoolCount: rows.length, totalCount: rows.reduce((sum, row) => sum + row.totalCount, 0), preservationCount: rows.reduce((sum, row) => sum + row.preservationCount, 0), deliveryDriverCount: rows.reduce((sum, row) => sum + row.deliveryDriverCount, 0) }, schools: rows };
  });
}
export async function getMobileCafeItems(context: CafeContext, query: CafePageQuery): Promise<MobileCafeItemPage> {
  return cafeTransaction(context, async (tx, today) => {
    const base = createCafeItemWhere({ ...query, today }), where: Prisma.CafeItemWhereInput = query.held === "only" ? { AND: [base, { expirationHoldReason: { not: null } }] } : base;
    const [total, expiredFoodCount, dueSoonFoodCount, heldItemCount] = await Promise.all([
      tx.cafeItem.count({ where }), tx.cafeItem.count({ where: createCafeItemWhere({ category: "all", deadline: "expired", query: "", today }) }), tx.cafeItem.count({ where: createCafeItemWhere({ category: "all", deadline: "dueSoon", query: "", today }) }), tx.cafeItem.count({ where: { expirationHoldReason: { not: null } } }),
    ]);
    const totalPages = Math.max(1, Math.ceil(total / 20)), page = Math.min(query.page, totalPages), items = await tx.cafeItem.findMany({ where, orderBy: createCafeItemOrderBy(query), skip: (page - 1) * 20, take: 20, select: cafeSummarySelect });
    const { page: _requestedPage, ...filters } = query; void _requestedPage;
    return { today, filters, summary: { expiredFoodCount, dueSoonFoodCount, heldItemCount }, items: items.map(item => mapCafeSummary(item, today)), page, pageSize: 20, total, totalPages };
  });
}
export async function getMobileCafeItem(context: CafeContext, id: string): Promise<MobileCafeItemDetailResponse> { return cafeTransaction(context, async (tx, today) => { const item = await tx.cafeItem.findUnique({ where: { id: cafeId(id) }, select: cafeItemSelect }); if (!item) throw new CafeError("물품을 찾을 수 없습니다.", "NOT_FOUND", 404); return mapCafeDetail(item, today); }); }
export async function getMobileCafeNotes(context: CafeContext, requestedPage = 1): Promise<MobileCafeNotePage> { return cafeTransaction(context, async tx => { const total = await tx.cafeComplianceNote.count(), totalPages = Math.max(1, Math.ceil(total / 20)), page = Math.min(requestedPage, totalPages), notes = await tx.cafeComplianceNote.findMany({ orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * 20, take: 20, select: cafeNoteSelect }); return { notes: notes.map(mapCafeNote), page, pageSize: 20, total, totalPages }; }); }
const historyScope: Prisma.AuditLogWhereInput = { OR: [{ targetType: "CafeItem" }, { metadata: { path: ["source"], equals: "cafe-item" } }] };
function metadata(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
export async function getMobileCafeHistory(context: CafeContext, query: CafeHistoryQuery): Promise<MobileCafeHistoryResponse> {
  return cafeTransaction(context, async tx => {
    const and: Prisma.AuditLogWhereInput[] = [historyScope];
    if (query.action !== "all") and.push({ metadata: { path: ["changeType"], equals: `cafeItem.${query.action}` } });
    if (query.actorId !== "all") and.push({ actorId: query.actorId });
    if (query.itemId !== null) and.push({ targetId: query.itemId });
    if (query.query) and.push({ OR: [{ actor: { name: { contains: query.query, mode: "insensitive" } } }, ...["itemName", "nextName", "previousName"].map(key => ({ metadata: { path: [key], string_contains: query.query, mode: "insensitive" as const } }))] });
    const where = { AND: and }, total = await tx.auditLog.count({ where }), totalPages = Math.max(1, Math.ceil(total / 20)), page = Math.min(query.page, totalPages);
    const [logs, actorRows] = await Promise.all([
      tx.auditLog.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * 20, take: 20, select: { id: true, targetId: true, createdAt: true, metadata: true, actor: { select: { id: true, name: true } } } }),
      tx.auditLog.findMany({ where: historyScope, distinct: ["actorId"], select: { actor: { select: { id: true, name: true } } } }),
    ]);
    const { page: _requestedPage, ...filters } = query; void _requestedPage;
    return { filters, actors: actorRows.map(row => ({ id: row.actor.id, name: row.actor.name })).sort((a,b) => a.name.localeCompare(b.name, "ko") || a.id.localeCompare(b.id)), logs: logs.map(row => { const data = metadata(row.metadata), action = typeof data.changeType === "string" ? data.changeType.replace(/^cafeItem\./, "") : "update", actionType = isCafeItemChangeLogActionFilter(action) && action !== "all" ? action : "update", itemName = [data.itemName, data.nextName, data.previousName].find(value => typeof value === "string" && value.trim()) as string | undefined ?? "카페 물품"; return { id: row.id, actor: { id: row.actor.id, name: row.actor.name }, createdAt: row.createdAt.toISOString(), itemId: row.targetId, actionType, itemName, message: `${itemName} 물품을 ${getCafeItemChangeLogActionLabel(actionType)}했습니다.` }; }), page, pageSize: 20, total, totalPages };
  });
}
