export const youthNoteCategories = [
  "보호관찰",
  "학원",
  "외박",
  "이탈",
  "가족",
] as const;

export const youthNotePriorities = ["보통", "긴급"] as const;

export type YouthNoteCategory = (typeof youthNoteCategories)[number];
export type YouthNotePriority = (typeof youthNotePriorities)[number];

export const youthRuleCategories = [
  "생활",
  "학습",
  "외출/외박",
  "안전",
  "상담",
  "기타",
] as const;

export const youthRuleDetailMaxLength = 2000;

export type YouthRuleCategory = (typeof youthRuleCategories)[number];
export type YouthRuleCategoryFilter = YouthRuleCategory | "all";
export type YouthRuleTargetFilter = "all" | "common" | (string & {});

export type YouthRule = {
  id: string;
  category: YouthRuleCategory;
  detail: string;
  targetYouthId: string | null;
  targetYouthName: string | null;
  createdAt: string;
};

export type YouthRuleTarget = {
  id: string;
  name: string;
};

export type YouthRuleChangeLog = {
  id: string;
  message: string | null;
  metadata: unknown;
  createdAt: string;
  actor: {
    id: string;
    name: string;
    email: string | null;
    profileImageStorageKey: string | null;
    profileImageUpdatedAt: string | null;
  };
};

export type YouthRuleChangeLogFilters = {
  actorId: string;
  category: YouthRuleCategoryFilter;
  page: number;
  pageSize: number;
  target: YouthRuleTargetFilter;
  total: number;
  totalPages: number;
};

export type YouthRuleChangeLogActor = {
  id: string;
  name: string;
  email: string | null;
};

export type YouthSpecialNote = {
  id: string;
  title: string;
  summary: string;
  detail: string;
  category: YouthNoteCategory;
  recordedAt: string;
  author: string;
  priority: YouthNotePriority;
};

export type YouthFamilyContact = {
  id: string;
  relationship: string | null;
  phone: string | null;
};

export const youthDecisionDocumentFormFieldName = "decisionDocuments";
export const youthDischargeExtensionReasonMaxLength = 500;

export type YouthDecisionDocumentItem = {
  id: string;
  originalName: string;
  size: number;
  createdAt: string;
};

export type YouthDischargeExtension = {
  id: string;
  extensionOrder: number;
  previousDischargeDate: string;
  extendedDischargeDate: string;
  reason: string;
  processedAt: string;
  processedBy: {
    id: string;
    name: string;
  };
};

export type YouthProfile = {
  id: string;
  name: string;
  admissionDate: string | null;
  birthDate: string | null;
  initialDischargeDate?: string | null;
  dischargeDate: string | null;
  age: number | null;
  phone: string | null;
  familyContacts: YouthFamilyContact[];
  decisionDocuments: YouthDecisionDocumentItem[];
  dischargeExtensions?: YouthDischargeExtension[];
  notes: YouthSpecialNote[];
};

export const youthLearningScheduleWeekdays = [
  { value: 1, label: "월" },
  { value: 2, label: "화" },
  { value: 3, label: "수" },
  { value: 4, label: "목" },
  { value: 5, label: "금" },
  { value: 6, label: "토" },
  { value: 0, label: "일" },
] as const;

export type YouthLearningScheduleWeekday =
  (typeof youthLearningScheduleWeekdays)[number]["value"];

export type YouthLearningSchedule = {
  id: string;
  youthId: string;
  scheduleDate: string;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  content: string;
  repeatsWeekly: boolean;
  recurrenceSourceDate: string | null;
  recurrenceWeekdays: YouthLearningScheduleWeekday[];
};

export const youthCommonScheduleWeekdays = [
  { value: 1, label: "월요일", shortLabel: "월" },
  { value: 2, label: "화요일", shortLabel: "화" },
  { value: 3, label: "수요일", shortLabel: "수" },
  { value: 4, label: "목요일", shortLabel: "목" },
  { value: 5, label: "금요일", shortLabel: "금" },
] as const satisfies ReadonlyArray<{
  value: YouthLearningScheduleWeekday;
  label: string;
  shortLabel: string;
}>;

export type YouthCommonSchedule = {
  id: string;
  weekday: YouthLearningScheduleWeekday;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  content: string;
};

export type YouthCommonScheduleWeekdayFilter =
  | "all"
  | YouthLearningScheduleWeekday;

export type YouthCommonScheduleChangeLog = {
  id: string;
  message: string | null;
  createdAt: string;
  metadata: unknown;
  actor: {
    id: string;
    name: string;
    email: string | null;
    profileImageStorageKey: string | null;
    profileImageUpdatedAt: string | null;
  };
};

export type YouthCommonScheduleChangeLogActor = {
  id: string;
  name: string;
  email: string | null;
};

export type YouthCommonScheduleChangeLogFilters = {
  actorId: string;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  weekday: YouthCommonScheduleWeekdayFilter;
};

export type YouthLearningProgressChangeLog = {
  id: string;
  message: string | null;
  createdAt: string;
  metadata: unknown;
  actor: {
    id: string;
    name: string;
    email: string | null;
    profileImageStorageKey: string | null;
    profileImageUpdatedAt: string | null;
  };
};

export type YouthLearningProgressChangeLogActor = {
  id: string;
  name: string;
  email: string | null;
};

export type YouthLearningProgressChangeLogFilters = {
  actorId: string;
  page: number;
  pageSize: number;
  scheduleDate: string;
  total: number;
  totalPages: number;
};

export const hiddenYouthLearningProgressChangeLogActorNames = ["신승식"] as const;

export function shouldShowYouthLearningProgressChangeLogActor(name: string) {
  return !hiddenYouthLearningProgressChangeLogActorNames.some(
    (hiddenName) => hiddenName === name.trim(),
  );
}

export type YouthFamilyContactInput = {
  relationship: string;
  phone: string;
};

export type YouthCreateInput = {
  name: string;
  admissionDate: string;
  birthDate: string;
  dischargeDate: string;
  phone: string;
  familyContacts: YouthFamilyContactInput[];
};

export type YouthUpdateInput = YouthCreateInput;

export type YouthDischargeExtensionInput = {
  extendedDischargeDate: string;
  reason: string;
};

export type YouthNoteInput = Omit<YouthSpecialNote, "id">;

export type YouthActionResult<T> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      error: string;
    };

export function isYouthNoteCategory(value: string): value is YouthNoteCategory {
  return youthNoteCategories.some((category) => category === value);
}

export function isYouthNotePriority(value: string): value is YouthNotePriority {
  return youthNotePriorities.some((priority) => priority === value);
}

export function isYouthRuleCategory(value: string): value is YouthRuleCategory {
  return youthRuleCategories.some((category) => category === value);
}

export function normalizeYouthNoteCategory(value: string): YouthNoteCategory {
  return isYouthNoteCategory(value) ? value : "보호관찰";
}

export function normalizeYouthRuleCategory(value: string): YouthRuleCategory {
  return isYouthRuleCategory(value) ? value : "기타";
}

export const youthLearningScheduleStartHour = 9;
export const youthLearningScheduleEndHour = 18;
export const youthLearningScheduleMinuteStep = 10;

export function isYouthLearningScheduleStartHour(value: number) {
  return (
    Number.isInteger(value) &&
    value >= youthLearningScheduleStartHour &&
    value < youthLearningScheduleEndHour
  );
}

export function isYouthLearningScheduleEndHour(
  value: number,
  startHour: number,
) {
  return (
    Number.isInteger(value) &&
    value > startHour &&
    value <= youthLearningScheduleEndHour
  );
}

export function isYouthLearningScheduleEndMinute(
  value: number,
  startMinute: number,
) {
  return (
    Number.isInteger(value) &&
    value > startMinute &&
    value <= getYouthLearningScheduleEndMinute() &&
    value % youthLearningScheduleMinuteStep === 0
  );
}

export function isYouthLearningScheduleStartMinute(value: number) {
  return (
    Number.isInteger(value) &&
    value >= getYouthLearningScheduleStartMinute(youthLearningScheduleStartHour) &&
    value < getYouthLearningScheduleEndMinute() &&
    value % youthLearningScheduleMinuteStep === 0
  );
}

export function getYouthLearningScheduleStartMinute(startHour: number) {
  return startHour * 60;
}

export function getYouthLearningScheduleEndMinute() {
  return youthLearningScheduleEndHour * 60;
}

export function getYouthLearningScheduleEndHourFromMinute(endMinute: number) {
  return Math.ceil(endMinute / 60);
}

export function getYouthLearningScheduleStartHourFromMinute(startMinute: number) {
  return Math.floor(startMinute / 60);
}

export function isYouthLearningScheduleDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
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

export function getYouthLearningScheduleToday() {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Seoul",
    year: "numeric",
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return year && month && day
    ? `${year}-${month}-${day}`
    : formatYouthLearningScheduleDate(new Date());
}

export function getYouthDisplayAge(
  youth: {
    age: number | null;
    birthDate: string | null;
  },
  referenceDate = getYouthLearningScheduleToday(),
) {
  return calculateYouthAge(youth.birthDate, referenceDate) ?? youth.age;
}

export function formatYouthAgeLabel(
  youth: {
    age: number | null;
    birthDate: string | null;
  },
  referenceDate = getYouthLearningScheduleToday(),
) {
  const legalAge = getYouthDisplayAge(youth, referenceDate);

  if (legalAge === null) {
    return null;
  }

  const koreanAge = calculateYouthKoreanAge(youth.birthDate, referenceDate);
  const legalAgeLabel = `만 ${legalAge}세`;

  return koreanAge === null ? legalAgeLabel : `${legalAgeLabel}(${koreanAge}세)`;
}

export function formatYouthSchoolGradeLabel(
  youth: {
    age: number | null;
    birthDate: string | null;
  },
  referenceDate = getYouthLearningScheduleToday(),
) {
  const koreanAge =
    calculateYouthKoreanAge(youth.birthDate, referenceDate) ??
    getFallbackKoreanAge(youth, referenceDate);

  if (koreanAge === null) {
    return null;
  }

  if (koreanAge >= 8 && koreanAge <= 13) {
    return `초${koreanAge - 7}`;
  }

  if (koreanAge >= 14 && koreanAge <= 16) {
    return `중${koreanAge - 13}`;
  }

  if (koreanAge >= 17 && koreanAge <= 19) {
    return `고${koreanAge - 16}`;
  }

  return "해당 없음";
}

function getFallbackKoreanAge(
  youth: {
    age: number | null;
    birthDate: string | null;
  },
  referenceDate: string,
) {
  const legalAge = getYouthDisplayAge(youth, referenceDate);

  return legalAge === null ? null : legalAge + 1;
}

export function calculateYouthAge(
  birthDate: string | null | undefined,
  referenceDate = getYouthLearningScheduleToday(),
) {
  if (!birthDate || !isYouthLearningScheduleDate(birthDate)) {
    return null;
  }

  if (!isYouthLearningScheduleDate(referenceDate)) {
    return null;
  }

  const birth = getIsoDateParts(birthDate);
  const reference = getIsoDateParts(referenceDate);

  if (!birth || !reference) {
    return null;
  }

  let age = reference.year - birth.year;

  if (
    reference.month < birth.month ||
    (reference.month === birth.month && reference.day < birth.day)
  ) {
    age -= 1;
  }

  return age >= 0 ? age : null;
}

export function calculateYouthKoreanAge(
  birthDate: string | null | undefined,
  referenceDate = getYouthLearningScheduleToday(),
) {
  if (!birthDate || !isYouthLearningScheduleDate(birthDate)) {
    return null;
  }

  if (!isYouthLearningScheduleDate(referenceDate)) {
    return null;
  }

  const birth = getIsoDateParts(birthDate);
  const reference = getIsoDateParts(referenceDate);

  if (!birth || !reference) {
    return null;
  }

  const age = reference.year - birth.year + 1;

  return age >= 1 ? age : null;
}

function getIsoDateParts(value: string) {
  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  if (!year || !month || !day) {
    return null;
  }

  return {
    day,
    month,
    year,
  };
}

export function shiftYouthLearningScheduleDate(value: string, days: number) {
  const date = parseYouthLearningScheduleDate(value);
  date.setUTCDate(date.getUTCDate() + days);

  return formatYouthLearningScheduleDate(date);
}

export function getYouthLearningScheduleWeekday(
  value: string,
): YouthLearningScheduleWeekday {
  const weekday = parseYouthLearningScheduleDate(value).getUTCDay();

  return isYouthLearningScheduleWeekday(weekday) ? weekday : 0;
}

export function isYouthLearningScheduleWeekday(
  value: number,
): value is YouthLearningScheduleWeekday {
  return youthLearningScheduleWeekdays.some(
    (weekday) => weekday.value === value,
  );
}

export function normalizeYouthLearningScheduleWeekdays(
  values: readonly number[],
): YouthLearningScheduleWeekday[] {
  const selectedWeekdays = new Set(
    values.filter(isYouthLearningScheduleWeekday),
  );

  return youthLearningScheduleWeekdays
    .map((weekday) => weekday.value)
    .filter((weekday) => selectedWeekdays.has(weekday));
}

export function isYouthCommonScheduleWeekday(
  value: number,
): value is YouthLearningScheduleWeekday {
  return youthCommonScheduleWeekdays.some((weekday) => weekday.value === value);
}

export function normalizeYouthCommonScheduleWeekdays(
  values: readonly number[],
): YouthLearningScheduleWeekday[] {
  const selectedWeekdays = new Set(values.filter(isYouthCommonScheduleWeekday));

  return youthCommonScheduleWeekdays
    .map((weekday) => weekday.value)
    .filter((weekday) => selectedWeekdays.has(weekday));
}

export function serializeYouthLearningScheduleWeekdays(
  values: readonly number[],
) {
  const weekdays = normalizeYouthLearningScheduleWeekdays(values);

  return weekdays.length > 0 ? weekdays.join(",") : null;
}

export function parseYouthLearningScheduleWeekdays(
  value: string | null | undefined,
  fallbackWeekday?: YouthLearningScheduleWeekday,
) {
  const weekdays = normalizeYouthLearningScheduleWeekdays(
    (value ?? "")
      .split(",")
      .map((item) => Number(item.trim())),
  );

  if (weekdays.length > 0 || fallbackWeekday === undefined) {
    return weekdays;
  }

  return [fallbackWeekday];
}

export function formatYouthLearningScheduleWeekdays(
  values: readonly number[],
) {
  const selectedWeekdays = new Set(normalizeYouthLearningScheduleWeekdays(values));

  return youthLearningScheduleWeekdays
    .filter((weekday) => selectedWeekdays.has(weekday.value))
    .map((weekday) => weekday.label)
    .join("·");
}

function parseYouthLearningScheduleDate(value: string) {
  const [yearText, monthText, dayText] = value.split("-");

  return new Date(
    Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText)),
  );
}

function formatYouthLearningScheduleDate(value: Date) {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function normalizeYouthNotePriority(value: string): YouthNotePriority {
  return isYouthNotePriority(value) ? value : "보통";
}
