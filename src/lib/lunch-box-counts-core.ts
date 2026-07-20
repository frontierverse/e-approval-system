import { getKoreanDateValue } from "@/lib/document-archive-policy";

export const lunchBoxSchoolTypes = [
  { value: "elementary", label: "초등학교" },
  { value: "kindergarten", label: "병설유치원" },
] as const;

export const lunchBoxCountFields = [
  "preservationCount",
  "deliveryDriverCount",
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
  preservationCount: "보존식",
  deliveryDriverCount: "배송기사",
  class1Count: "1반",
  class2Count: "2반",
  class3Count: "3반",
  class4Count: "4반",
  linkedCount: "연계형",
};

export const lunchBoxPreservationClasses = [1, 2, 3, 4] as const;
export const lunchBoxCountChangeLogPageSize = 10;

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
export type LunchBoxPreservationClass =
  (typeof lunchBoxPreservationClasses)[number];

export type LunchBoxSchool = {
  id: string;
  name: string;
  preservationClass: LunchBoxPreservationClass | null;
  type: LunchBoxSchoolType;
  order: number;
  active: boolean;
};

export type LunchBoxCountValues = Record<LunchBoxCountField, number>;

export type LunchBoxCountRow = LunchBoxCountValues & {
  schoolId: string;
  schoolName: string;
  preservationClass: LunchBoxPreservationClass | null;
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

export type LunchBoxCountFieldChange = {
  field: LunchBoxCountField;
  previous: number;
  next: number;
};

export type LunchBoxCountSchoolChange = {
  schoolId: string;
  schoolName: string;
  changes: LunchBoxCountFieldChange[];
};

export type LunchBoxCountChangeDetail = {
  date: string;
  schools: LunchBoxCountSchoolChange[];
};

export type LunchBoxCountChangeLog = LunchBoxCountChangeDetail & {
  id: string;
  message: string | null;
  createdAt: string;
  actor: {
    id: string;
    name: string;
    departmentName: string;
    positionName: string;
    profileImageStorageKey: string | null;
    profileImageUpdatedAt: string | null;
  };
};

export type LunchBoxCountChangeLogPage = {
  logs: LunchBoxCountChangeLog[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type LunchBoxSchoolFormValues = {
  name: string;
  preservationClass: string;
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

export function normalizeLunchBoxSchoolName(value: unknown) {
  const name = String(value ?? "").trim();

  if (name === "이리초" || name === "익산초") {
    return name;
  }

  return name.replace(/^(?:이리|익산)/, "").trim();
}

export function isLunchBoxPreservationClassValue(
  value: number,
): value is LunchBoxPreservationClass {
  return lunchBoxPreservationClasses.some((item) => item === value);
}

export function normalizeLunchBoxPreservationClass(
  value: unknown,
): LunchBoxPreservationClass | null {
  const parsed = Number(value);

  return isLunchBoxPreservationClassValue(parsed) ? parsed : null;
}

export function resolveLunchBoxPreservationClassForUpdate({
  previousClass,
  submitted,
  value,
}: {
  previousClass: number | null;
  submitted: boolean;
  value: unknown;
}) {
  return submitted
    ? normalizeLunchBoxPreservationClass(value)
    : normalizeLunchBoxPreservationClass(previousClass);
}

export function getLunchBoxPreservationClassLabel(value: number | null) {
  return value ? `${value}반` : "지정반 없음";
}

export function normalizeLunchBoxSchoolFormValues(
  formData: FormData,
): LunchBoxSchoolFormValues {
  return {
    name: normalizeLunchBoxSchoolName(formData.get("name")),
    preservationClass: String(formData.get("preservationClass") ?? ""),
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

export function parseLunchBoxCountChangeDetail(
  metadata: unknown,
  fallbackDate = "",
): LunchBoxCountChangeDetail {
  const metadataRecord = getLunchBoxMetadataRecord(metadata);
  const metadataDate = metadataRecord?.date;
  const date =
    typeof metadataDate === "string" && isLunchBoxDate(metadataDate)
      ? metadataDate
      : isLunchBoxDate(fallbackDate)
        ? fallbackDate
        : "";
  const schoolRecords = Array.isArray(metadataRecord?.schools)
    ? metadataRecord.schools
    : [];
  const schools = schoolRecords.flatMap((schoolValue) => {
    const schoolRecord = getLunchBoxMetadataRecord(schoolValue);
    const next = getLunchBoxMetadataRecord(schoolRecord?.next);

    if (!schoolRecord || !next) {
      return [];
    }

    const previous = getLunchBoxMetadataRecord(schoolRecord.previous);
    const changes = lunchBoxCountFields.flatMap((field) => {
      if (!Object.prototype.hasOwnProperty.call(next, field)) {
        return [];
      }

      const previousCount = previous
        ? normalizeLunchBoxCountValue(previous[field])
        : 0;
      const nextCount = normalizeLunchBoxCountValue(next[field]);

      return previousCount === nextCount
        ? []
        : [
            {
              field,
              previous: previousCount,
              next: nextCount,
            },
          ];
    });

    if (changes.length === 0) {
      return [];
    }

    return [
      {
        schoolId:
          typeof schoolRecord.schoolId === "string"
            ? schoolRecord.schoolId
            : "",
        schoolName:
          typeof schoolRecord.schoolName === "string" &&
          schoolRecord.schoolName.trim()
            ? schoolRecord.schoolName.trim()
            : "학교명 미상",
        changes,
      },
    ];
  });

  return { date, schools };
}

export function normalizeLunchBoxPreservationCountForSave(
  values: { preservationCount?: unknown },
  previousCount: number,
) {
  return Object.prototype.hasOwnProperty.call(values, "preservationCount")
    ? normalizeLunchBoxCountValue(values.preservationCount)
    : normalizeLunchBoxCountValue(previousCount);
}

export function normalizeLunchBoxDeliveryDriverCountForSave(
  values: { deliveryDriverCount?: unknown },
  previousCount: number,
) {
  return Object.prototype.hasOwnProperty.call(values, "deliveryDriverCount")
    ? normalizeLunchBoxCountValue(values.deliveryDriverCount)
    : normalizeLunchBoxCountValue(previousCount);
}

export function getLunchBoxCountTotal(values: LunchBoxCountValues): number {
  return lunchBoxCountFields.reduce((sum, field) => sum + values[field], 0);
}

export function hasLunchBoxCountChanges(
  previous: Partial<LunchBoxCountValues> | null | undefined,
  next: LunchBoxCountValues,
) {
  return lunchBoxCountFields.some(
    (field) => (previous?.[field] ?? 0) !== next[field],
  );
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

export function normalizeLunchBoxCountChangeLogPage(
  value: string | string[] | undefined,
) {
  const parsed = Number(Array.isArray(value) ? value[0] : value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
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

export function getLunchBoxCalendarRange(month: string) {
  const normalizedMonth = normalizeLunchBoxMonth(month);
  const firstDate = `${normalizedMonth}-01`;
  const firstWeekday = parseLunchBoxDateValue(firstDate).getUTCDay();
  const startDate = shiftLunchBoxDate(firstDate, -firstWeekday);

  return {
    endDate: shiftLunchBoxDate(startDate, 42),
    startDate,
  };
}

export function createLunchBoxCalendarDays(month: string) {
  const normalizedMonth = normalizeLunchBoxMonth(month);
  const { startDate } = getLunchBoxCalendarRange(normalizedMonth);
  const gridStart = parseLunchBoxDateValue(startDate);
  const today = getLunchBoxCountToday();

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

function getLunchBoxMetadataRecord(
  value: unknown,
): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
