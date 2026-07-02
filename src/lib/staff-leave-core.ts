export const staffLeaveHalfDaysPerDay = 2;

export const staffLeaveEntryTypes = {
  annualAccrual: "annual_accrual",
  manualAdjustment: "manual_adjustment",
  monthlyAccrual: "monthly_accrual",
  vacationDeduction: "vacation_deduction",
} as const;

export type StaffLeaveAccrualEntry = {
  amountHalfDays: number;
  entryType: string;
  eventDate: string;
  reason: string;
  sourceKey: string;
};

export type StaffLeaveVacationDeduction = {
  amountHalfDays: number;
  eventDate: string;
  leaveType: "annual" | "half_day";
  reason: string;
};

export type StaffLeaveVacationType =
  | "annual"
  | "family_event"
  | "half_day"
  | "official"
  | "other"
  | "sick"
  | "substitute";

export type StaffLeaveVacationUsage = {
  amountHalfDays: number;
  endDate: string;
  eventDate: string;
  leaveType: StaffLeaveVacationType;
  reason: string;
  startDate: string;
  vacationLabel: string;
};

const vacationTypeLabels = {
  annual: "연차",
  family_event: "경조휴가",
  half_day: "반차",
  official: "공가",
  other: "기타 휴가",
  sick: "병가",
  substitute: "대체휴무",
} satisfies Record<StaffLeaveVacationType, string>;

export function getStaffLeaveAccrualEntries({
  existingSourceKeys = [],
  hireDate,
  today,
}: {
  existingSourceKeys?: readonly string[];
  hireDate: string;
  today: string;
}) {
  if (!isDateValue(hireDate) || !isDateValue(today) || today < hireDate) {
    return [];
  }

  const existingKeys = new Set(existingSourceKeys);
  const entries: StaffLeaveAccrualEntry[] = [];

  for (let month = 1; month <= 11; month += 1) {
    const eventDate = addMonths(hireDate, month);

    if (eventDate > today) {
      continue;
    }

    const sourceKey = `leave:monthly:${eventDate}`;

    if (existingKeys.has(sourceKey)) {
      continue;
    }

    entries.push({
      amountHalfDays: staffLeaveHalfDaysPerDay,
      entryType: staffLeaveEntryTypes.monthlyAccrual,
      eventDate,
      reason: "1개월 개근 연차 자동 부여",
      sourceKey,
    });
  }

  let yearsCompleted = 1;

  while (addYears(hireDate, yearsCompleted) <= today) {
    const eventDate = addYears(hireDate, yearsCompleted);
    const sourceKey = `leave:annual:${eventDate}`;

    if (!existingKeys.has(sourceKey)) {
      const grantDays = getAnnualLeaveGrantDays(yearsCompleted);

      entries.push({
        amountHalfDays: grantDays * staffLeaveHalfDaysPerDay,
        entryType: staffLeaveEntryTypes.annualAccrual,
        eventDate,
        reason: `${yearsCompleted}년차 연차 ${grantDays}일 자동 부여`,
        sourceKey,
      });
    }

    yearsCompleted += 1;
  }

  return entries;
}

export function getAnnualLeaveGrantDays(yearsCompleted: number) {
  if (!Number.isInteger(yearsCompleted) || yearsCompleted < 1) {
    return 0;
  }

  if (yearsCompleted < 3) {
    return 15;
  }

  return Math.min(25, 15 + Math.floor((yearsCompleted - 1) / 2));
}

export function getVacationLeaveDeduction(
  values: Record<string, string>,
): StaffLeaveVacationDeduction | null {
  const usage = getVacationLeaveUsage(values);

  if (
    !usage ||
    (usage.leaveType !== "annual" && usage.leaveType !== "half_day")
  ) {
    return null;
  }

  return {
    amountHalfDays: usage.amountHalfDays,
    eventDate: usage.eventDate,
    leaveType: usage.leaveType,
    reason: usage.reason,
  };
}

export function getVacationLeaveUsage(
  values: Record<string, string>,
): StaffLeaveVacationUsage | null {
  const vacationType = values.vacationType?.trim();

  if (vacationType === "annual") {
    const startDate = values.startDate?.trim() ?? "";
    const endDate = values.endDate?.trim() ?? "";

    if (!isDateValue(startDate) || !isDateValue(endDate) || startDate > endDate) {
      return null;
    }

    const days = countInclusiveDays(startDate, endDate);

    return {
      amountHalfDays: -days * staffLeaveHalfDaysPerDay,
      endDate,
      eventDate: startDate,
      leaveType: "annual",
      reason:
        startDate === endDate
          ? `연차 ${startDate}`
          : `연차 ${startDate}~${endDate}`,
      startDate,
      vacationLabel: vacationTypeLabels.annual,
    };
  }

  if (vacationType === "half_day" || vacationType === "half") {
    const halfDayDate = values.halfDayDate?.trim() ?? "";

    if (!isDateValue(halfDayDate)) {
      return null;
    }

    const periodLabel =
      values.halfDayPeriod?.trim() === "afternoon" ? "오후" : "오전";

    return {
      amountHalfDays: -1,
      endDate: halfDayDate,
      eventDate: halfDayDate,
      leaveType: "half_day",
      reason: `${periodLabel} 반차 ${halfDayDate}`,
      startDate: halfDayDate,
      vacationLabel: `${periodLabel} 반차`,
    };
  }

  if (isGeneralVacationType(vacationType)) {
    const startDate = values.startDate?.trim() ?? "";
    const endDate = values.endDate?.trim() ?? "";

    if (!isDateValue(startDate) || !isDateValue(endDate) || startDate > endDate) {
      return null;
    }

    const vacationLabel = vacationTypeLabels[vacationType];

    return {
      amountHalfDays: 0,
      endDate,
      eventDate: startDate,
      leaveType: vacationType,
      reason:
        startDate === endDate
          ? `${vacationLabel} ${startDate}`
          : `${vacationLabel} ${startDate}~${endDate}`,
      startDate,
      vacationLabel,
    };
  }

  return null;
}

export function getLegacyVacationLeaveDeductionFromContent(
  content: string,
): StaffLeaveVacationDeduction | null {
  const usage = getLegacyVacationLeaveUsageFromContent(content);

  if (
    !usage ||
    (usage.leaveType !== "annual" && usage.leaveType !== "half_day")
  ) {
    return null;
  }

  return {
    amountHalfDays: usage.amountHalfDays,
    eventDate: usage.eventDate,
    leaveType: usage.leaveType,
    reason: usage.reason,
  };
}

export function getLegacyVacationLeaveUsageFromContent(
  content: string,
): StaffLeaveVacationUsage | null {
  const normalizedContent = normalizeLegacyVacationContent(content);
  const dates = extractLegacyVacationDates(normalizedContent);

  if (dates.length === 0) {
    return null;
  }

  if (normalizedContent.includes("반차")) {
    const period = getLegacyHalfDayPeriod(normalizedContent);

    if (!period) {
      return null;
    }

    const periodLabel = period === "afternoon" ? "오후" : "오전";

    return {
      amountHalfDays: -1,
      endDate: dates[0],
      eventDate: dates[0],
      leaveType: "half_day",
      reason: `${periodLabel} 반차 ${dates[0]}`,
      startDate: dates[0],
      vacationLabel: `${periodLabel} 반차`,
    };
  }

  if (!normalizedContent.includes("연차")) {
    return null;
  }

  const startDate = dates[0];
  const endDate = dates[1] ?? startDate;

  if (startDate > endDate) {
    return null;
  }

  const days = countInclusiveDays(startDate, endDate);

  return {
    amountHalfDays: -days * staffLeaveHalfDaysPerDay,
    endDate,
    eventDate: startDate,
    leaveType: "annual",
    reason:
      startDate === endDate
        ? `연차 ${startDate}`
        : `연차 ${startDate}~${endDate}`,
    startDate,
    vacationLabel: vacationTypeLabels.annual,
  };
}

export function formatStaffLeaveDays(amountHalfDays: number) {
  const days = amountHalfDays / staffLeaveHalfDaysPerDay;

  return Number.isInteger(days) ? String(days) : days.toFixed(1);
}

export function isDateValue(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = parseDateValue(value);

  return formatDateValue(date) === value;
}

export function getInclusiveStaffLeaveDates(startDate: string, endDate: string) {
  if (!isDateValue(startDate) || !isDateValue(endDate) || startDate > endDate) {
    return [];
  }

  const dates: string[] = [];
  let current = parseDateValue(startDate);
  const end = parseDateValue(endDate);

  while (current.getTime() <= end.getTime()) {
    dates.push(formatDateValue(current));
    current = addDays(current, 1);
  }

  return dates;
}

export function getStaffLeaveDateDiffInDays(from: string, to: string) {
  return Math.round(
    (parseDateValue(to).getTime() - parseDateValue(from).getTime()) /
      (24 * 60 * 60 * 1000),
  );
}

export function shiftStaffLeaveDate(value: string, days: number) {
  return formatDateValue(addDays(parseDateValue(value), days));
}

export function formatStaffVacationDday(daysUntil: number) {
  if (daysUntil === 0) {
    return "D-Day";
  }

  return daysUntil > 0 ? `D-${daysUntil}` : `D+${Math.abs(daysUntil)}`;
}

export function getStaffVacationTypeLabel(type: StaffLeaveVacationType) {
  return vacationTypeLabels[type];
}

function isGeneralVacationType(
  value: string | undefined,
): value is Exclude<StaffLeaveVacationType, "annual" | "half_day"> {
  return (
    value === "family_event" ||
    value === "official" ||
    value === "other" ||
    value === "sick" ||
    value === "substitute"
  );
}

function countInclusiveDays(startDate: string, endDate: string) {
  let current = parseDateValue(startDate);
  const end = parseDateValue(endDate);
  let days = 0;

  while (current.getTime() <= end.getTime()) {
    days += 1;
    current = addDays(current, 1);
  }

  return days;
}

function normalizeLegacyVacationContent(content: string) {
  return content.replace(/\s+/g, " ").trim();
}

function extractLegacyVacationDates(content: string) {
  const dates: string[] = [];
  const seenDates = new Set<string>();
  const patterns = [
    /(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/g,
    /(\d{4})[-./](\d{1,2})[-./](\d{1,2})/g,
  ];

  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      const date = toDateValue(match[1], match[2], match[3]);

      if (!isDateValue(date) || seenDates.has(date)) {
        continue;
      }

      dates.push(date);
      seenDates.add(date);
    }
  }

  return dates;
}

function getLegacyHalfDayPeriod(content: string) {
  const hasMorning = content.includes("오전");
  const hasAfternoon = content.includes("오후");

  if (hasMorning === hasAfternoon) {
    return null;
  }

  return hasAfternoon ? "afternoon" : "morning";
}

function addYears(value: string, years: number) {
  const [year, month, day] = getDateParts(value);
  const targetYear = year + years;
  const targetDay = Math.min(day, getDaysInMonth(targetYear, month));

  return formatDateValue(new Date(Date.UTC(targetYear, month - 1, targetDay)));
}

function addMonths(value: string, months: number) {
  const [year, month, day] = getDateParts(value);
  const zeroBasedMonth = month - 1 + months;
  const targetYear = year + Math.floor(zeroBasedMonth / 12);
  const targetMonth = ((zeroBasedMonth % 12) + 12) % 12;
  const targetDay = Math.min(day, getDaysInMonth(targetYear, targetMonth + 1));

  return formatDateValue(new Date(Date.UTC(targetYear, targetMonth, targetDay)));
}

function addDays(value: Date, days: number) {
  const date = new Date(value);
  date.setUTCDate(date.getUTCDate() + days);

  return date;
}

function parseDateValue(value: string) {
  const [year, month, day] = getDateParts(value);

  return new Date(Date.UTC(year, month - 1, day));
}

function getDateParts(value: string): [number, number, number] {
  const [year, month, day] = value.split("-").map(Number);

  return [year, month, day];
}

function getDaysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function toDateValue(year: string, month: string, day: string) {
  return [
    year.padStart(4, "0"),
    month.padStart(2, "0"),
    day.padStart(2, "0"),
  ].join("-");
}

function formatDateValue(value: Date) {
  return [
    value.getUTCFullYear(),
    String(value.getUTCMonth() + 1).padStart(2, "0"),
    String(value.getUTCDate()).padStart(2, "0"),
  ].join("-");
}
