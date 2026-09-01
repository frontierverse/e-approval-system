const koreanWeekdays = ["일", "월", "화", "수", "목", "금", "토"] as const;

const koreanDateTimePartsFormatter = new Intl.DateTimeFormat(
  "en-US-u-ca-gregory-nu-latn",
  {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Seoul",
    year: "numeric",
  },
);

export type KoreanDateTimeParts = {
  day: string;
  hour: number;
  minute: string;
  month: string;
  year: string;
};

export function getKoreanDateTimeParts(
  value: Date | string,
): KoreanDateTimeParts | null {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const values = Object.fromEntries(
    koreanDateTimePartsFormatter
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  const rawHour = Number(values.hour);

  if (
    !values.year ||
    !values.month ||
    !values.day ||
    !values.minute ||
    !Number.isInteger(rawHour)
  ) {
    return null;
  }

  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: rawHour === 24 ? 0 : rawHour,
    minute: values.minute,
  };
}

export function formatKoreanDateTime(value: Date | string): string | null {
  const parts = getKoreanDateTimeParts(value);

  if (!parts) {
    return null;
  }

  const period = parts.hour < 12 ? "오전" : "오후";
  const displayHour = parts.hour % 12 || 12;

  return `${parts.year}년 ${Number(parts.month)}월 ${Number(parts.day)}일 ${period} ${displayHour}:${parts.minute}`;
}

export function getKoreanWeekdayLabel(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return null;
  }

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return koreanWeekdays[date.getUTCDay()];
}
