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
      eventDate: startDate,
      leaveType: "annual",
      reason:
        startDate === endDate
          ? `연차 ${startDate}`
          : `연차 ${startDate}~${endDate}`,
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
      eventDate: halfDayDate,
      leaveType: "half_day",
      reason: `${periodLabel} 반차 ${halfDayDate}`,
    };
  }

  return null;
}

export function getLegacyVacationLeaveDeductionFromContent(
  content: string,
): StaffLeaveVacationDeduction | null {
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
      eventDate: dates[0],
      leaveType: "half_day",
      reason: `${periodLabel} 반차 ${dates[0]}`,
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
    eventDate: startDate,
    leaveType: "annual",
    reason:
      startDate === endDate
        ? `연차 ${startDate}`
        : `연차 ${startDate}~${endDate}`,
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
