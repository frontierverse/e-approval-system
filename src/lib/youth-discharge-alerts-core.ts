export type YouthDischargeAlertPerson = {
  dischargeDate: string | null;
  id: string;
  name: string;
};

export type YouthDischargeAlertItem = {
  daysUntil: number;
  ddayLabel: string;
  dischargeDate: string;
  id: string;
  name: string;
  rosterHref: string;
};

export type YouthDischargeTopbarAlert = {
  ddayLabel: string;
  items: YouthDischargeAlertItem[];
  youthName: string;
};

export const youthDischargeAlertWindowDays = 31;
const dayInMs = 24 * 60 * 60 * 1000;

export function createYouthDischargeTopbarAlert(
  youths: YouthDischargeAlertPerson[],
  referenceDate: string,
): YouthDischargeTopbarAlert | null {
  const items = createYouthDischargeAlertItems(youths, referenceDate);
  const firstItem = items[0];

  if (!firstItem) {
    return null;
  }

  return {
    ddayLabel: firstItem.ddayLabel,
    items,
    youthName: firstItem.name,
  };
}

export function createYouthDischargeAlertItems(
  youths: YouthDischargeAlertPerson[],
  referenceDate: string,
) {
  return youths
    .flatMap((youth): YouthDischargeAlertItem[] => {
      const upcomingDischarge = getUpcomingYouthDischarge(
        youth.dischargeDate,
        referenceDate,
      );

      if (
        !upcomingDischarge ||
        upcomingDischarge.daysUntil > youthDischargeAlertWindowDays
      ) {
        return [];
      }

      return [
        {
          ...upcomingDischarge,
          id: youth.id,
          name: youth.name,
          rosterHref: "/youth/roster",
        },
      ];
    })
    .sort(compareYouthDischargeAlertItems);
}

export function getUpcomingYouthDischarge(
  dischargeDate: string | null | undefined,
  referenceDate: string,
) {
  const discharge = getDateParts(dischargeDate);
  const reference = getDateParts(referenceDate);

  if (!discharge || !reference) {
    return null;
  }

  const dischargeDay = createUtcDate(
    discharge.year,
    discharge.month,
    discharge.day,
  );
  const referenceDay = createUtcDate(
    reference.year,
    reference.month,
    reference.day,
  );
  const daysUntil = Math.round(
    (dischargeDay.getTime() - referenceDay.getTime()) / dayInMs,
  );

  if (daysUntil < 0) {
    return null;
  }

  return {
    daysUntil,
    ddayLabel: formatDday(daysUntil),
    dischargeDate: formatDateValue(dischargeDay),
  };
}

export function formatYouthDischargeAlertDate(value: string) {
  return value.replaceAll("-", ".");
}

export function formatYouthDischargeAlertDateWithWeekday(value: string) {
  const parts = getDateParts(value);

  if (!parts) {
    return formatYouthDischargeAlertDate(value);
  }

  const weekday = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "UTC",
    weekday: "short",
  }).format(createUtcDate(parts.year, parts.month, parts.day));

  return `${formatYouthDischargeAlertDate(value)} (${weekday})`;
}

function compareYouthDischargeAlertItems(
  first: YouthDischargeAlertItem,
  second: YouthDischargeAlertItem,
) {
  return (
    first.daysUntil - second.daysUntil ||
    first.name.localeCompare(second.name, "ko-KR")
  );
}

function formatDday(daysUntil: number) {
  return daysUntil === 0 ? "D-Day" : `D-${daysUntil}`;
}

function getDateParts(value: string | null | undefined) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");

  if (!match) {
    return null;
  }

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = createUtcDate(year, month, day);

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return { day, month, year };
}

function createUtcDate(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDateValue(date: Date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}
