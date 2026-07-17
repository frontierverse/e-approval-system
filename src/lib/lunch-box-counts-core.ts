import { getKoreanDateValue } from "@/lib/document-archive-policy";

export const lunchBoxSchoolTypes = [
  { value: "elementary", label: "초등학교" },
  { value: "kindergarten", label: "병설유치원" },
] as const;

export const lunchBoxCountFields = [
  "class1Count",
  "class2Count",
  "class3Count",
  "class4Count",
  "linkedCount",
] as const;

export const lunchBoxCountFieldLabels: Record<
  (typeof lunchBoxCountFields)[number],
  string
> = {
  class1Count: "1반",
  class2Count: "2반",
  class3Count: "3반",
  class4Count: "4반",
  linkedCount: "연계형",
};

const weekdayLabels = ["일", "월", "화", "수", "목", "금", "토"];

export const lunchBoxCalendarWeekdays = [
  { value: 0, label: "일" },
  { value: 1, label: "월" },
  { value: 2, label: "화" },
  { value: 3, label: "수" },
  { value: 4, label: "목" },
  { value: 5, label: "금" },
  { value: 6, label: "토" },
] as const;

export type LunchBoxCalendarWeekday =
  (typeof lunchBoxCalendarWeekdays)[number]["value"];

export type LunchBoxCalendarDay = {
  date: string;
  day: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  weekday: LunchBoxCalendarWeekday;
};

export type LunchBoxSchoolType = (typeof lunchBoxSchoolTypes)[number]["value"];
export type LunchBoxCountField = (typeof lunchBoxCountFields)[number];

export type LunchBoxSchool = {
  id: string;
  name: string;
  type: LunchBoxSchoolType;
  order: number;
  active: boolean;
};

export type LunchBoxCountValues = Record<LunchBoxCountField, number>;

export type LunchBoxCountRow = LunchBoxCountValues & {
  schoolId: string;
  schoolName: string;
  schoolType: LunchBoxSchoolType;
};

export type LunchBoxCountGrid = {
  date: string;
  rows: LunchBoxCountRow[];
};

export type LunchBoxCountRowInput = LunchBoxCountValues & {
  schoolId: string;
};

export type LunchBoxCountMonthDaySchool = {
  schoolId: string;
  schoolName: string;
  schoolType: LunchBoxSchoolType;
  total: number;
};

export type LunchBoxCountMonthDay = {
  date: string;
  totalCount: number;
  schools: LunchBoxCountMonthDaySchool[];
};

export type LunchBoxCountMonth = {
  month: string;
  days: Record<string, LunchBoxCountMonthDay>;
};

export type LunchBoxSchoolFormValues = {
  name: string;
  type: string;
};

export type LunchBoxSchoolFormState = {
  error?: string;
  resetKey?: string;
  success?: string;
  values?: LunchBoxSchoolFormValues;
};

export type LunchBoxActionResult<T> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      error: string;
    };

export function isLunchBoxSchoolType(
  value: string,
): value is LunchBoxSchoolType {
  return lunchBoxSchoolTypes.some((type) => type.value === value);
}

export function normalizeLunchBoxSchoolType(
  value: string | undefined,
): LunchBoxSchoolType {
  return value && isLunchBoxSchoolType(value) ? value : "elementary";
}

export function getLunchBoxSchoolTypeLabel(type: string) {
  return (
    lunchBoxSchoolTypes.find((item) => item.value === type)?.label ?? "기타"
  );
}

export function normalizeLunchBoxSchoolFormValues(
  formData: FormData,
): LunchBoxSchoolFormValues {
  return {
    name: String(formData.get("name") ?? "").trim(),
    type: String(formData.get("type") ?? ""),
  };
}

export function normalizeLunchBoxCountValue(value: unknown): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return Math.floor(parsed);
}

export function getLunchBoxCountTotal(values: LunchBoxCountValues): number {
  return lunchBoxCountFields.reduce((sum, field) => sum + values[field], 0);
}

export function isLunchBoxDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function getLunchBoxCountToday() {
  return getKoreanDateValue();
}

export function parseLunchBoxDateValue(value: string) {
  const [yearText, monthText, dayText] = value.split("-");

  return new Date(
    Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText)),
  );
}

export function formatLunchBoxDateValue(date: Date | string): string {
  if (typeof date === "string") {
    if (isLunchBoxDate(date)) {
      return date;
    }

    const parsedDate = new Date(date);

    return Number.isNaN(parsedDate.getTime())
      ? date
      : formatLunchBoxDateValue(parsedDate);
  }

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

export function shiftLunchBoxDate(value: string, days: number) {
  const date = parseLunchBoxDateValue(value);
  date.setUTCDate(date.getUTCDate() + days);

  return formatLunchBoxDateValue(date);
}

export function formatLunchBoxDateLabel(value: string) {
  if (!isLunchBoxDate(value)) {
    return value;
  }

  const [year, month, day] = value.split("-");
  const weekday = weekdayLabels[parseLunchBoxDateValue(value).getUTCDay()];

  return `${year}.${month}.${day}.(${weekday})`;
}

export function getLunchBoxMonthFromDate(date: string) {
  return date.slice(0, 7);
}

export function isLunchBoxMonth(value: string) {
  if (!/^\d{4}-\d{2}$/.test(value)) {
    return false;
  }

  return isLunchBoxDate(`${value}-01`);
}

export function normalizeLunchBoxMonth(value: string | undefined) {
  return value && isLunchBoxMonth(value) ? value : getLunchBoxCurrentMonth();
}

export function getLunchBoxCurrentMonth() {
  return getLunchBoxMonthFromDate(getLunchBoxCountToday());
}

export function shiftLunchBoxMonth(month: string, delta: number) {
  const date = parseLunchBoxDateValue(`${month}-01`);
  date.setUTCMonth(date.getUTCMonth() + delta);

  return formatLunchBoxMonthValue(date);
}

export function getLunchBoxMonthRange(month: string) {
  const normalizedMonth = normalizeLunchBoxMonth(month);

  return {
    endDate: `${shiftLunchBoxMonth(normalizedMonth, 1)}-01`,
    startDate: `${normalizedMonth}-01`,
  };
}

export function createLunchBoxCalendarDays(month: string) {
  const normalizedMonth = normalizeLunchBoxMonth(month);
  const firstDate = parseLunchBoxDateValue(`${normalizedMonth}-01`);
  const firstWeekday = firstDate.getUTCDay();
  const gridStart = new Date(firstDate);
  const today = getLunchBoxCountToday();

  gridStart.setUTCDate(firstDate.getUTCDate() - firstWeekday);

  return Array.from({ length: 42 }, (_, index): LunchBoxCalendarDay => {
    const date = new Date(gridStart);
    date.setUTCDate(gridStart.getUTCDate() + index);

    const dateValue = formatLunchBoxDateValue(date);

    return {
      date: dateValue,
      day: date.getUTCDate(),
      isCurrentMonth: getLunchBoxMonthFromDate(dateValue) === normalizedMonth,
      isToday: dateValue === today,
      weekday: date.getUTCDay() as LunchBoxCalendarWeekday,
    };
  });
}

export function formatLunchBoxMonthLabel(month: string) {
  const [yearText, monthText] = normalizeLunchBoxMonth(month).split("-");

  return `${yearText}년 ${Number(monthText)}월`;
}

function formatLunchBoxMonthValue(value: Date) {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");

  return `${year}-${month}`;
}
