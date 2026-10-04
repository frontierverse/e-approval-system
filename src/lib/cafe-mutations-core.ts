import { CafeError, cafeId, cafeTimestamp, cafeObject, type MobileCafeItemDetailResponse, type MobileCafeNote } from "@/lib/mobile-cafe-core";
import { isCafeItemCategory, type CafeItemCategory } from "@/lib/cafe-items-core";
import { isGregorianDate } from "@/lib/gregorian-date";
import { validateCafeComplianceNoteContent } from "@/lib/cafe-compliance-notes-core";
export type CafeOperation = "item.create" | "item.update" | "item.delete" | "item.hold" | "note.create" | "note.delete";
export type CafeItemInput = { name: string; category: CafeItemCategory; purchasedAt: string; priceWon: number | null; purchaseReason: string; expirationDate: string | null };
export type CafeCommand =
  | { operation: "item.create"; requestId: string; input: CafeItemInput }
  | { operation: "item.update"; requestId: string; targetId: string; expectedUpdatedAt: string; input: CafeItemInput }
  | { operation: "item.delete"; requestId: string; targetId: string; expectedUpdatedAt: string }
  | { operation: "note.delete"; requestId: string; targetId: string; expectedUpdatedAt: string }
  | { operation: "item.hold"; requestId: string; targetId: string; expectedUpdatedAt: string; reason: string }
  | { operation: "note.create"; requestId: string; content: string };
export type CafeMutationResult = { ok: true; message: string; replayed: boolean; requestId: string; operation: CafeOperation; targetType: "CafeItem" | "CafeComplianceNote"; targetId: string; outcome: "present" | "deleted"; committedAt: string; committedUpdatedAt: string | null; result: MobileCafeItemDetailResponse | MobileCafeNote | null };
function invalid(field: string, message: string): never { throw new CafeError(message, "VALIDATION_ERROR", 400, { [field]: message }); }
export function parseCafeItemInput(value: unknown): CafeItemInput {
  const raw = cafeObject(value, ["name", "category", "purchasedAt", "priceWon", "purchaseReason", "expirationDate"]);
  if (typeof raw.name !== "string") throw new CafeError();
  const name = raw.name.trim();
  if (!name) invalid("name", "물품명을 입력하세요.");
  if (name.length > 100) invalid("name", "물품명은 100자 이하로 입력하세요.");
  if (typeof raw.category !== "string" || !isCafeItemCategory(raw.category)) invalid("category", "물품 종류를 다시 선택하세요.");
  if (!isGregorianDate(raw.purchasedAt)) invalid("purchasedAt", "구매일을 다시 입력하세요.");
  if (raw.priceWon !== null && (typeof raw.priceWon !== "number" || !Number.isInteger(raw.priceWon) || raw.priceWon < 0)) invalid("priceWon", "가격은 숫자로 입력하세요.");
  if (raw.priceWon !== null && (raw.priceWon as number) > 999999999) invalid("priceWon", "가격은 999,999,999원 이하로 입력하세요.");
  if (typeof raw.purchaseReason !== "string") throw new CafeError();
  const purchaseReason = raw.purchaseReason.trim();
  if (purchaseReason.length > 500) invalid("purchaseReason", "구매 사유는 500자 이하로 입력하세요.");
  if (raw.expirationDate !== null && !isGregorianDate(raw.expirationDate)) invalid("expirationDate", "유통기한을 다시 입력하세요.");
  if (raw.category === "food" && raw.expirationDate === null) invalid("expirationDate", "식품은 유통기한을 입력하세요.");
  return { name, category: raw.category, purchasedAt: raw.purchasedAt, priceWon: raw.priceWon as number | null, purchaseReason, expirationDate: raw.category === "food" ? raw.expirationDate as string : null };
}
export function parseCafeCommand(operation: CafeOperation, targetId: string | undefined, value: unknown): CafeCommand {
  const keys = operation === "item.create" ? ["requestId", "input"] : operation === "item.update" ? ["requestId", "expectedUpdatedAt", "input"] : operation === "item.hold" ? ["requestId", "expectedUpdatedAt", "reason"] : operation === "note.create" ? ["requestId", "content"] : ["requestId", "expectedUpdatedAt"];
  const raw = cafeObject(value, keys), requestId = cafeId(raw.requestId, true);
  if (operation === "item.create") return { operation, requestId, input: parseCafeItemInput(raw.input) };
  if (operation === "note.create") {
    if (typeof raw.content !== "string") throw new CafeError();
    const content = raw.content.trim(), error = validateCafeComplianceNoteContent(content);
    if (error) invalid("content", error);
    return { operation, requestId, content };
  }
  const id = cafeId(targetId), expectedUpdatedAt = cafeTimestamp(raw.expectedUpdatedAt);
  if (operation === "item.update") return { operation, targetId: id, requestId, expectedUpdatedAt, input: parseCafeItemInput(raw.input) };
  if (operation === "item.hold") {
    if (typeof raw.reason !== "string") throw new CafeError();
    const reason = raw.reason.trim();
    if (!reason) invalid("reason", "보류 사유를 입력하세요.");
    if (reason.length > 500) invalid("reason", "보류 사유는 500자 이하로 입력하세요.");
    return { operation, targetId: id, requestId, expectedUpdatedAt, reason };
  }
  if (operation !== "item.delete" && operation !== "note.delete") throw new CafeError();
  return { operation, targetId: id, requestId, expectedUpdatedAt };
}
/** Revalidate trusted adapters too; callers cannot bypass the public canonical contract. */
export function normalizeCafeCommand(command: CafeCommand): CafeCommand {
  const { operation, ...body } = command, raw = { ...body } as Record<string, unknown>, targetId = raw.targetId as string | undefined;
  delete raw.targetId;
  return parseCafeCommand(operation, targetId, raw);
}

export type CafeWebState = { error?: string; success?: string; resetKey?: string; code?: string; status?: number; receipt?: CafeMutationResult };
export type CafeWebRead<T> = { ok: true; data: T } | { ok: false; error: string; code: string; status: number };
