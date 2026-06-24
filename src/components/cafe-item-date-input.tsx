"use client";

import { useState } from "react";
import { isCafeItemDate } from "@/lib/cafe-items-core";

const defaultInputClassName =
  "h-10 w-full min-w-0 rounded-md border border-[#cfd6e3] bg-white px-3 text-center text-sm outline-none transition placeholder:text-[#9aa4b2] focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]";
const datePartFields = [
  { key: "year", label: "년", max: 99, min: 0, placeholder: "년" },
  { key: "month", label: "월", max: 12, min: 1, placeholder: "월" },
  { key: "day", label: "일", max: 31, min: 1, placeholder: "일" },
] as const;

type DateParts = Record<(typeof datePartFields)[number]["key"], string>;

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
            className={inputClassName}
            disabled={disabled}
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
