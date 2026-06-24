"use client";

import { useActionState, useEffect, useId, useState } from "react";
import {
  deleteCafeItemAction,
  updateCafeItemAction,
} from "@/app/work-schedule/cafe/actions";
import { AppModal } from "@/components/app-modal";
import { CafeItemDateInput } from "@/components/cafe-item-date-input";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { buttonClass, buttonStyles } from "@/lib/button-styles";
import {
  cafeItemCategories,
  isCafeItemCategory,
  type CafeItem,
  type CafeItemFormState,
} from "@/lib/cafe-items-core";

const initialState: CafeItemFormState = {};
const inputClassName =
  "h-10 w-full min-w-0 rounded-md border border-transparent bg-[#f5f8f7] px-3 text-sm text-[#16181d] outline-none transition placeholder:text-[#9aa4b2] focus:bg-[#f5f8f7]";
const dateInputClassName = `${inputClassName} text-center`;
const fieldLabelClassName = "text-xs font-semibold text-[#697386]";

export function CafeItemRowActions({ item }: { item: CafeItem }) {
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
          "h-9 px-3 text-xs",
        )}
      >
        편집
      </button>

      {isEditOpen ? (
        <CafeItemEditModal
          key={modalKey}
          item={item}
          onClose={() => setIsEditOpen(false)}
        />
      ) : null}
    </div>
  );
}

function CafeItemEditModal({
  item,
  onClose,
}: {
  item: CafeItem;
  onClose: () => void;
}) {
  const updateItem = updateCafeItemAction.bind(null, item.id);
  const deleteItem = deleteCafeItemAction.bind(null, item.id);
  const editFormId = useId();
  const [state, formAction, pending] = useActionState(
    updateItem,
    initialState,
  );
  const defaultCategory =
    state.values && isCafeItemCategory(state.values.category)
      ? state.values.category
      : item.category;
  const [selectedCategory, setSelectedCategory] = useState(defaultCategory);
  const isFood = selectedCategory === "food";

  useEffect(() => {
    if (state.success) {
      onClose();
    }
  }, [onClose, state.success]);

  return (
    <AppModal
      className="max-w-2xl"
      labelledBy={`cafe-item-edit-title-${item.id}`}
      onClose={onClose}
    >
      <div className="max-h-[calc(100vh-3rem)] overflow-y-auto">
        <form id={editFormId} action={formAction}>
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

            {state.error ? (
              <p className="mt-4 rounded-md border border-[#f0c6c6] bg-[#fff1f1] px-3 py-2 text-sm text-[#8a1f1f]">
                {state.error}
              </p>
            ) : null}

            <div className="mt-5 grid min-w-0 gap-4 sm:grid-cols-2">
              <label className="block min-w-0 sm:col-span-2">
                <span className={fieldLabelClassName}>물품명</span>
                <input
                  name="name"
                  required
                  maxLength={100}
                  defaultValue={state.values?.name ?? item.name}
                  disabled={pending}
                  placeholder="예: 원두, 우유, 청소용 장갑"
                  className={`mt-2 ${inputClassName}`}
                />
              </label>

              <label className="block min-w-0">
                <span className={fieldLabelClassName}>물품 종류</span>
                <select
                  name="category"
                  value={selectedCategory}
                  disabled={pending}
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

              <CafeItemDateInput
                defaultValue={state.values?.purchasedAt ?? item.purchasedAt}
                disabled={pending}
                inputClassName={dateInputClassName}
                label="구매일"
                name="purchasedAt"
                required
              />

              <label className="block min-w-0">
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
                    state.values?.priceWon ?? String(item.priceWon ?? "")
                  }
                  disabled={pending}
                  placeholder="예: 12000"
                  className={`mt-2 ${inputClassName}`}
                />
              </label>

              {isFood ? (
                <CafeItemDateInput
                  defaultValue={
                    state.values?.expirationDate ?? item.expirationDate ?? ""
                  }
                  disabled={pending}
                  inputClassName={dateInputClassName}
                  label="유통기한"
                  name="expirationDate"
                  required
                />
              ) : null}

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
                    state.values?.purchaseReason ?? item.purchaseReason ?? ""
                  }
                  disabled={pending}
                  placeholder="예: 주간 카페 운영 재고 보충"
                  rows={3}
                  className={`mt-2 min-h-24 w-full resize-y rounded-md border border-transparent bg-[#f5f8f7] px-3 py-2 text-sm leading-6 text-[#16181d] outline-none transition placeholder:text-[#9aa4b2] focus:bg-[#f5f8f7]`}
                />
              </label>
            </div>
          </div>
        </form>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-[#eef1f5] bg-white px-5 py-4">
        <form action={deleteItem}>
          <ConfirmSubmitButton
            type="submit"
            message={`"${item.name}" 물품을 삭제할까요?`}
            pendingLabel="삭제 중"
            className={buttonClass(
              buttonStyles.base,
              buttonStyles.dangerOutline,
              "h-10 px-4 text-sm",
            )}
          >
            삭제
          </ConfirmSubmitButton>
        </form>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={onClose}
            className={buttonClass(
              buttonStyles.base,
              buttonStyles.neutral,
              "h-10 px-4 text-sm",
            )}
          >
            취소
          </button>
          <button
            type="submit"
            form={editFormId}
            disabled={pending}
            className={buttonClass(
              buttonStyles.base,
              buttonStyles.save,
              "h-10 px-4 text-sm",
            )}
          >
            {pending ? "저장 중" : "저장"}
          </button>
        </div>
      </footer>
    </AppModal>
  );
}
