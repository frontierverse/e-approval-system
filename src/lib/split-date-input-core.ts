export type SplitDatePart = "day" | "month" | "year";

export type SplitDateParts = Record<SplitDatePart, string>;

export type SplitDatePartOptions = {
  yearLength?: number;
  yearPrefix?: string;
};

const defaultSplitDatePartOptions = {
  yearLength: 4,
  yearPrefix: "",
} satisfies Required<SplitDatePartOptions>;

export function normalizeSplitDatePart(
  part: SplitDatePart,
  value: string,
  currentParts: SplitDateParts,
  options?: SplitDatePartOptions,
) {
  const normalizedValue =
    part === "month"
      ? normalizeMonthInput(value, currentParts.month)
      : normalizeDigitText(
          value,
          part === "year" ? getSplitDatePartOptions(options).yearLength : 2,
        );

  return normalizeSplitDateParts(
    {
      ...currentParts,
      [part]: normalizedValue,
    },
    options,
  );
}

export function normalizeSplitDateParts(
  parts: SplitDateParts,
  options?: SplitDatePartOptions,
): SplitDateParts {
  const normalizedParts = {
    day: normalizeDigitText(parts.day, 2),
    month: normalizeMonthInput(parts.month, ""),
    year: normalizeDigitText(
      parts.year,
      getSplitDatePartOptions(options).yearLength,
    ),
  };

  return {
    ...normalizedParts,
    day: clampDay(
      normalizedParts.day,
      getSplitDateDayLimit(normalizedParts, options),
    ),
  };
}

export function getSplitDateDayLimit(
  parts: Pick<SplitDateParts, "month" | "year">,
  options?: SplitDatePartOptions,
) {
  const month = Number(parts.month);

  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return 31;
  }

  if (month === 2) {
    const year = getSplitDateYear(parts.year, options);

    if (year === null) {
      return 29;
    }

    return isLeapYear(year) ? 29 : 28;
  }

  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

function normalizeDigitText(value: string, limit: number) {
  return value.replace(/\D/g, "").slice(0, limit);
}

function normalizeMonthInput(value: string, previousValue: string) {
  const digits = normalizeDigitText(value, 2);

  if (digits.length === 0) {
    return digits;
  }

  if (digits.length === 1) {
    return digits;
  }

  const month = Number(digits);

  if (month >= 1 && month <= 12) {
    return String(month);
  }

  const firstDigit = digits.slice(0, 1);

  return previousValue && previousValue.length <= 1 ? previousValue : firstDigit;
}

function clampDay(value: string, maximum: number) {
  if (value.length < 2) {
    return value;
  }

  const day = Number(value);

  if (day < 1) {
    return "01";
  }

  return day > maximum ? String(maximum).padStart(2, "0") : value;
}

function getSplitDateYear(value: string, options?: SplitDatePartOptions) {
  const { yearLength, yearPrefix } = getSplitDatePartOptions(options);

  if (value.length !== yearLength) {
    return null;
  }

  const year = Number(`${yearPrefix}${value}`);

  return Number.isInteger(year) ? year : null;
}

function getSplitDatePartOptions(options?: SplitDatePartOptions) {
  return {
    ...defaultSplitDatePartOptions,
    ...options,
  };
}

function isLeapYear(year: number) {
  return year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0);
}
