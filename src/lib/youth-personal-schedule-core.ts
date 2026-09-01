export const youthPersonalScheduleContentMaxLength = 200;
export const youthPersonalScheduleOccurrenceMaxCount = 366;
export const youthPersonalScheduleMinuteStep = 10;
export const youthPersonalScheduleDayEndMinute = 24 * 60;

export const youthPersonalScheduleSelectionModes = [
  "DATES",
  "WEEKDAYS",
] as const;

export type YouthPersonalScheduleSelectionMode =
  (typeof youthPersonalScheduleSelectionModes)[number];

export type YouthPersonalScheduleWeekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type YouthPersonalScheduleInput = {
  content: string;
  startMinute: number;
  endMinute: number;
  selectionMode: YouthPersonalScheduleSelectionMode;
  occurrenceDates: string[];
  recurrenceWeekdays: number[];
  recurrenceStartDate: string;
  recurrenceEndDate: string;
};

export type NormalizedYouthPersonalScheduleInput = {
  content: string;
  startMinute: number;
  endMinute: number;
  selectionMode: YouthPersonalScheduleSelectionMode;
  occurrenceDates: string[];
  recurrenceWeekdays: string | null;
  recurrenceWeekdayValues: YouthPersonalScheduleWeekday[];
  recurrenceStartDate: string | null;
  recurrenceEndDate: string | null;
};

export type NormalizeYouthPersonalScheduleInputResult =
  | {
      ok: true;
      value: NormalizedYouthPersonalScheduleInput;
    }
  | {
      ok: false;
      error: string;
    };

const weekdayDisplayOrder: YouthPersonalScheduleWeekday[] = [
  1, 2, 3, 4, 5, 6, 0,
];
const millisecondsPerDay = 24 * 60 * 60 * 1000;

export function normalizeYouthPersonalScheduleInput(
  input: unknown,
): NormalizeYouthPersonalScheduleInputResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return invalid("일정 입력 형식이 올바르지 않습니다.");
  }

  const value = input as Record<string, unknown>;
  const content =
    typeof value.content === "string" ? value.content.trim() : "";

  if (!content) {
    return invalid("일정 내용을 입력하세요.");
  }

  if (content.length > youthPersonalScheduleContentMaxLength) {
    return invalid(
      `일정 내용은 ${youthPersonalScheduleContentMaxLength}자 이내로 입력하세요.`,
    );
  }

  if (!isYouthPersonalScheduleStartMinute(value.startMinute)) {
    return invalid("시작 시간은 00:00부터 23:50까지 10분 단위로 선택하세요.");
  }

  if (!isYouthPersonalScheduleEndMinute(value.endMinute, value.startMinute)) {
    return invalid(
      "종료 시간은 시작 시간보다 늦고 24:00 이내인 10분 단위로 선택하세요.",
    );
  }

  if (!isYouthPersonalScheduleSelectionMode(value.selectionMode)) {
    return invalid("일정 등록 방식을 다시 선택하세요.");
  }

  if (value.selectionMode === "DATES") {
    const dates = normalizeYouthPersonalScheduleDates(value.occurrenceDates);

    if (!dates.ok) {
      return dates;
    }

    return {
      ok: true,
      value: {
        content,
        startMinute: value.startMinute,
        endMinute: value.endMinute,
        selectionMode: value.selectionMode,
        occurrenceDates: dates.value,
        recurrenceWeekdays: null,
        recurrenceWeekdayValues: [],
        recurrenceStartDate: null,
        recurrenceEndDate: null,
      },
    };
  }

  const weekdays = normalizeYouthPersonalScheduleWeekdayInput(
    value.recurrenceWeekdays,
  );

  if (!weekdays.ok) {
    return weekdays;
  }

  const recurrenceStartDate = normalizeDateValue(value.recurrenceStartDate);
  const recurrenceEndDate = normalizeDateValue(value.recurrenceEndDate);

  if (!recurrenceStartDate || !recurrenceEndDate) {
    return invalid("요일 반복의 시작일과 종료일을 모두 선택하세요.");
  }

  if (recurrenceEndDate < recurrenceStartDate) {
    return invalid("요일 반복 종료일은 시작일보다 빠를 수 없습니다.");
  }

  const periodDayCount = getInclusiveDateCount(
    recurrenceStartDate,
    recurrenceEndDate,
  );

  if (
    periodDayCount < 1 ||
    periodDayCount > youthPersonalScheduleOccurrenceMaxCount
  ) {
    return invalid(
      `요일 반복 기간은 최대 ${youthPersonalScheduleOccurrenceMaxCount}일까지 선택할 수 있습니다.`,
    );
  }

  const occurrenceDates = createYouthPersonalScheduleWeekdayDates(
    recurrenceStartDate,
    recurrenceEndDate,
    weekdays.value,
  );

  if (occurrenceDates.length === 0) {
    return invalid("선택한 기간에 해당하는 반복 요일이 없습니다.");
  }

  return {
    ok: true,
    value: {
      content,
      startMinute: value.startMinute,
      endMinute: value.endMinute,
      selectionMode: value.selectionMode,
      occurrenceDates,
      recurrenceWeekdays: weekdays.value.join(","),
      recurrenceWeekdayValues: weekdays.value,
      recurrenceStartDate,
      recurrenceEndDate,
    },
  };
}

export function isYouthPersonalScheduleSelectionMode(
  value: unknown,
): value is YouthPersonalScheduleSelectionMode {
  return youthPersonalScheduleSelectionModes.some((mode) => mode === value);
}

export function isYouthPersonalScheduleStartMinute(
  value: unknown,
): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value < youthPersonalScheduleDayEndMinute &&
    value % youthPersonalScheduleMinuteStep === 0
  );
}

export function isYouthPersonalScheduleEndMinute(
  value: unknown,
  startMinute: number,
): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value > startMinute &&
    value <= youthPersonalScheduleDayEndMinute &&
    value % youthPersonalScheduleMinuteStep === 0
  );
}

export function isYouthPersonalScheduleDate(
  value: unknown,
): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  if (!year || !month || !day) {
    return false;
  }

  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function createYouthPersonalScheduleWeekdayDates(
  startDate: string,
  endDate: string,
  weekdays: readonly number[],
) {
  if (
    !isYouthPersonalScheduleDate(startDate) ||
    !isYouthPersonalScheduleDate(endDate) ||
    endDate < startDate
  ) {
    return [];
  }

  const normalizedWeekdays = normalizeYouthPersonalScheduleWeekdays(weekdays);
  const dayCount = getInclusiveDateCount(startDate, endDate);

  if (
    normalizedWeekdays.length === 0 ||
    dayCount > youthPersonalScheduleOccurrenceMaxCount
  ) {
    return [];
  }

  const selectedWeekdays = new Set(normalizedWeekdays);
  const cursor = parseDate(startDate);
  const dates: string[] = [];

  for (let index = 0; index < dayCount; index += 1) {
    if (selectedWeekdays.has(cursor.getUTCDay() as YouthPersonalScheduleWeekday)) {
      dates.push(formatDate(cursor));
    }

    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

export function normalizeYouthPersonalScheduleWeekdays(
  values: readonly number[],
): YouthPersonalScheduleWeekday[] {
  const selected = new Set(
    values.filter(isYouthPersonalScheduleWeekday),
  );

  return weekdayDisplayOrder.filter((weekday) => selected.has(weekday));
}

export function parseYouthPersonalScheduleWeekdays(
  value: string | null | undefined,
) {
  return normalizeYouthPersonalScheduleWeekdays(
    (value ?? "")
      .split(",")
      .map((weekday) => weekday.trim())
      .filter(Boolean)
      .map(Number),
  );
}

export function isYouthPersonalScheduleMonth(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}$/.test(value) &&
    isYouthPersonalScheduleDate(`${value}-01`)
  );
}

export function getYouthPersonalScheduleMonthDates(month: string) {
  if (!isYouthPersonalScheduleMonth(month)) {
    return [];
  }

  const cursor = parseDate(`${month}-01`);
  const dates: string[] = [];

  while (formatDate(cursor).startsWith(`${month}-`)) {
    dates.push(formatDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

export function getYouthPersonalScheduleCalendarDates(month: string) {
  if (!isYouthPersonalScheduleMonth(month)) {
    return [];
  }

  const firstDate = parseDate(`${month}-01`);
  const gridStart = new Date(firstDate);
  gridStart.setUTCDate(firstDate.getUTCDate() - firstDate.getUTCDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setUTCDate(gridStart.getUTCDate() + index);

    return formatDate(date);
  });
}

export function getYouthPersonalScheduleDateIntersection(
  firstDates: readonly string[],
  secondDates: readonly string[],
) {
  const secondDateSet = new Set(secondDates);

  return [...new Set(firstDates)]
    .filter((date) => secondDateSet.has(date))
    .sort();
}

export function areYouthPersonalScheduleTimesOverlapping(
  firstStartMinute: number,
  firstEndMinute: number,
  secondStartMinute: number,
  secondEndMinute: number,
) {
  return (
    firstStartMinute < secondEndMinute && secondStartMinute < firstEndMinute
  );
}

function normalizeYouthPersonalScheduleDates(
  value: unknown,
):
  | { ok: true; value: string[] }
  | { ok: false; error: string } {
  if (!Array.isArray(value)) {
    return invalid("일정을 등록할 날짜를 선택하세요.");
  }

  const normalizedDates: string[] = [];

  for (const rawDate of value) {
    const date = normalizeDateValue(rawDate);

    if (!date) {
      return invalid("선택한 일정 날짜 형식이 올바르지 않습니다.");
    }

    normalizedDates.push(date);
  }

  const dates = [...new Set(normalizedDates)].sort();

  if (dates.length === 0) {
    return invalid("일정을 등록할 날짜를 하나 이상 선택하세요.");
  }

  if (dates.length > youthPersonalScheduleOccurrenceMaxCount) {
    return invalid(
      `일정 날짜는 최대 ${youthPersonalScheduleOccurrenceMaxCount}개까지 선택할 수 있습니다.`,
    );
  }

  return {
    ok: true,
    value: dates,
  };
}

function normalizeYouthPersonalScheduleWeekdayInput(
  value: unknown,
):
  | { ok: true; value: YouthPersonalScheduleWeekday[] }
  | { ok: false; error: string } {
  if (!Array.isArray(value)) {
    return invalid("반복할 요일을 선택하세요.");
  }

  if (
    !value.every(
      (weekday) =>
        typeof weekday === "number" &&
        Number.isInteger(weekday) &&
        isYouthPersonalScheduleWeekday(weekday),
    )
  ) {
    return invalid("반복할 요일을 다시 선택하세요.");
  }

  const weekdays = normalizeYouthPersonalScheduleWeekdays(value);

  if (weekdays.length === 0) {
    return invalid("반복할 요일을 하나 이상 선택하세요.");
  }

  return {
    ok: true,
    value: weekdays,
  };
}

function isYouthPersonalScheduleWeekday(
  value: number,
): value is YouthPersonalScheduleWeekday {
  return Number.isInteger(value) && value >= 0 && value <= 6;
}

function normalizeDateValue(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();

  return isYouthPersonalScheduleDate(normalized) ? normalized : null;
}

function getInclusiveDateCount(startDate: string, endDate: string) {
  return (
    Math.floor(
      (parseDate(endDate).getTime() - parseDate(startDate).getTime()) /
        millisecondsPerDay,
    ) + 1
  );
}

function parseDate(value: string) {
  const [yearText, monthText, dayText] = value.split("-");

  return new Date(
    Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText)),
  );
}

function formatDate(value: Date) {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function invalid(error: string): { ok: false; error: string } {
  return {
    ok: false,
    error,
  };
}
