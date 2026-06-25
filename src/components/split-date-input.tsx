"use client";

import { useRef } from "react";

type SplitDateInputProps = {
  ariaLabel: string;
  className?: string;
  value: string;
  onChange: (value: string) => void;
};

type DatePart = "day" | "month" | "year";

export function SplitDateInput({
  ariaLabel,
  className = "",
  onChange,
  value,
}: SplitDateInputProps) {
  const monthRef = useRef<HTMLInputElement>(null);
  const dayRef = useRef<HTMLInputElement>(null);
  const parts = getDateParts(value);
  const inputClassName = [
    "h-11 w-full rounded-md border border-[#cfd6e3] px-3 text-center text-sm outline-none placeholder:text-[#9aa4b2] focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  function updatePart(part: DatePart, nextRawValue: string) {
    const nextParts = {
      ...parts,
      [part]: normalizeDatePart(part, nextRawValue),
    };

    onChange(createDateValue(nextParts));

    if (part === "year" && nextParts.year.length === 4) {
      monthRef.current?.focus();
    }

    if (part === "month" && nextParts.month.length === 2) {
      dayRef.current?.focus();
    }
  }

  function completePart(part: Exclude<DatePart, "year">) {
    const currentValue = parts[part];

    if (currentValue.length !== 1) {
      return;
    }

    onChange(
      createDateValue({
        ...parts,
        [part]: currentValue.padStart(2, "0"),
      }),
    );
  }

  return (
    <div
      className="mt-2 grid grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,0.8fr)] gap-2"
      role="group"
      aria-label={ariaLabel}
    >
      <input
        type="text"
        inputMode="numeric"
        maxLength={4}
        value={parts.year}
        onChange={(event) => updatePart("year", event.target.value)}
        placeholder="년"
        aria-label={`${ariaLabel} 년`}
        className={inputClassName}
      />
      <input
        ref={monthRef}
        type="text"
        inputMode="numeric"
        maxLength={2}
        value={parts.month}
        onChange={(event) => updatePart("month", event.target.value)}
        onBlur={() => completePart("month")}
        placeholder="월"
        aria-label={`${ariaLabel} 월`}
        className={inputClassName}
      />
      <input
        ref={dayRef}
        type="text"
        inputMode="numeric"
        maxLength={2}
        value={parts.day}
        onChange={(event) => updatePart("day", event.target.value)}
        onBlur={() => completePart("day")}
        placeholder="일"
        aria-label={`${ariaLabel} 일`}
        className={inputClassName}
      />
    </div>
  );
}

function getDateParts(value: string) {
  const [year = "", month = "", day = ""] = value.split("-");

  return {
    day: day.replace(/\D/g, "").slice(0, 2),
    month: month.replace(/\D/g, "").slice(0, 2),
    year: year.replace(/\D/g, "").slice(0, 4),
  };
}

function normalizeDatePart(part: DatePart, value: string) {
  const limit = part === "year" ? 4 : 2;

  return value.replace(/\D/g, "").slice(0, limit);
}

function createDateValue(parts: ReturnType<typeof getDateParts>) {
  if (!parts.year && !parts.month && !parts.day) {
    return "";
  }

  if (
    parts.year.length === 4 &&
    parts.month.length === 2 &&
    parts.day.length === 2
  ) {
    return [
      parts.year,
      parts.month,
      parts.day,
    ].join("-");
  }

  return [parts.year, parts.month, parts.day].join("-");
}
