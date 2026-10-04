import { ApiError } from './api';
import { formatScheduleDate, formatScheduleTimestamp, isScheduleDate, isScheduleToken, shiftScheduleDate } from './schedules';
import type { CafeActor, CafeHistoryFilters, CafeItemFilters, CafeItemInput, CafeItemValues, CafeMutationResult, CafeOperation, MobileCafeHistoryResponse, MobileCafeItemDetailResponse, MobileCafeItemPage, MobileCafeItemSummary, MobileCafeNote, MobileCafeNotePage, MobileMealMenuResponse } from '@/types/lunch-cafe';

export { isScheduleDate as isMealDate, shiftScheduleDate as shiftMealDate, formatScheduleDate as formatMealDate };
export const formatCafeTimestamp = formatScheduleTimestamp;
export const cafeCategories = [{ value: 'food', label: '식품' }, { value: 'consumable', label: '소모품' }, { value: 'supply', label: '비품' }, { value: 'equipment', label: '장비' }, { value: 'other', label: '기타' }] as const;
export const cafeDeadlines = [{ value: 'all', label: '전체' }, { value: 'expired', label: '기한 경과' }, { value: 'dueSoon', label: '30일 이내' }, { value: 'over100', label: '구매 100일' }] as const;
export const cafeSorts = [{ value: 'latest', label: '최근 등록' }, { value: 'expirationAsc', label: '기한 빠른순' }, { value: 'expirationDesc', label: '기한 늦은순' }] as const;
export const cafeActions = [{ value: 'all', label: '전체' }, { value: 'create', label: '등록' }, { value: 'update', label: '수정' }, { value: 'hold', label: '보류' }, { value: 'delete', label: '삭제' }] as const;
export const defaultCafeFilters: CafeItemFilters = { category: 'all', deadline: 'all', sort: 'latest', query: '', held: 'all' };
export const defaultCafeHistory: CafeHistoryFilters = { action: 'all', actorId: 'all', query: '', itemId: null };
export const cafeRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const exact = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const text = (v: unknown): v is string => typeof v === 'string';
const nullableText = (v: unknown) => v === null || text(v);
const count = (v: unknown) => Number.isSafeInteger(v) && Number(v) >= 0;
export const cafeId = (v: unknown): v is string => text(v) && /^[A-Za-z0-9_-]{1,128}$/.test(v);
const date = (v: unknown): v is string => text(v) && isScheduleDate(v);
const dateOrNull = (v: unknown) => v === null || date(v);
const category = (v: unknown) => cafeCategories.some(x => x.value === v);
const same = (a: object, b: object) => Object.entries(b).every(([k, v]) => (a as Record<string, unknown>)[k] === v);
export function cafeScalar(v: unknown): string | undefined { return v === undefined ? undefined : text(v) ? v : ''; }
export function cafePage(v: unknown): number | null { return v === undefined ? 1 : text(v) && /^[1-9]\d{0,8}$/.test(v) ? Number(v) : null; }
export function cafeCategoryLabel(v: string) { return cafeCategories.find(x => x.value === v)?.label ?? '기타'; }
export function cafeItemPath(filters: CafeItemFilters, page: number) {
  const query = new URLSearchParams({ category: filters.category, deadline: filters.deadline, sort: filters.sort, q: filters.query, held: filters.held, page: String(page) });
  return `/cafe/items?${query}`;
}
export function cafeHistoryPath(filters: CafeHistoryFilters, page: number) {
  const query = new URLSearchParams({ action: filters.action, actorId: filters.actorId, q: filters.query, page: String(page) });
  if (filters.itemId !== null) query.set('itemId', filters.itemId);
  return `/cafe/history?${query}`;
}
export function pagination(v: Record<string, unknown>, rows: unknown[]) {
  return v.pageSize === 20 && count(v.total) && count(v.totalPages) && v.totalPages === Math.max(1, Math.ceil(Number(v.total) / 20)) && Number.isSafeInteger(v.page) && Number(v.page) >= 1 && Number(v.page) <= Number(v.totalPages) && rows.length === Math.min(20, Math.max(0, Number(v.total) - (Number(v.page) - 1) * 20));
}
const unique = (rows: { id: string }[]) => new Set(rows.map(x => x.id)).size === rows.length;
function actor(v: unknown): v is CafeActor { return cafeRecord(v) && exact(v, ['id', 'name']) && cafeId(v.id) && text(v.name); }
export function isMealMenu(v: unknown, selected?: string): v is MobileMealMenuResponse {
  if (!cafeRecord(v) || !exact(v, ['today', 'date', 'menuItems', 'summary', 'schools']) || !date(v.today) || !date(v.date) || v.date !== (selected ?? v.today) || !Array.isArray(v.menuItems) || !v.menuItems.every(text) || !cafeRecord(v.summary) || !exact(v.summary, ['schoolCount', 'totalCount', 'preservationCount', 'deliveryDriverCount']) || !Object.values(v.summary).every(count) || !Array.isArray(v.schools)) return false;
  const schools = v.schools;
  if (!schools.every(x => cafeRecord(x) && exact(x, ['schoolId', 'schoolName', 'schoolType', 'totalCount', 'preservationCount', 'deliveryDriverCount']) && cafeId(x.schoolId) && text(x.schoolName) && ['elementary', 'kindergarten'].includes(String(x.schoolType)) && count(x.totalCount) && count(x.preservationCount) && count(x.deliveryDriverCount) && Number(x.totalCount) >= Number(x.preservationCount) + Number(x.deliveryDriverCount)) || new Set(schools.map(x => x.schoolId)).size !== schools.length) return false;
  return v.summary.schoolCount === schools.length && ['totalCount', 'preservationCount', 'deliveryDriverCount'].every(k => v.summary && (v.summary as Record<string, unknown>)[k] === schools.reduce((n, x) => n + Number(x[k]), 0));
}
const summaryKeys = ['id', 'name', 'category', 'purchasedAt', 'priceWon', 'expirationDate', 'isHeld', 'usage'];
function itemFields(v: Record<string, unknown>) {
  return cafeId(v.id) && text(v.name) && category(v.category) && date(v.purchasedAt) && (v.priceWon === null || count(v.priceWon)) && dateOrNull(v.expirationDate) && typeof v.isHeld === 'boolean' && cafeRecord(v.usage) && exact(v.usage, ['basisLabel', 'label', 'status']) && text(v.usage.basisLabel) && text(v.usage.label) && ['expired', 'neutral', 'safe', 'soon'].includes(String(v.usage.status));
}
export function isCafeItemSummary(v: unknown): v is MobileCafeItemSummary { return cafeRecord(v) && exact(v, summaryKeys) && itemFields(v); }
export function isCafeDetail(v: unknown, id?: string): v is MobileCafeItemDetailResponse {
  return cafeRecord(v) && exact(v, ['today', 'item']) && date(v.today) && cafeRecord(v.item) && exact(v.item, [...summaryKeys, 'purchaseReason', 'expirationHoldReason', 'createdAt', 'updatedAt']) && itemFields(v.item) && (!id || v.item.id === id) && nullableText(v.item.purchaseReason) && nullableText(v.item.expirationHoldReason) && v.item.isHeld === (v.item.expirationHoldReason !== null) && isScheduleToken(v.item.createdAt) && isScheduleToken(v.item.updatedAt);
}
export function isCafeItemPage(v: unknown, filters: CafeItemFilters = defaultCafeFilters): v is MobileCafeItemPage {
  return cafeRecord(v) && exact(v, ['today', 'filters', 'summary', 'items', 'page', 'pageSize', 'total', 'totalPages']) && date(v.today) && cafeRecord(v.filters) && exact(v.filters, ['category', 'deadline', 'sort', 'query', 'held']) && same(v.filters, filters) && cafeRecord(v.summary) && exact(v.summary, ['expiredFoodCount', 'dueSoonFoodCount', 'heldItemCount']) && Object.values(v.summary).every(count) && Array.isArray(v.items) && v.items.every(isCafeItemSummary) && unique(v.items) && pagination(v, v.items);
}
export function isCafeHistory(v: unknown, filters: CafeHistoryFilters = defaultCafeHistory): v is MobileCafeHistoryResponse {
  return cafeRecord(v) && exact(v, ['filters', 'actors', 'logs', 'page', 'pageSize', 'total', 'totalPages']) && cafeRecord(v.filters) && exact(v.filters, ['action', 'actorId', 'query', 'itemId']) && same(v.filters, filters) && Array.isArray(v.actors) && v.actors.every(actor) && unique(v.actors) && Array.isArray(v.logs) && v.logs.every(x => cafeRecord(x) && exact(x, ['id', 'actionType', 'actor', 'createdAt', 'itemId', 'itemName', 'message']) && cafeId(x.id) && ['create', 'update', 'hold', 'delete'].includes(String(x.actionType)) && actor(x.actor) && isScheduleToken(x.createdAt) && cafeId(x.itemId) && (!filters.itemId || x.itemId === filters.itemId) && text(x.itemName) && text(x.message)) && unique(v.logs) && pagination(v, v.logs);
}
export function isCafeNote(v: unknown): v is MobileCafeNote { return cafeRecord(v) && exact(v, ['id', 'content', 'createdAt', 'updatedAt', 'createdBy']) && cafeId(v.id) && text(v.content) && isScheduleToken(v.createdAt) && isScheduleToken(v.updatedAt) && (v.createdBy === null || actor(v.createdBy)); }
export function isCafeNotes(v: unknown): v is MobileCafeNotePage { return cafeRecord(v) && exact(v, ['notes', 'page', 'pageSize', 'total', 'totalPages']) && Array.isArray(v.notes) && v.notes.every(isCafeNote) && unique(v.notes) && pagination(v, v.notes); }
export function newCafeRequestId() { return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const n = Math.floor(Math.random() * 16); return (c === 'x' ? n : (n & 3) | 8).toString(16); }); }
export function isCafeMutation(v: unknown, expected: { requestId: string; operation: CafeOperation; targetId?: string }): v is CafeMutationResult {
  if (!cafeRecord(v) || !exact(v, ['ok', 'message', 'replayed', 'requestId', 'operation', 'targetType', 'targetId', 'outcome', 'committedAt', 'committedUpdatedAt', 'result']) || v.ok !== true || !text(v.message) || typeof v.replayed !== 'boolean' || v.requestId !== expected.requestId || v.operation !== expected.operation || !cafeId(v.targetId) || (expected.targetId && v.targetId !== expected.targetId) || v.targetType !== (expected.operation.startsWith('item.') ? 'CafeItem' : 'CafeComplianceNote') || !['present', 'deleted'].includes(String(v.outcome)) || !isScheduleToken(v.committedAt) || !(v.committedUpdatedAt === null || isScheduleToken(v.committedUpdatedAt))) return false;
  const deleting = expected.operation === 'item.delete' || expected.operation === 'note.delete';
  if (deleting) return v.outcome === 'deleted' && v.result === null && v.committedUpdatedAt === null;
  if (!isScheduleToken(v.committedUpdatedAt)) return false;
  if (v.outcome === 'deleted') return v.result === null;
  return expected.operation.startsWith('item.') ? isCafeDetail(v.result, v.targetId) : isCafeNote(v.result) && v.result.id === v.targetId;
}
export function cafeUnknown(cause: unknown) { return !(cause instanceof ApiError) || cause.status === 0 || cause.status >= 500 || cause.status === 408 || cause.status >= 200 && cause.status < 300; }
export function cafePrivateFailure(cause: unknown) { return cause instanceof ApiError && [401, 403, 404].includes(cause.status); }
export function cafeValues(item: MobileCafeItemDetailResponse['item'] | null, today = ''): CafeItemValues {
  return item ? { name: item.name, category: item.category, purchasedAt: item.purchasedAt, priceWon: item.priceWon === null ? '' : String(item.priceWon), purchaseReason: item.purchaseReason ?? '', expirationDate: item.expirationDate ?? '' } : { name: '', category: 'food', purchasedAt: today, priceWon: '', purchaseReason: '', expirationDate: '' };
}
export function cafeInput(values: CafeItemValues): CafeItemInput { return { name: values.name.trim(), category: values.category, purchasedAt: values.purchasedAt.trim(), priceWon: values.priceWon.trim() ? Number(values.priceWon.trim()) : null, purchaseReason: values.purchaseReason.trim(), expirationDate: values.category === 'food' ? values.expirationDate.trim() || null : null }; }
export function validateCafeValues(values: CafeItemValues): Record<string, string> {
  const errors: Record<string, string> = {}, input = cafeInput(values);
  if (!input.name || input.name.length > 100) errors.name = '물품명은 1~100자로 입력하세요.';
  if (!category(input.category)) errors.category = '분류를 선택하세요.';
  if (!date(input.purchasedAt)) errors.purchasedAt = '구매일을 YYYY-MM-DD 형식으로 입력하세요.';
  if (values.priceWon.trim() && (!/^\d+$/.test(values.priceWon.trim()) || !Number.isSafeInteger(input.priceWon) || Number(input.priceWon) > 999999999)) errors.priceWon = '가격은 0~999,999,999원의 정수로 입력하세요.';
  if (input.purchaseReason.length > 500) errors.purchaseReason = '구매 사유는 500자 이내로 입력하세요.';
  if (input.category === 'food' && !input.expirationDate || input.expirationDate !== null && !date(input.expirationDate)) errors.expirationDate = '식품의 유통기한을 YYYY-MM-DD 형식으로 입력하세요.';
  return errors;
}
export function cafeDirty(values: CafeItemValues, item: MobileCafeItemDetailResponse['item'] | null, today: string) { return JSON.stringify(cafeInput(values)) !== JSON.stringify(cafeInput(cafeValues(item, today))); }
export function cafeHoldAllowed(value: MobileCafeItemDetailResponse) { return value.item.category === 'food' && value.item.expirationDate !== null && value.item.expirationDate < value.today; }
export function validateCafeNote(content: string) { return content.trim().length >= 1 && content.trim().length <= 2000 ? null : '준수사항은 1~2,000자로 입력하세요.'; }
export function validateCafeHold(reason: string) { return reason.trim().length >= 1 && reason.trim().length <= 500 ? null : '보류 사유는 1~500자로 입력하세요.'; }
