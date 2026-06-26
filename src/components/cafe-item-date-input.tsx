"use client";

import { useState } from "react";
import { isCafeItemDate } from "@/lib/cafe-items-core";
import {
  normalizeSplitDatePart,
  normalizeSplitDateParts,
  type SplitDatePartOptions,
  type SplitDateParts,
} from "@/lib/split-date-input-core";

const defaultInputClassName =
  "h-10 w-full min-w-0 rounded-md border border-[#cfd6e3] bg-white px-3 text-center text-sm outline-none transition placeholder:text-[#9aa4b2] focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]";
const datePartFields = [
  { key: "year", label: "년", maxLength: 2, placeholder: "년" },
  { key: "month", label: "월", maxLength: 2, placeholder: "월" },
  { key: "day", label: "일", maxLength: 2, placeholder: "일" },
] as const;
const cafeSplitDatePartOptions = {
  yearLength: 2,
  yearPrefix: "20",
} satisfies SplitDatePartOptions;

type DateParts = SplitDateParts;

export function CafeItemDateInput({
  className = "",
  defaultValue,
  disabled = false,
  inputClassName = defaultInputClassName,
  label,
  name,
  required = false,
}: {
  className?: string;
  defaultValue: string;
  disabled?: boolean;
  inputClassName?: string;
  label: string;
  name: string;
  required?: boolean;
}) {
  const [parts, setParts] = useState(() => getDateParts(defaultValue));
  const dateValue = getDateValue(parts);

  function updatePart(part: keyof DateParts, value: string) {
    setParts((currentParts) =>
      normalizeSplitDatePart(
        part,
        value,
        currentParts,
        cafeSplitDatePartOptions,
      ),
    );
  }

  function completePart(part: keyof DateParts) {
    const currentValue = parts[part];

    if (part === "year" || currentValue.length !== 1) {
      return;
    }

    if (part === "month") {
      const nextValue = currentValue === "0" ? "" : currentValue;

      setParts((currentParts) =>
        normalizeSplitDatePart(
          part,
          nextValue,
          currentParts,
          cafeSplitDatePartOptions,
        ),
      );
      return;
    }

    const paddedValue =
      currentValue === "0" ? "01" : currentValue.padStart(2, "0");

    setParts((currentParts) =>
      normalizeSplitDatePart(
        part,
        paddedValue,
        currentParts,
        cafeSplitDatePartOptions,
      ),
    );
  }

  return (
    <fieldset className={`m-0 block min-w-0 border-0 p-0 ${className}`.trim()}>
      <legend className="block p-0 text-xs font-semibold leading-4 text-[#697386]">
        {label}
      </legend>
      <input name={name} type="hidden" value={dateValue} />
      <div className="mt-2 grid min-w-0 grid-cols-3 gap-2">
        {datePartFields.map((field) => (
          <input
            key={field.key}
            aria-label={`${label} ${field.label}`}
            className={inputClassName}
            disabled={disabled}
            inputMode="numeric"
            maxLength={field.maxLength}
            onChange={(event) => updatePart(field.key, event.target.value)}
            onBlur={() => completePart(field.key)}
            onFocus={(event) => event.currentTarget.select()}
            pattern="[0-9]*"
            placeholder={field.placeholder}
            required={required}
            type="text"
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

  return normalizeSplitDateParts(
    {
      day: String(Number(day)),
      month: String(Number(month)),
      year: year.slice(-2),
    },
    cafeSplitDatePartOptions,
  );
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
