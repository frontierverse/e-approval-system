import { isGregorianDate } from "@/lib/gregorian-date";
import { isCafeItemCategory, isCafeItemDeadlineFilter, isCafeItemChangeLogActionFilter, type CafeItemCategory, type CafeItemCategoryFilter, type CafeItemDeadlineFilter, type CafeItemSort, type CafeItemChangeLogActionFilter, type CafeItemChangeLogAction, type CafeItemUsageDday } from "@/lib/cafe-items-core";
export class CafeError extends Error {
  constructor(message = "카페 요청 정보를 확인해 주세요.", readonly code = "INVALID_REQUEST", readonly status = 400, readonly fields?: Record<string, string>) { super(message); }
}
export type MobileMealMenuResponse = { today: string; date: string; menuItems: string[]; summary: { schoolCount: number; totalCount: number; preservationCount: number; deliveryDriverCount: number }; schools: Array<{ schoolId: string; schoolName: string; schoolType: "elementary" | "kindergarten"; totalCount: number; preservationCount: number; deliveryDriverCount: number }> };
export type MobileCafeItemSummary = { id: string; name: string; category: CafeItemCategory; purchasedAt: string; priceWon: number | null; expirationDate: string | null; isHeld: boolean; usage: CafeItemUsageDday };
export type MobileCafeItemDetailResponse = { today: string; item: MobileCafeItemSummary & { purchaseReason: string | null; expirationHoldReason: string | null; createdAt: string; updatedAt: string } };
export type CafePageQuery = { category: CafeItemCategoryFilter; deadline: CafeItemDeadlineFilter; sort: CafeItemSort; query: string; held: "all" | "only"; page: number };
export type MobileCafeItemPage = { today: string; filters: Omit<CafePageQuery, "page">; summary: { expiredFoodCount: number; dueSoonFoodCount: number; heldItemCount: number }; items: MobileCafeItemSummary[]; page: number; pageSize: 20; total: number; totalPages: number };
export type CafeHistoryQuery = { action: CafeItemChangeLogActionFilter; actorId: string; query: string; itemId: string | null; page: number };
export type MobileCafeHistoryResponse = { filters: Omit<CafeHistoryQuery, "page">; actors: Array<{ id: string; name: string }>; logs: Array<{ id: string; actionType: CafeItemChangeLogAction; actor: { id: string; name: string }; createdAt: string; itemId: string; itemName: string; message: string }>; page: number; pageSize: 20; total: number; totalPages: number };
export type MobileCafeNote = { id: string; content: string; createdAt: string; updatedAt: string; createdBy: { id: string; name: string } | null };
export type MobileCafeNotePage = { notes: MobileCafeNote[]; page: number; pageSize: 20; total: number; totalPages: number };
export function cafeId(value: unknown, request = false): string {
  if (typeof value !== "string" || !(request ? /^[A-Za-z0-9_-]{8,128}$/ : /^[A-Za-z0-9_-]{1,128}$/).test(value)) throw new CafeError();
  return value;
}
export function cafeTimestamp(value: unknown): string {
  if (typeof value !== "string" || !Number.isFinite(new Date(value).getTime()) || new Date(value).toISOString() !== value) throw new CafeError("최신 정보를 다시 확인해 주세요.");
  return value;
}
export function cafeObject(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new CafeError();
  const raw = value as Record<string, unknown>;
  if (keys.some(key => !Object.hasOwn(raw, key)) || Object.keys(raw).some(key => !keys.includes(key))) throw new CafeError();
  return raw;
}
export function cafeQuery(url: URL, allowed: readonly string[] = []): Record<string, string> {
  if (new TextEncoder().encode(url.search).byteLength > 8192) throw new CafeError("조회 조건이 너무 큽니다.", "PAYLOAD_TOO_LARGE", 413);
  const result: Record<string, string> = {};
  for (const key of url.searchParams.keys()) {
    if (!allowed.includes(key) || url.searchParams.getAll(key).length !== 1) throw new CafeError();
    result[key] = url.searchParams.get(key)!;
  }
  return result;
}
export function cafePage(value: string | undefined): number {
  if (value === undefined) return 1;
  if (!/^[1-9]\d{0,8}$/.test(value)) throw new CafeError();
  return Number(value);
}
function search(value: string | undefined) { const query = (value ?? "").trim(); if (query.length > 200) throw new CafeError("검색어는 200자 이하로 입력하세요."); return query; }
export function parseCafePageQuery(url: URL): CafePageQuery {
  const q = cafeQuery(url, ["category", "deadline", "sort", "q", "held", "page"]), category = q.category ?? "all", deadline = q.deadline ?? "all", sort = q.sort ?? "latest", held = q.held ?? "all";
  if ((category !== "all" && !isCafeItemCategory(category)) || !isCafeItemDeadlineFilter(deadline) || !["latest", "expirationAsc", "expirationDesc"].includes(sort) || !["all", "only"].includes(held)) throw new CafeError();
  return { category: category as CafeItemCategoryFilter, deadline, sort: sort as CafeItemSort, held: held as "all" | "only", query: search(q.q), page: cafePage(q.page) };
}
export function parseCafeHistoryQuery(url: URL): CafeHistoryQuery {
  const q = cafeQuery(url, ["action", "actorId", "q", "page", "itemId"]), action = q.action ?? "all", actorId = q.actorId ?? "all";
  if (!isCafeItemChangeLogActionFilter(action)) throw new CafeError();
  return { action, actorId: actorId === "all" ? "all" : cafeId(actorId), itemId: q.itemId === undefined ? null : cafeId(q.itemId), query: search(q.q), page: cafePage(q.page) };
}
export function parseMealMenuDate(url: URL, today: string): string { const q = cafeQuery(url, ["date"]), date = q.date ?? today; if (!isGregorianDate(date)) throw new CafeError("조회 날짜를 확인해 주세요."); return date; }

/** JSON.parse validates grammar first; this bounded walk then detects duplicate decoded keys. */
function rejectDuplicateJsonKeys(source: string) {
  let position = 0;
  const space = () => { while (/\s/.test(source[position] ?? "")) position++; };
  const string = () => { const start = position++; while (position < source.length) { if (source[position++] === "\\") position++; else if (source[position - 1] === '"') break; } return JSON.parse(source.slice(start, position)) as string; };
  const value = (depth: number) => {
    if (depth > 64) throw new CafeError();
    space(); const token = source[position];
    if (token === "{") {
      position++; space(); const keys = new Set<string>();
      if (source[position] !== "}") while (true) { space(); const key = string(); if (keys.has(key)) throw new CafeError("중복 입력 항목을 확인해 주세요."); keys.add(key); space(); position++; value(depth + 1); space(); if (source[position] !== ",") break; position++; }
      position++;
    } else if (token === "[") { position++; space(); if (source[position] !== "]") while (true) { value(depth + 1); space(); if (source[position] !== ",") break; position++; } position++; }
    else if (token === '"') string();
    else while (position < source.length && !/[\s,}\]]/.test(source[position])) position++;
  };
  value(0);
}
export async function readCafeJson(request: Request): Promise<unknown> {
  if ((request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase() !== "application/json") throw new CafeError("JSON 요청이 필요합니다.", "UNSUPPORTED_MEDIA_TYPE", 415);
  const declared = request.headers.get("content-length"), max = 65536;
  if (declared !== null && (!/^\d+$/.test(declared) || !Number.isSafeInteger(Number(declared)))) throw new CafeError();
  if (declared !== null && Number(declared) > max) throw new CafeError("요청이 너무 큽니다.", "PAYLOAD_TOO_LARGE", 413);
  if (!request.body) throw new CafeError();
  const reader = request.body.getReader(), chunks: Uint8Array[] = [], deadline = Date.now() + 10000;
  let size = 0;
  try {
    while (true) {
      if (Date.now() >= deadline) { void reader.cancel().catch(() => undefined); throw new CafeError("요청 시간이 초과되었습니다. 입력을 보관하고 다시 시도해 주세요.", "REQUEST_TIMEOUT", 408); }
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { reject(new CafeError("요청 시간이 초과되었습니다. 입력을 보관하고 다시 시도해 주세요.", "REQUEST_TIMEOUT", 408)); void reader.cancel().catch(() => undefined); }, Math.max(1, deadline - Date.now())); });
      const next = await Promise.race([reader.read(), timeout]).finally(() => clearTimeout(timer));
      if (Date.now() >= deadline) { void reader.cancel().catch(() => undefined); throw new CafeError("요청 시간이 초과되었습니다. 입력을 보관하고 다시 시도해 주세요.", "REQUEST_TIMEOUT", 408); }
      if (next.done) break;
      size += next.value.byteLength;
      if (size > max) { void reader.cancel().catch(() => undefined); throw new CafeError("요청이 너무 큽니다.", "PAYLOAD_TOO_LARGE", 413); }
      chunks.push(next.value);
    }
  } catch (error) { if (error instanceof CafeError) throw error; throw new CafeError(); }
  finally { reader.releaseLock(); }
  if (declared !== null && Number(declared) !== size) throw new CafeError();
  try { const source = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, size)), value = JSON.parse(source) as unknown; rejectDuplicateJsonKeys(source); return value; }
  catch (error) { if (error instanceof CafeError) throw error; throw new CafeError(); }
}
