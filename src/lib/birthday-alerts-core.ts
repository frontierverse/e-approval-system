export type BirthdayAlertPersonKind = "staff" | "youth";

export type BirthdayAlertPerson = {
  birthDate: string | null;
  detailLabel: string;
  id: string;
  kind: BirthdayAlertPersonKind;
  name: string;
};

export type BirthdayAlertItem = {
  birthdayDate: string;
  birthDate: string;
  daysUntil: number;
  ddayLabel: string;
  detailLabel: string;
  id: string;
  kind: BirthdayAlertPersonKind;
  name: string;
  typeLabel: string;
};

export type BirthdayTopbarAlert = {
  ddayLabel: string;
  items: BirthdayAlertItem[];
  personName: string;
};

const birthdayAlertWindowDays = 31;
const dayInMs = 24 * 60 * 60 * 1000;

export function createBirthdayTopbarAlert(
  people: BirthdayAlertPerson[],
  referenceDate: string,
): BirthdayTopbarAlert | null {
  const items = createBirthdayAlertItems(people, referenceDate);
  const firstItem = items[0];

  if (!firstItem) {
    return null;
  }

  return {
    ddayLabel: firstItem.ddayLabel,
    items,
    personName: firstItem.name,
  };
}

export function createBirthdayAlertItems(
  people: BirthdayAlertPerson[],
  referenceDate: string,
) {
  return people
    .flatMap((person): BirthdayAlertItem[] => {
      const upcomingBirthday = getUpcomingBirthday(
        person.birthDate,
        referenceDate,
      );

      if (
        !upcomingBirthday ||
        upcomingBirthday.daysUntil > birthdayAlertWindowDays
      ) {
        return [];
      }

      return [
        {
          ...upcomingBirthday,
          birthDate: person.birthDate ?? "",
          detailLabel: person.detailLabel,
          id: person.id,
          kind: person.kind,
          name: person.name,
          typeLabel: getBirthdayAlertTypeLabel(person.kind),
        },
      ];
    })
    .sort(compareBirthdayAlertItems);
}

export function getUpcomingBirthday(
  birthDate: string | null | undefined,
  referenceDate: string,
) {
  const birth = getDateParts(birthDate);
  const reference = getDateParts(referenceDate);

  if (!birth || !reference) {
    return null;
  }

  const referenceDay = createUtcDate(reference.year, reference.month, reference.day);
  let birthday = createUtcDate(reference.year, birth.month, birth.day);

  if (birthday.getTime() < referenceDay.getTime()) {
    birthday = createUtcDate(reference.year + 1, birth.month, birth.day);
  }

  const daysUntil = Math.round(
    (birthday.getTime() - referenceDay.getTime()) / dayInMs,
  );

  return {
    birthdayDate: formatDateValue(birthday),
    daysUntil,
    ddayLabel: formatBirthdayDday(daysUntil),
  };
}

export function formatBirthdayAlertDate(value: string) {
  return value.replaceAll("-", ".");
}

function compareBirthdayAlertItems(
  first: BirthdayAlertItem,
  second: BirthdayAlertItem,
) {
  return (
    first.daysUntil - second.daysUntil ||
    first.typeLabel.localeCompare(second.typeLabel, "ko-KR") ||
    first.name.localeCompare(second.name, "ko-KR")
  );
}

function getBirthdayAlertTypeLabel(kind: BirthdayAlertPersonKind) {
  return kind === "staff" ? "직원" : "입소중";
}

function formatBirthdayDday(daysUntil: number) {
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

  return {
    day,
    month,
    year,
  };
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
