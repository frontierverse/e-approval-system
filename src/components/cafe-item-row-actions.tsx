"use client";

import { useEffect, useLayoutEffect, useId, useRef, useState } from "react";
import {
  deleteCafeItemAction,
  holdCafeItemExpirationAction,
  updateCafeItemAction,
  getCafeItemEditorAction,
} from "@/app/work-schedule/cafe/actions";
import { useCafeMutation } from "@/components/use-cafe-mutation";
import { CafeMutationFeedback, CafeMutationHidden } from "@/components/cafe-mutation-feedback";
import type { MobileCafeItemDetailResponse } from "@/lib/mobile-cafe-core";
import { AppModal } from "@/components/app-modal";
import { CafeItemDateInput } from "@/components/cafe-item-date-input";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { buttonClass, buttonStyles } from "@/lib/button-styles";
import {
  cafeItemCategories,
  getCafeItemUsageDday,
  isCafeItemCategory,
  type CafeItem,
} from "@/lib/cafe-items-core";

const inputClassName =
  "h-11 w-full min-w-0 rounded-md border border-transparent bg-[#f5f8f7] px-3 text-sm text-[#16181d] outline-none transition placeholder:text-[#9aa4b2] focus:bg-[#f5f8f7] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]";
const dateInputClassName = `${inputClassName} text-center`;
const fieldLabelClassName =
  "block text-xs font-semibold leading-4 text-[#697386]";

export function CafeItemRowActions({ item, actorId = "" }: { item: CafeItem; actorId?: string }) {
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [modalKey, setModalKey] = useState(0);

  function openEditModal() {
    setModalKey((currentKey) => currentKey + 1);
    setIsEditOpen(true);
  }

  return (
    <div>
      <button
        type="button"
        onClick={openEditModal}
        className={buttonClass(
          buttonStyles.base,
          buttonStyles.neutral,
          "h-11 px-3 text-xs",
        )}
      >
        편집
      </button>

      {isEditOpen ? (
        <CafeItemEditModal
          key={modalKey}
          item={item}
          actorId={actorId}
          onClose={() => setIsEditOpen(false)}
        />
      ) : null}
    </div>
  );
}

export function CafeItemEditModal({
  item: incomingItem,
  onClose,
  today, actorId = "",
}: {
  item: CafeItem;
  actorId?: string;
  onClose: () => void;
  today?: string;
}) {
  const [item] = useState(() => ({ ...incomingItem }));
  const [fresh, setFresh] = useState<MobileCafeItemDetailResponse | null>(null), [freshError, setFreshError] = useState("");
  const sharedGate = useRef(false), mounted = useRef(true), currentActor = useRef(actorId);
  useLayoutEffect(() => { currentActor.current = actorId; }, [actorId]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const update = useCafeMutation(updateCafeItemAction.bind(null, item.id), { actorId, targetId: item.id, expectedUpdatedAt: item.updatedAt, operation: "item.update" }, sharedGate);
  const hold = useCafeMutation(holdCafeItemExpirationAction.bind(null, item.id), { actorId, targetId: item.id, expectedUpdatedAt: item.updatedAt, operation: "item.hold" }, sharedGate);
  const remove = useCafeMutation(deleteCafeItemAction.bind(null, item.id), { actorId, targetId: item.id, expectedUpdatedAt: item.updatedAt, operation: "item.delete" }, sharedGate);
  const state = update.state, expirationHoldState = hold.state, formAction = update.formAction, expirationHoldFormAction = hold.formAction;
  const pending = update.pending || hold.pending || remove.pending, expirationHoldPending = hold.pending;
  const frozen = update.unknown || hold.unknown || remove.unknown, erased = update.erased || hold.erased || remove.erased;
  const conflict = update.conflict || hold.conflict || remove.conflict;
  const editFormId = useId(), expirationHoldFormId = useId();
  async function loadFresh() {
    if (erased || !update.claim()) return;
    const selectedActor = actorId;
    try { const result = await getCafeItemEditorAction(item.id, selectedActor); if (!mounted.current || currentActor.current !== selectedActor) return; if (result.ok) { if (result.data.item.id !== item.id || !Number.isFinite(new Date(result.data.item.updatedAt).getTime()) || new Date(result.data.item.updatedAt).toISOString() !== result.data.item.updatedAt) throw new Error("INVALID_EDITOR"); setFresh(result.data); setFreshError(""); } else if ([401,403].includes(result.status)) { update.clearPrivate(result.error); hold.clearPrivate(result.error); remove.clearPrivate(result.error); } else setFreshError(result.error); }
    catch { if (mounted.current && currentActor.current === selectedActor) setFreshError("최신 물품을 확인하지 못했습니다. 다시 확인하세요."); }
    finally { update.release(); }
  }
  function adopt() { if (pending || !fresh || erased || !update.canAdopt() || !hold.canAdopt() || !remove.canAdopt()) return; update.adoptBaseline(fresh.item.updatedAt); hold.adoptBaseline(fresh.item.updatedAt); remove.adoptBaseline(fresh.item.updatedAt); setFresh(null); }
  const defaultCategory =
    item.category;
  const [selectedCategory, setSelectedCategory] = useState(defaultCategory);
  const isFood = selectedCategory === "food";
  const isExpiredFood =
    getCafeItemUsageDday(item, today).status === "expired";

  useEffect(() => {
    if (state.success || expirationHoldState.success || remove.state.success) {
      onClose();
    }
  }, [expirationHoldState.success, onClose, state.success, remove.state.success]);

  if (erased) return <AppModal labelledBy="cafe-erased" onClose={onClose}><p id="cafe-erased" role="alert" className="p-5">{update.state.error || hold.state.error || remove.state.error || "로그인 계정이 변경되었습니다. 카페 관리를 다시 열어 주세요."}</p></AppModal>;
  return (
    <AppModal
      className="flex max-w-2xl flex-col"
      style={{ maxHeight: "100%" }}
      labelledBy={`cafe-item-edit-title-${item.id}`}
      onClose={() => { if (!pending && !frozen && !conflict && window.confirm("편집을 닫을까요? 저장하지 않은 입력은 남지 않습니다.")) onClose(); }}
    >
      <div className="min-h-0 flex-1 overflow-y-auto">
        <form id={editFormId} action={formAction} onSubmit={update.onSubmit}>
          <CafeMutationHidden mutation={update} />
          <div className="px-6 pb-6 pt-6">
            <p className="text-xs font-semibold text-[#697386]">
              카페 물품 수정
            </p>
            <h3
              id={`cafe-item-edit-title-${item.id}`}
              className="mt-2 break-words text-2xl font-semibold leading-tight text-[#16181d]"
            >
              {item.name}
            </h3>

            <CafeMutationFeedback state={state} />

            <fieldset disabled={pending || frozen} className="mt-5 grid min-w-0 gap-4 sm:grid-cols-2">
              <label className="block min-w-0 sm:col-span-2">
                <span className={fieldLabelClassName}>물품명</span>
                <input
                  name="name"
                  required
                  maxLength={100}
                  defaultValue={item.name}
                  disabled={pending || frozen}
                  placeholder="예: 원두, 우유, 청소용 장갑"
                  className={`mt-2 ${inputClassName}`}
                />
              </label>

              <CafeItemDateInput
                defaultValue={item.purchasedAt}
                disabled={pending || frozen}
                inputClassName={dateInputClassName}
                label="구매일"
                name="purchasedAt"
                required
              />

              <label className="block min-w-0 sm:-mt-2">
                <span className={fieldLabelClassName}>물품 종류</span>
                <select
                  name="category"
                  value={selectedCategory}
                  disabled={pending || frozen}
                  onChange={(event) => {
                    const nextCategory = event.target.value;

                    if (isCafeItemCategory(nextCategory)) {
                      setSelectedCategory(nextCategory);
                    }
                  }}
                  className={`mt-2 ${inputClassName}`}
                >
                  {cafeItemCategories.map((category) => (
                    <option key={category.value} value={category.value}>
                      {category.label}
                    </option>
                  ))}
                </select>
              </label>

              {isFood ? (
                <CafeItemDateInput
                  defaultValue={
                    item.expirationDate ?? ""
                  }
                  disabled={pending || frozen}
                  inputClassName={dateInputClassName}
                  label="유통기한"
                  name="expirationDate"
                  required
                />
              ) : null}

              <label
                className={[
                  "block min-w-0",
                  isFood ? "sm:-mt-2" : "sm:col-span-2",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <span className={fieldLabelClassName}>
                  가격
                  <span className="ml-1 font-normal text-[#9aa4b2]">
                    선택
                  </span>
                </span>
                <input
                  name="priceWon"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  defaultValue={
                    String(item.priceWon ?? "")
                  }
                  disabled={pending || frozen}
                  placeholder="예: 12000"
                  className={`mt-2 ${inputClassName}`}
                />
              </label>

              <label className="block min-w-0 sm:col-span-2">
                <span className={fieldLabelClassName}>
                  구매 사유
                  <span className="ml-1 font-normal text-[#9aa4b2]">
                    선택
                  </span>
                </span>
                <textarea
                  name="purchaseReason"
                  maxLength={500}
                  defaultValue={
                    item.purchaseReason ?? ""
                  }
                  disabled={pending || frozen}
                  placeholder="예: 주간 카페 운영 재고 보충"
                  rows={3}
                  className={`mt-2 min-h-24 w-full resize-y rounded-md border border-transparent bg-[#f5f8f7] px-3 py-2 text-sm leading-6 text-[#16181d] outline-none transition placeholder:text-[#9aa4b2] focus:bg-[#f5f8f7]`}
                />
              </label>
            </fieldset>
          </div>
        </form>

        {isExpiredFood ? (
          <form
            id={expirationHoldFormId}
            action={expirationHoldFormAction}
            onSubmit={hold.onSubmit}
            className="border-t border-[#eef1f5] bg-[#fffaf1] px-6 py-5"
          >
            <CafeMutationHidden mutation={hold} />
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-[#7a5200]">
                  유통기한 경과 보류
                </p>
                <p className="mt-1 text-xs leading-5 text-[#697386]">
                  폐기하지 않고 카페 안에 보관해야 한다면 사유를 기록하세요.
                </p>
              </div>
              {item.expirationHoldReason ? (
                <span className="rounded-md border border-[#e6cf91] bg-[#fff4d8] px-2.5 py-1 text-xs font-semibold text-[#7a5200]">
                  보류 중
                </span>
              ) : null}
            </div>

            <CafeMutationFeedback state={expirationHoldState} />

            <label className="mt-4 block min-w-0">
              <span className={fieldLabelClassName}>보류 사유</span>
              <textarea
                name="reason"
                required
                maxLength={500}
                defaultValue={
                  item.expirationHoldReason ??
                  ""
                }
                disabled={pending || frozen}
                placeholder="예: 폐기 전 수량 및 재고 확인을 위해 임시 보관"
                rows={3}
                className="mt-2 min-h-24 w-full resize-y rounded-md border border-[#e6cf91] bg-white px-3 py-2 text-sm leading-6 text-[#16181d] outline-none transition placeholder:text-[#9aa4b2] focus:border-[#b78521] focus:ring-2 focus:ring-[#f8e5b5]"
              />
            </label>
          </form>
        ) : null}

      <div className="px-5 pb-3">
        <CafeMutationFeedback state={remove.state} />
        {conflict ? <><button type="button" disabled={pending} onClick={loadFresh} className="min-h-11 rounded-md border px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">최신 물품 확인</button>{fresh ? <div className="mt-2"><p className="break-words text-sm">최신 물품: {fresh.item.name} · {fresh.item.purchasedAt} · {fresh.item.expirationDate ?? "유통기한 없음"}</p><p className="text-xs">현재 입력은 유지됩니다. 최신 기준을 선택한 뒤 변경을 다시 확인하세요.</p><button type="button" disabled={pending} onClick={adopt} className="mt-2 min-h-11 rounded-md border px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">입력을 유지하고 최신 기준 사용</button></div> : null}<p role="alert" className="text-sm">{freshError}</p></> : null}
        {update.unknown ? <button type="submit" form={editFormId} disabled={pending} className="min-h-11 rounded-md border px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">같은 저장 요청 결과 확인</button> : null}
        {hold.unknown ? <button type="submit" form={expirationHoldFormId} disabled={pending} className="min-h-11 rounded-md border px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">같은 보류 요청 결과 확인</button> : null}
        {remove.unknown ? <form action={remove.formAction} onSubmit={remove.onSubmit}><CafeMutationHidden mutation={remove} /><button type="submit" disabled={pending} className="min-h-11 rounded-md border px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">같은 삭제 요청 결과 확인</button></form> : null}
      </div>
      </div>
      <footer className="grid shrink-0 grid-cols-2 items-center gap-2 border-t border-[#eef1f5] bg-white px-2 py-3 sm:flex sm:flex-wrap sm:justify-between sm:px-5 sm:py-4">
        <form className="w-full sm:w-auto" action={remove.formAction} onSubmit={remove.onSubmit}>
          <CafeMutationHidden mutation={remove} />
          <ConfirmSubmitButton
            type="submit"
            disabled={pending || frozen || conflict}
            message={`"${item.name}" 물품을 삭제할까요? 삭제한 물품은 복구할 수 없습니다.`}
            pendingLabel="삭제 중"
            className={buttonClass(
              buttonStyles.base,
              buttonStyles.dangerOutline,
              "h-11 w-full px-2 text-sm sm:w-auto sm:px-4",
            )}
          >
            삭제
          </ConfirmSubmitButton>
        </form>

        <div className="contents sm:flex sm:flex-wrap sm:items-center sm:justify-end sm:gap-2">
          {isExpiredFood ? (
            <button
              type="submit"
              form={expirationHoldFormId}
              disabled={pending || frozen || conflict}
              className={buttonClass(
                buttonStyles.base,
                buttonStyles.neutral,
                "h-11 w-full border-[#b78521] bg-[#fff4d8] px-2 text-sm text-[#7a5200] hover:bg-[#ffedbf] sm:w-auto sm:px-4",
              )}
            >
              {expirationHoldPending
                ? "보류 처리 중"
                : item.expirationHoldReason
                  ? "보류 사유 수정"
                  : "보류 처리"}
            </button>
          ) : null}
          <button
            type="button"
            disabled={pending || frozen || conflict}
            onClick={() => { if (window.confirm("저장하지 않은 입력을 닫을까요?")) onClose(); }}
            className={buttonClass(
              buttonStyles.base,
              buttonStyles.neutral,
              "h-11 w-full px-2 text-sm sm:w-auto sm:px-4",
            )}
          >
            취소
          </button>
          <button
            type="submit"
            form={editFormId}
            disabled={pending || frozen || conflict}
            className={buttonClass(
              buttonStyles.base,
              buttonStyles.save,
              "h-11 w-full px-2 text-sm sm:w-auto sm:px-4",
            )}
          >
            {pending ? "저장 중" : "저장"}
          </button>
        </div>
      </footer>
    </AppModal>
  );
}
