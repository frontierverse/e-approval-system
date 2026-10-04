"use server";

import { unstable_rethrow } from "next/navigation";

import { getCurrentAuditLogRequestData } from "@/lib/audit-log-request";
import { requireUser } from "@/lib/auth";
import { getCafeItemChangeLogPage, getCafeItemPage } from "@/lib/cafe-items";
import {
  normalizeCafeItemChangeLogAction, normalizeCafeItemCategory, normalizeCafeItemDeadlineFilter, normalizeCafeItemFormValues, normalizeCafeItemPage, normalizeCafeItemSort, getCafeItemToday,
  type CafeItemActionResult, type CafeItemChangeLogPage, type CafeItemChangeLogPageFilters, type CafeItemExpirationHoldFormState, type CafeItemPage, type CafeItemPageFilters, type CafeItemFormState,
} from "@/lib/cafe-items-core";
import { normalizeCafeComplianceNoteContent, type CafeComplianceNoteFormState } from "@/lib/cafe-compliance-notes-core";
import { CafeError, cafeId, type MobileCafeItemDetailResponse, type MobileCafeNote } from "@/lib/mobile-cafe-core";
import { parseCafeCommand, type CafeOperation, type CafeWebState, type CafeWebRead, type CafeMutationResult } from "@/lib/cafe-mutations-core";
import { getCafeMutationStatus, mutateCafe } from "@/lib/cafe-mutations";
import { getMobileCafeItem, cafeNoteSelect, mapCafeNote } from "@/lib/cafe-queries";
import { cafeTransaction } from "@/lib/cafe-context";

const cafeItemPageSize = 7;
const cafeItemChangeLogPageSize = 5;

export async function getCafeItemPageAction(
  filters: CafeItemPageFilters,
): Promise<CafeItemActionResult<{ itemPage: CafeItemPage; today: string }>> {
  await requireUser();

  const today = getCafeItemToday();
  const itemPage = await getCafeItemPage({
    category: normalizeCafeItemCategory(filters.category),
    deadline: normalizeCafeItemDeadlineFilter(filters.deadline),
    page: normalizeCafeItemPage(String(filters.page)),
    pageSize: cafeItemPageSize,
    query: filters.query.trim(),
    sort: normalizeCafeItemSort(filters.sort),
    today,
  });

  return {
    ok: true,
    data: {
      itemPage,
      today,
    },
  };
}

export async function getCafeItemChangeLogPageAction(
  filters: CafeItemChangeLogPageFilters,
): Promise<CafeItemActionResult<{ logPage: CafeItemChangeLogPage }>> {
  await requireUser();

  const logPage = await getCafeItemChangeLogPage({
    action: normalizeCafeItemChangeLogAction(filters.action),
    actorId: String(filters.actorId ?? "all").trim() || "all",
    page: normalizeCafeItemPage(String(filters.page)),
    pageSize: cafeItemChangeLogPageSize,
    query: String(filters.query ?? "").trim(),
  });

  return {
    ok: true,
    data: {
      logPage,
    },
  };
}

function failure(error: unknown): CafeWebState {
  unstable_rethrow(error);
  return error instanceof CafeError ? { error: error.message, status: error.status, code: error.code } : { error: "처리 결과를 확인하지 못했습니다. 같은 요청으로 다시 확인해 주세요.", status: 500, code: "INTERNAL_ERROR" };
}
function actorMatch(actorId: string, expected: unknown) { if (expected !== actorId) throw new CafeError("로그인 계정이 변경되었습니다. 카페 관리를 다시 열어 주세요.", "FORBIDDEN", 403); }
async function change(operation: CafeOperation, targetId: string | undefined, form: FormData): Promise<CafeWebState> {
  // Authentication precedes any user-controlled input, including the actor guard.
  const user = await requireUser();
  try {
    actorMatch(user.id, form.get("expectedActorId"));
    const common = { requestId: form.get("cafeRequestId") }, expectedUpdatedAt = form.get("expectedUpdatedAt");
    let body: Record<string, unknown>;
    if (operation === "item.create" || operation === "item.update") {
      const values = normalizeCafeItemFormValues(form);
      body = { ...common, ...(operation === "item.update" ? { expectedUpdatedAt } : {}), input: { ...values, expirationDate: values.expirationDate || null, priceWon: values.priceWon === "" ? null : /^\d+$/.test(values.priceWon) ? Number(values.priceWon) : NaN } };
    } else if (operation === "item.hold") body = { ...common, expectedUpdatedAt, reason: String(form.get("reason") ?? "").trim() };
    else if (operation === "note.create") body = { ...common, content: normalizeCafeComplianceNoteContent(form.get("content")) };
    else body = { ...common, expectedUpdatedAt };
    const receipt = await mutateCafe({ actorId: user.id, requestData: await getCurrentAuditLogRequestData() }, parseCafeCommand(operation, targetId, body));
    return { success: receipt.message, receipt, resetKey: receipt.requestId };
  } catch (error) { return failure(error); }
}
export async function createCafeItemAction(_previous: CafeItemFormState, form: FormData): Promise<CafeItemFormState> { const result = await change("item.create", undefined, form); return { ...result, ...(result.error && ![401,403].includes(result.status ?? 0) ? { values: normalizeCafeItemFormValues(form) } : {}) }; }
export async function updateCafeItemAction(id: string, _previous: CafeItemFormState, form: FormData): Promise<CafeItemFormState> { const result = await change("item.update", id, form); return { ...result, ...(result.error && ![401,403].includes(result.status ?? 0) ? { values: normalizeCafeItemFormValues(form) } : {}) }; }
export async function holdCafeItemExpirationAction(id: string, _previous: CafeItemExpirationHoldFormState, form: FormData): Promise<CafeItemExpirationHoldFormState> { const result = await change("item.hold", id, form); return { ...result, ...(result.error && ![401,403].includes(result.status ?? 0) ? { values: { reason: String(form.get("reason") ?? "").trim() } } : {}) }; }
export async function deleteCafeItemAction(id: string, _previous: CafeWebState, form: FormData): Promise<CafeWebState> { return change("item.delete", id, form); }
export async function createCafeComplianceNoteAction(_previous: CafeComplianceNoteFormState, form: FormData): Promise<CafeComplianceNoteFormState> { const result = await change("note.create", undefined, form); return { ...result, ...(result.error && ![401,403].includes(result.status ?? 0) ? { values: { content: normalizeCafeComplianceNoteContent(form.get("content")) } } : {}) }; }
export async function deleteCafeComplianceNoteAction(id: string, _previous: CafeWebState, form: FormData): Promise<CafeWebState> { return change("note.delete", id, form); }
export async function getCafeMutationStatusAction(requestId: string, expectedActorId: string): Promise<CafeWebRead<CafeMutationResult>> {
  const user = await requireUser();
  try { actorMatch(user.id, expectedActorId); return { ok: true, data: await getCafeMutationStatus({ actorId: user.id }, requestId) }; } catch (error) { const state = failure(error); return { ok: false, error: state.error!, code: state.code!, status: state.status! }; }
}
export async function getCafeItemEditorAction(id: string, expectedActorId: string): Promise<CafeWebRead<MobileCafeItemDetailResponse>> {
  const user = await requireUser();
  try { actorMatch(user.id, expectedActorId); return { ok: true, data: await getMobileCafeItem({ actorId: user.id }, cafeId(id)) }; } catch (error) { const state = failure(error); return { ok: false, error: state.error!, code: state.code!, status: state.status! }; }
}
export async function getCafeNoteEditorAction(id: string, expectedActorId: string): Promise<CafeWebRead<MobileCafeNote>> {
  const user = await requireUser();
  try { actorMatch(user.id, expectedActorId); const data = await cafeTransaction({ actorId: user.id }, async tx => { const note = await tx.cafeComplianceNote.findUnique({ where: { id: cafeId(id) }, select: cafeNoteSelect }); if (!note) throw new CafeError("준수사항을 찾을 수 없습니다.", "NOT_FOUND", 404); return mapCafeNote(note); }); return { ok: true, data }; } catch (error) { const state = failure(error); return { ok: false, error: state.error!, code: state.code!, status: state.status! }; }
}
