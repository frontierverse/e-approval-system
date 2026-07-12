import "server-only";

import { AuditAction, type Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { mapYouthDecisionDocument } from "@/lib/youth-management";
import {
  calculateYouthKoreanAge,
  getYouthDisplayAge,
  getYouthLearningScheduleToday,
  type YouthDischargeExtension,
  type YouthDecisionDocumentItem,
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
  koreanAge: number | null;
  initialDischargeDate?: string | null;
  dischargeDate: string | null;
  dischargeExtensions?: YouthDischargeExtension[];
  decisionDocuments: YouthDecisionDocumentItem[];
  familyContacts: YouthRosterFamilyContact[];
  name: string;
  phone: string | null;
};

export type YouthRosterFamilyContact = {
  id: string;
  relationship: string | null;
  phone: string | null;
};

export type YouthRosterChangeLog = {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
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

export type YouthRosterChangeLogFilters = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type YouthRosterChangeLogsResult = YouthRosterChangeLogFilters & {
  logs: YouthRosterChangeLog[];
};

type YouthRosterRecord = Awaited<ReturnType<typeof getYouthRosterRows>>[number];

const youthRosterChangeLogPageSize = 5;
const youthRosterAuditActions = [
  AuditAction.CREATE_YOUTH,
  AuditAction.UPDATE_YOUTH,
  AuditAction.EXTEND_YOUTH_DISCHARGE,
  AuditAction.UPDATE_YOUTH_NOTE,
  AuditAction.DELETE_YOUTH_NOTE,
];

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

export async function getYouthRosterChangeLogs({
  page = 1,
  pageSize = youthRosterChangeLogPageSize,
}: {
  page?: number;
  pageSize?: number;
} = {}): Promise<YouthRosterChangeLogsResult> {
  const normalizedPageSize = Math.max(1, pageSize);
  const where = createYouthRosterChangeLogWhere();
  const total = await prisma.auditLog.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / normalizedPageSize));
  const normalizedPage = clampPage(page, totalPages);
  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: {
      createdAt: "desc",
    },
    skip: (normalizedPage - 1) * normalizedPageSize,
    take: normalizedPageSize,
    select: {
      id: true,
      action: true,
      targetType: true,
      targetId: true,
      message: true,
      metadata: true,
      createdAt: true,
      actor: {
        select: {
          id: true,
          name: true,
          email: true,
          profileImageStorageKey: true,
          profileImageUpdatedAt: true,
        },
      },
    },
  });

  return {
    logs: logs.map((log) => ({
      id: log.id,
      action: log.action,
      targetType: log.targetType,
      targetId: log.targetId,
      message: log.message,
      metadata: log.metadata,
      createdAt: log.createdAt.toISOString(),
      actor: {
        ...log.actor,
        profileImageUpdatedAt:
          log.actor.profileImageUpdatedAt?.toISOString() ?? null,
      },
    })),
    page: normalizedPage,
    pageSize: normalizedPageSize,
    total,
    totalPages,
  };
}

async function getYouthRosterRows() {
  return prisma.youth.findMany({
    select: {
      id: true,
      admissionDate: true,
      age: true,
      birthDate: true,
      decisionDocuments: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          originalName: true,
          size: true,
          createdAt: true,
        },
      },
      dischargeDate: true,
      initialDischargeDate: true,
      dischargeExtensions: {
        orderBy: [{ extensionOrder: "asc" }],
        select: {
          id: true,
          extensionOrder: true,
          previousDischargeDate: true,
          extendedDischargeDate: true,
          reason: true,
          processedAt: true,
          processedBy: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
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
  const birthDate = normalizeBlank(record.birthDate);

  return {
    id: record.id,
    admissionDate: normalizeBlank(record.admissionDate),
    birthDate,
    age: getYouthDisplayAge(
      {
        age: record.age,
        birthDate,
      },
      referenceDate,
    ),
    koreanAge: calculateYouthKoreanAge(birthDate, referenceDate),
    initialDischargeDate:
      normalizeBlank(record.initialDischargeDate) ?? normalizeBlank(record.dischargeDate),
    dischargeDate: normalizeBlank(record.dischargeDate),
    dischargeExtensions: record.dischargeExtensions.map((extension) => ({
      id: extension.id,
      extensionOrder: extension.extensionOrder,
      previousDischargeDate: extension.previousDischargeDate,
      extendedDischargeDate: extension.extendedDischargeDate,
      reason: extension.reason,
      processedAt: extension.processedAt.toISOString(),
      processedBy: extension.processedBy,
    })),
    decisionDocuments: record.decisionDocuments.map(mapYouthDecisionDocument),
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

function createYouthRosterChangeLogWhere(): Prisma.AuditLogWhereInput {
  return {
    action: {
      in: [...youthRosterAuditActions],
    },
    targetType: {
      in: ["Youth", "YouthSpecialNote"],
    },
  };
}

function clampPage(page: number, totalPages: number) {
  if (!Number.isInteger(page) || page < 1) {
    return 1;
  }

  return Math.min(page, totalPages);
}
