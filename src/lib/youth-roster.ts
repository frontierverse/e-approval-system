import "server-only";

import { prisma } from "@/lib/prisma";
import {
  getYouthDisplayAge,
  getYouthLearningScheduleToday,
} from "@/lib/youth-management-core";

export type YouthRosterData = {
  admittedYouths: YouthRosterItem[];
  dischargedYouths: YouthRosterItem[];
  referenceDate: string;
};

export type YouthRosterItem = {
  id: string;
  admissionDate: string | null;
  birthDate: string | null;
  age: number | null;
  dischargeDate: string | null;
  familyContacts: YouthRosterFamilyContact[];
  name: string;
  phone: string | null;
};

export type YouthRosterFamilyContact = {
  id: string;
  relationship: string | null;
  phone: string | null;
};

type YouthRosterRecord = Awaited<ReturnType<typeof getYouthRosterRows>>[number];

export async function getYouthRoster(): Promise<YouthRosterData> {
  const referenceDate = getYouthLearningScheduleToday();
  const youths = (await getYouthRosterRows()).map((youth) =>
    mapYouthRosterItem(youth, referenceDate),
  );

  return {
    admittedYouths: youths
      .filter((youth) => isAdmittedYouth(youth, referenceDate))
      .sort(compareAdmittedYouth),
    dischargedYouths: youths
      .filter((youth) => isDischargedYouth(youth, referenceDate))
      .sort(compareDischargedYouth),
    referenceDate,
  };
}

async function getYouthRosterRows() {
  return prisma.youth.findMany({
    select: {
      id: true,
      admissionDate: true,
      age: true,
      birthDate: true,
      dischargeDate: true,
      familyContact: true,
      familyContacts: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          phone: true,
          relationship: true,
        },
      },
      familyPhone: true,
      familyRelationship: true,
      name: true,
      phone: true,
    },
  });
}

function mapYouthRosterItem(
  record: YouthRosterRecord,
  referenceDate: string,
): YouthRosterItem {
  return {
    id: record.id,
    admissionDate: normalizeBlank(record.admissionDate),
    birthDate: normalizeBlank(record.birthDate),
    age: getYouthDisplayAge(
      {
        age: record.age,
        birthDate: normalizeBlank(record.birthDate),
      },
      referenceDate,
    ),
    dischargeDate: normalizeBlank(record.dischargeDate),
    familyContacts: getFamilyContacts(record),
    name: record.name,
    phone: normalizeBlank(record.phone),
  };
}

function getFamilyContacts(
  record: Pick<
    YouthRosterRecord,
    "familyContact" | "familyContacts" | "familyPhone" | "familyRelationship" | "id"
  >,
) {
  if (record.familyContacts.length > 0) {
    return record.familyContacts.map((contact) => ({
      id: contact.id,
      phone: normalizeBlank(contact.phone),
      relationship: normalizeBlank(contact.relationship),
    }));
  }

  const legacyPhone = normalizeBlank(record.familyPhone) ?? normalizeBlank(record.familyContact);
  const legacyRelationship = normalizeBlank(record.familyRelationship);

  if (!legacyPhone && !legacyRelationship) {
    return [];
  }

  return [
    {
      id: `legacy-family-${record.id}`,
      phone: legacyPhone,
      relationship: legacyRelationship,
    },
  ];
}

function isAdmittedYouth(youth: YouthRosterItem, referenceDate: string) {
  return !youth.dischargeDate || youth.dischargeDate >= referenceDate;
}

function isDischargedYouth(youth: YouthRosterItem, referenceDate: string) {
  return Boolean(youth.dischargeDate && youth.dischargeDate < referenceDate);
}

function compareAdmittedYouth(first: YouthRosterItem, second: YouthRosterItem) {
  return (
    compareOptionalDateAsc(first.admissionDate, second.admissionDate) ||
    first.name.localeCompare(second.name, "ko")
  );
}

function compareDischargedYouth(first: YouthRosterItem, second: YouthRosterItem) {
  return (
    compareOptionalDateDesc(first.dischargeDate, second.dischargeDate) ||
    first.name.localeCompare(second.name, "ko")
  );
}

function compareOptionalDateAsc(first: string | null, second: string | null) {
  if (first && second) {
    return first.localeCompare(second);
  }

  if (first) {
    return -1;
  }

  if (second) {
    return 1;
  }

  return 0;
}

function compareOptionalDateDesc(first: string | null, second: string | null) {
  return compareOptionalDateAsc(second, first);
}

function normalizeBlank(value: string | null) {
  const normalized = value?.trim();

  return normalized ? normalized : null;
}
