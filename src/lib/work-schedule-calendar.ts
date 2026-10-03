import {
  getYouthLearningScheduleToday,
  type YouthLearningScheduleWeekday,
} from "@/lib/youth-management-core";

export const workScheduleCalendarWeekdays = [
  { value: 0, label: "일" },
  { value: 1, label: "월" },
  { value: 2, label: "화" },
  { value: 3, label: "수" },
  { value: 4, label: "목" },
  { value: 5, label: "금" },
  { value: 6, label: "토" },
] as const satisfies ReadonlyArray<{
  value: YouthLearningScheduleWeekday;
  label: string;
}>;

export type WorkScheduleCalendarDay = {
  date: string;
  day: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  weekday: YouthLearningScheduleWeekday;
};

export function isWorkScheduleDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000-")) return false;
  const date = parseWorkScheduleDate(value);
  return Number.isFinite(date.getTime()) && formatWorkScheduleDate(date) === value;
}

export function getWorkScheduleWeekday(value: string): YouthLearningScheduleWeekday {
  return parseWorkScheduleDate(value).getUTCDay() as YouthLearningScheduleWeekday;
}

export function getWorkScheduleMonthDates(month: string) {
  if (!isWorkScheduleMonth(month)) return [];
  const cursor = parseWorkScheduleDate(`${month}-01`), dates: string[] = [];
  while (formatWorkScheduleMonth(cursor) === month) {
    dates.push(formatWorkScheduleDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

export function getWorkScheduleCurrentMonth() {
  return getWorkScheduleMonthFromDate(getYouthLearningScheduleToday());
}

export function getWorkScheduleMonthFromDate(scheduleDate: string) {
  return scheduleDate.slice(0, 7);
}

export function isWorkScheduleMonth(value: string) {
  if (!/^\d{4}-\d{2}$/.test(value)) {
    return false;
  }

  return isWorkScheduleDate(`${value}-01`);
}

export function normalizeWorkScheduleMonth(value: string | undefined) {
  return value && isWorkScheduleMonth(value)
    ? value
    : getWorkScheduleCurrentMonth();
}

export function shiftWorkScheduleMonth(month: string, delta: number) {
  const date = parseWorkScheduleDate(`${month}-01`);
  date.setUTCMonth(date.getUTCMonth() + delta);

  return formatWorkScheduleMonth(date);
}

export function getWorkScheduleMonthRange(month: string) {
  const normalizedMonth = normalizeWorkScheduleMonth(month);

  return {
    // Date fields use canonical four-digit years; an internal exclusive sentinel
    // keeps the final December range lexically within year 9999.
    endDate: normalizedMonth === "9999-12" ? "9999-12-32" : `${shiftWorkScheduleMonth(normalizedMonth, 1)}-01`,
    startDate: `${normalizedMonth}-01`,
  };
}

export function createWorkScheduleCalendarDays(month: string) {
  const normalizedMonth = normalizeWorkScheduleMonth(month);
  const firstDate = parseWorkScheduleDate(`${normalizedMonth}-01`);
  const firstWeekday = firstDate.getUTCDay();
  const gridStart = new Date(firstDate);
  const today = getYouthLearningScheduleToday();

  gridStart.setUTCDate(firstDate.getUTCDate() - firstWeekday);

  return Array.from({ length: 42 }, (_, index): WorkScheduleCalendarDay => {
    const date = new Date(gridStart);
    date.setUTCDate(gridStart.getUTCDate() + index);

    const dateValue = formatWorkScheduleDate(date);

    return {
      date: dateValue,
      day: date.getUTCDate(),
      isCurrentMonth: getWorkScheduleMonthFromDate(dateValue) === normalizedMonth,
      isToday: dateValue === today,
      weekday: date.getUTCDay() as YouthLearningScheduleWeekday,
    };
  });
}

export function formatWorkScheduleMonthLabel(month: string) {
  const [yearText, monthText] = normalizeWorkScheduleMonth(month).split("-");

  return `${yearText}년 ${Number(monthText)}월`;
}

export function formatWorkScheduleDateLabel(scheduleDate: string) {
  if (!isWorkScheduleDate(scheduleDate)) {
    return scheduleDate;
  }

  const [yearText, monthText, dayText] = scheduleDate.split("-");
  const weekday = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "UTC",
    weekday: "short",
  }).format(parseWorkScheduleDate(scheduleDate));

  return `${yearText}년 ${Number(monthText)}월 ${Number(dayText)}일 (${weekday})`;
}

export function shiftWorkScheduleDate(scheduleDate: string, days: number) {
  const date = parseWorkScheduleDate(scheduleDate);
  date.setUTCDate(date.getUTCDate() + days);
  return formatWorkScheduleDate(date);
}

function parseWorkScheduleDate(value: string) {
  const [yearText, monthText, dayText] = value.split("-");

  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(Number(yearText), Number(monthText) - 1, Number(dayText));
  return date;
}

function formatWorkScheduleDate(value: Date) {
  const year = String(value.getUTCFullYear()).padStart(4, "0");
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatWorkScheduleMonth(value: Date) {
  const year = String(value.getUTCFullYear()).padStart(4, "0");
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");

  return `${year}-${month}`;
}
