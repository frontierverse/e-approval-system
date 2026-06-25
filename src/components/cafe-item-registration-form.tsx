"use client";

import { useActionState, useState } from "react";
import { createCafeItemAction } from "@/app/work-schedule/cafe/actions";
import { CafeItemDateInput } from "@/components/cafe-item-date-input";
import { buttonClass, buttonStyles } from "@/lib/button-styles";
import {
  cafeItemCategories,
  isCafeItemCategory,
  type CafeItemFormState,
} from "@/lib/cafe-items-core";

type CafeItemRegistrationFormProps = {
  today: string;
};

const initialState: CafeItemFormState = {};
const inputBaseClassName =
  "h-10 w-full min-w-0 rounded-md border border-[#cfd6e3] bg-white px-3 text-sm outline-none transition placeholder:text-[#9aa4b2] focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]";
const inputClassName =
  `mt-2 ${inputBaseClassName}`;
const fieldLabelClassName =
  "block text-xs font-semibold leading-4 text-[#697386]";

export function CafeItemRegistrationForm({
  today,
}: CafeItemRegistrationFormProps) {
  const [state, formAction, pending] = useActionState(
    createCafeItemAction,
    initialState,
  );

  return (
    <CafeItemRegistrationFormFields
      key={state.resetKey ?? "draft"}
      formAction={formAction}
      pending={pending}
      state={state}
      today={today}
    />
  );
}

function CafeItemRegistrationFormFields({
  formAction,
  pending,
  state,
  today,
}: CafeItemRegistrationFormProps & {
  formAction: (formData: FormData) => void;
  pending: boolean;
  state: CafeItemFormState;
}) {
  const defaultCategory =
    state.values && isCafeItemCategory(state.values.category)
      ? state.values.category
      : "food";
  const [selectedCategory, setSelectedCategory] = useState(defaultCategory);
  const isFood = selectedCategory === "food";

  return (
    <section className="rounded-md border border-[#d9dee7] bg-white p-5 shadow-sm">
      <form action={formAction}>
        <div className="border-b border-[#eef1f5] pb-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-[#16181d]">
              물품 등록
            </h2>
            <p className="mt-1 text-sm font-semibold text-[#196b69]">
              TAB 키를 사용하여 입력칸 이동 가능
            </p>
          </div>
        </div>

        <div className="mt-5 grid min-w-0 gap-4 lg:grid-cols-4">
          <label className="block min-w-0 lg:col-span-2">
            <span className={fieldLabelClassName}>물품명</span>
            <input
              name="name"
              required
              maxLength={100}
              defaultValue={state.values?.name ?? ""}
              placeholder="예: 원두, 우유, 청소용 장갑"
              className={inputClassName}
            />
          </label>

          <CafeItemDateInput
            className="lg:col-span-2"
            defaultValue={state.values?.purchasedAt || today}
            label="구매일"
            name="purchasedAt"
            required
          />

          <label className="block min-w-0 lg:-mt-2">
            <span className={fieldLabelClassName}>물품 종류</span>
            <select
              name="category"
              value={selectedCategory}
              onChange={(event) => {
                const nextCategory = event.target.value;

                if (isCafeItemCategory(nextCategory)) {
                  setSelectedCategory(nextCategory);
                }
              }}
              className={`${inputClassName} cursor-pointer`}
            >
              {cafeItemCategories.map((category) => (
                <option key={category.value} value={category.value}>
                  {category.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block min-w-0 lg:-mt-2">
            <span className={fieldLabelClassName}>
              가격
              <span className="ml-1 font-normal text-[#9aa4b2]">선택</span>
            </span>
            <input
              name="priceWon"
              inputMode="numeric"
              pattern="[0-9]*"
              defaultValue={state.values?.priceWon ?? ""}
              placeholder="예: 12000"
              className={inputClassName}
            />
          </label>

          {isFood ? (
            <CafeItemDateInput
              className="lg:col-span-2"
              defaultValue={state.values?.expirationDate ?? ""}
              label="유통기한"
              name="expirationDate"
              required
            />
          ) : null}

          <label
            className={[
              "block min-w-0",
              "lg:col-span-3",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <span className={fieldLabelClassName}>
              구매 사유
              <span className="ml-1 font-normal text-[#9aa4b2]">선택</span>
            </span>
            <input
              name="purchaseReason"
              maxLength={500}
              defaultValue={state.values?.purchaseReason ?? ""}
              placeholder="예: 주간 카페 운영 재고 보충"
              className={inputClassName}
            />
          </label>
          <button
            type="submit"
            disabled={pending}
            className={buttonClass(
              buttonStyles.base,
              buttonStyles.save,
              "h-10 w-full self-end px-4 text-sm lg:w-auto",
            )}
          >
            {pending ? "등록 중" : "등록"}
          </button>
        </div>
      </form>

      <CafeItemFormMessage state={state} />
    </section>
  );
}

function CafeItemFormMessage({ state }: { state: CafeItemFormState }) {
  if (state.error) {
    return (
      <p className="mt-3 rounded-md border border-[#f0c6c6] bg-[#fff1f1] px-3 py-2 text-sm text-[#8a1f1f]">
        {state.error}
      </p>
    );
  }

  if (state.success) {
    return (
      <p className="mt-3 rounded-md border border-[#bddfc9] bg-[#e8f5ed] px-3 py-2 text-sm text-[#22633a]">
        {state.success}
      </p>
    );
  }

  return null;
}
