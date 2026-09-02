import { getKoreanDateTimeParts, getKoreanWeekdayLabel } from "@/lib/korean-date";

export const workLogKeywordMaxLength = 100;
export const workLogContentMaxLength = 5000;
export const workLogContributionWeekCount = 53;

const dayInMs = 24 * 60 * 60 * 1000;

export type WorkLogEntry = {
  id: string;
  workDate: string;
  keyword: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

export type WorkLogFormValues = {
  workDate: string;
  keyword: string;
  content: string;
};

export type WorkLogFormFieldErrors = Partial<
  Record<keyof WorkLogFormValues, string>
>;

export type WorkLogFormState = {
  error?: string;
  fieldErrors?: WorkLogFormFieldErrors;
  success?: string;
  values?: WorkLogFormValues;
};

export type WorkLogContributionDay = {
  date: string;
  future: boolean;
  recorded: boolean;
  weekday: number;
};

export type WorkLogContributionWeek = {
  days: WorkLogContributionDay[];
  weekIndex: number;
};

export type WorkLogMonthLabel = {
  label: string;
  weekIndex: number;
};

export function normalizeWorkLogFormValues(
  formData: FormData,
): WorkLogFormValues {
  return {
    workDate: String(formData.get("workDate") ?? "").trim(),
    keyword: String(formData.get("keyword") ?? "").trim(),
    content: String(formData.get("content") ?? "").trim(),
  };
}

export function validateWorkLogFormValues(
  values: WorkLogFormValues,
  today = getWorkLogToday(),
): WorkLogFormFieldErrors {
  const errors: WorkLogFormFieldErrors = {};

  if (!isWorkLogDate(values.workDate)) {
    errors.workDate = "날짜를 다시 선택해 주세요.";
  } else if (values.workDate > today) {
    errors.workDate = "오늘 이후 날짜에는 업무일지를 작성할 수 없습니다.";
  }

  if (!values.keyword) {
    errors.keyword = "키워드를 입력해 주세요.";
  } else if (values.keyword.length > workLogKeywordMaxLength) {
    errors.keyword = `키워드는 ${workLogKeywordMaxLength}자 이하로 입력해 주세요.`;
  }

  if (!values.content) {
    errors.content = "업무 내용을 입력해 주세요.";
  } else if (values.content.length > workLogContentMaxLength) {
    errors.content = `업무 내용은 ${workLogContentMaxLength}자 이하로 입력해 주세요.`;
  }

  return errors;
}

export function hasWorkLogFormErrors(errors: WorkLogFormFieldErrors) {
  return Object.keys(errors).length > 0;
}

export function isWorkLogDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    Number.isInteger(year) &&
    Number.isInteger(month) &&
    Number.isInteger(day) &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function parseWorkLogDateValue(value: string) {
  if (!isWorkLogDate(value)) {
    throw new Error(`Invalid work log date: ${value}`);
  }

  const [year, month, day] = value.split("-").map(Number);

  return new Date(Date.UTC(year, month - 1, day));
}

export function formatWorkLogDateValue(value: Date | string) {
  if (typeof value === "string") {
    if (isWorkLogDate(value)) {
      return value;
    }

    return formatWorkLogDateValue(new Date(value));
  }

  if (Number.isNaN(value.getTime())) {
    throw new Error("Invalid work log date value.");
  }

  return [
    value.getUTCFullYear(),
    String(value.getUTCMonth() + 1).padStart(2, "0"),
    String(value.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

export function getWorkLogToday(value = new Date()) {
  const parts = getKoreanDateTimeParts(value);

  if (!parts) {
    throw new Error("오늘 날짜를 확인할 수 없습니다.");
  }

  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function getWorkLogContributionRange(today: string) {
  const todayDate = parseWorkLogDateValue(today);
  const startDate = new Date(
    todayDate.getTime() -
      (todayDate.getUTCDay() + (workLogContributionWeekCount - 1) * 7) *
        dayInMs,
  );
  const endDate = new Date(
    startDate.getTime() +
      (workLogContributionWeekCount * 7 - 1) * dayInMs,
  );

  return {
    endDate: formatWorkLogDateValue(endDate),
    startDate: formatWorkLogDateValue(startDate),
  };
}

export function buildWorkLogContributionWeeks({
  recordedDates,
  today,
}: {
  recordedDates: string[];
  today: string;
}): WorkLogContributionWeek[] {
  const { startDate } = getWorkLogContributionRange(today);
  const start = parseWorkLogDateValue(startDate);
  const recordedDateSet = new Set(
    recordedDates.filter(
      (date) => isWorkLogDate(date) && date >= startDate && date <= today,
    ),
  );

  return Array.from(
    { length: workLogContributionWeekCount },
    (_, weekIndex) => ({
      weekIndex,
      days: Array.from({ length: 7 }, (_, weekday) => {
        const date = formatWorkLogDateValue(
          new Date(start.getTime() + (weekIndex * 7 + weekday) * dayInMs),
        );

        return {
          date,
          future: date > today,
          recorded: recordedDateSet.has(date),
          weekday,
        };
      }),
    }),
  );
}

export function getWorkLogMonthLabels(
  weeks: WorkLogContributionWeek[],
): WorkLogMonthLabel[] {
  const labels: WorkLogMonthLabel[] = [];
  const seenMonths = new Set<string>();

  for (const week of weeks) {
    const firstDayOfMonth = week.days.find(
      (day) => !day.future && day.date.endsWith("-01"),
    );
    const labelDay = firstDayOfMonth ??
      (week.weekIndex === 0 ? week.days[0] : undefined);

    if (labelDay) {
      const month = labelDay.date.slice(0, 7);

      if (seenMonths.has(month)) {
        continue;
      }

      labels.push({
        label: `${Number(month.slice(5, 7))}월`,
        weekIndex: week.weekIndex,
      });
      seenMonths.add(month);
    }
  }

  return labels;
}

export function formatWorkLogDateLabel(value: string) {
  if (!isWorkLogDate(value)) {
    return value;
  }

  const [year, month, day] = value.split("-").map(Number);
  const weekday = getKoreanWeekdayLabel(value);

  return `${year}년 ${month}월 ${day}일${weekday ? ` (${weekday})` : ""}`;
}
