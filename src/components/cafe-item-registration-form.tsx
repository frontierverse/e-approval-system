"use client";

import { useActionState, useState } from "react";
import { createCafeItemAction } from "@/app/work-schedule/cafe/actions";
import { buttonClass, buttonStyles } from "@/lib/button-styles";
import {
  cafeItemCategories,
  isCafeItemCategory,
  isCafeItemDate,
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
const datePartInputClassName = `${inputBaseClassName} text-center`;
const datePartFields = [
  { key: "year", label: "년", max: 99, min: 0, placeholder: "년" },
  { key: "month", label: "월", max: 12, min: 1, placeholder: "월" },
  { key: "day", label: "일", max: 31, min: 1, placeholder: "일" },
] as const;

type DateParts = Record<(typeof datePartFields)[number]["key"], string>;

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
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-b border-[#eef1f5] pb-4">
          <h2 className="text-base font-semibold text-[#16181d]">물품 등록</h2>
          <button
            type="submit"
            disabled={pending}
            className={buttonClass(
              buttonStyles.base,
              buttonStyles.save,
              "h-10 shrink-0 px-4 text-sm",
            )}
          >
            {pending ? "등록 중" : "등록"}
          </button>
        </div>

        <div className="mt-5 grid min-w-0 gap-4 lg:grid-cols-4">
          <label className="block min-w-0 lg:col-span-2">
            <span className="text-xs font-semibold text-[#697386]">물품명</span>
            <input
              name="name"
              required
              maxLength={100}
              defaultValue={state.values?.name ?? ""}
              placeholder="예: 원두, 우유, 청소용 장갑"
              className={inputClassName}
            />
          </label>

          <label className="block min-w-0">
            <span className="text-xs font-semibold text-[#697386]">
              물품 종류
            </span>
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

          <NumericDateInput
            className="lg:col-span-2"
            defaultValue={state.values?.purchasedAt || today}
            label="구매일"
            name="purchasedAt"
            required
          />

          {isFood ? (
            <NumericDateInput
              className="lg:col-span-2"
              defaultValue={state.values?.expirationDate ?? ""}
              label="유통기한"
              name="expirationDate"
              required
            />
          ) : null}

          <label className="block min-w-0">
            <span className="text-xs font-semibold text-[#697386]">
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

          <label className="block min-w-0 lg:col-span-2">
            <span className="text-xs font-semibold text-[#697386]">
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
        </div>
      </form>

      <CafeItemFormMessage state={state} />
    </section>
  );
}

function NumericDateInput({
  className = "",
  defaultValue,
  label,
  name,
  required = false,
}: {
  className?: string;
  defaultValue: string;
  label: string;
  name: string;
  required?: boolean;
}) {
  const [parts, setParts] = useState(() => getDateParts(defaultValue));
  const dateValue = getDateValue(parts);

  function updatePart(part: keyof DateParts, value: string) {
    const normalizedValue = value.replace(/\D/g, "").slice(0, 2);

    setParts((currentParts) => ({
      ...currentParts,
      [part]: normalizedValue,
    }));
  }

  return (
    <fieldset className={`block min-w-0 ${className}`.trim()}>
      <legend className="text-xs font-semibold text-[#697386]">{label}</legend>
      <input name={name} type="hidden" value={dateValue} />
      <div className="mt-2 grid min-w-0 grid-cols-3 gap-2">
        {datePartFields.map((field) => (
          <input
            key={field.key}
            aria-label={`${label} ${field.label}`}
            className={datePartInputClassName}
            inputMode="numeric"
            max={field.max}
            min={field.min}
            onChange={(event) => updatePart(field.key, event.target.value)}
            placeholder={field.placeholder}
            required={required}
            step={1}
            type="number"
            value={parts[field.key]}
          />
        ))}
      </div>
    </fieldset>
  );
}

function getDateParts(value: string): DateParts {
  if (!isCafeItemDate(value)) {
    return {
      day: "",
      month: "",
      year: "",
    };
  }

  const [year, month, day] = value.split("-");

  return {
    day: String(Number(day)),
    month: String(Number(month)),
    year: year.slice(-2),
  };
}

function getDateValue(parts: DateParts) {
  const year = parts.year.trim();
  const month = parts.month.trim();
  const day = parts.day.trim();

  if (!year && !month && !day) {
    return "";
  }

  if (year.length !== 2) {
    return "";
  }

  const value = `20${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;

  return isCafeItemDate(value) ? value : "";
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
