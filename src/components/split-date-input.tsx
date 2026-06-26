"use client";

import { useRef } from "react";
import {
  normalizeSplitDatePart,
  normalizeSplitDateParts,
  type SplitDatePart,
  type SplitDateParts,
} from "@/lib/split-date-input-core";

type SplitDateInputProps = {
  ariaLabel: string;
  className?: string;
  value: string;
  onChange: (value: string) => void;
};

export function SplitDateInput({
  ariaLabel,
  className = "",
  onChange,
  value,
}: SplitDateInputProps) {
  const monthRef = useRef<HTMLInputElement>(null);
  const parts = getDateParts(value);
  const inputClassName = [
    "h-11 w-full rounded-md border border-[#cfd6e3] px-3 text-center text-sm outline-none placeholder:text-[#9aa4b2] focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  function updatePart(
    part: SplitDatePart,
    nextRawValue: string,
    input?: HTMLInputElement,
  ) {
    const nextParts = normalizeSplitDatePart(part, nextRawValue, parts);

    onChange(createDateValue(nextParts));
    keepCaretAtEnd(input, nextParts[part].length);

    if (part === "year" && nextParts.year.length === 4) {
      monthRef.current?.focus();
    }
  }

  function completePart(part: Exclude<SplitDatePart, "year">) {
    const currentValue = parts[part];

    if (currentValue.length !== 1) {
      return;
    }

    if (part === "month") {
      const nextValue = currentValue === "0" ? "" : currentValue;

      onChange(createDateValue(normalizeSplitDatePart(part, nextValue, parts)));
      return;
    }

    const paddedValue =
      currentValue === "0" ? "01" : currentValue.padStart(2, "0");

    onChange(createDateValue(normalizeSplitDatePart(part, paddedValue, parts)));
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
        pattern="[0-9]*"
        value={parts.year}
        onChange={(event) =>
          updatePart("year", event.target.value, event.currentTarget)
        }
        onFocus={(event) => event.currentTarget.select()}
        placeholder="년"
        aria-label={`${ariaLabel} 년`}
        className={inputClassName}
      />
      <input
        ref={monthRef}
        type="text"
        inputMode="numeric"
        maxLength={2}
        pattern="[0-9]*"
        value={parts.month}
        onChange={(event) =>
          updatePart("month", event.target.value, event.currentTarget)
        }
        onBlur={() => completePart("month")}
        onFocus={(event) => event.currentTarget.select()}
        placeholder="월"
        aria-label={`${ariaLabel} 월`}
        className={inputClassName}
      />
      <input
        type="text"
        inputMode="numeric"
        maxLength={2}
        pattern="[0-9]*"
        value={parts.day}
        onChange={(event) =>
          updatePart("day", event.target.value, event.currentTarget)
        }
        onBlur={() => completePart("day")}
        onFocus={(event) => event.currentTarget.select()}
        placeholder="일"
        aria-label={`${ariaLabel} 일`}
        className={inputClassName}
      />
    </div>
  );
}

function getDateParts(value: string) {
  const [year = "", month = "", day = ""] = value.split("-");

  return normalizeSplitDateParts({
    day: day.replace(/\D/g, "").slice(0, 2),
    month: month.replace(/\D/g, "").slice(0, 2),
    year: year.replace(/\D/g, "").slice(0, 4),
  });
}

function createDateValue(parts: SplitDateParts) {
  if (!parts.year && !parts.month && !parts.day) {
    return "";
  }

  if (
    parts.year.length === 4 &&
    isCompleteMonth(parts.month) &&
    parts.day.length === 2
  ) {
    return [
      parts.year,
      parts.month.padStart(2, "0"),
      parts.day,
    ].join("-");
  }

  return [parts.year, parts.month, parts.day].join("-");
}

function isCompleteMonth(value: string) {
  const month = Number(value);

  return Number.isInteger(month) && month >= 1 && month <= 12;
}

function keepCaretAtEnd(input: HTMLInputElement | undefined, position: number) {
  if (!input) {
    return;
  }

  window.requestAnimationFrame(() => {
    input.setSelectionRange(position, position);
  });
}
