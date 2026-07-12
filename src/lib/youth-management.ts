import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getYouthDisplayAge,
  type YouthDecisionDocumentItem,
  type YouthFamilyContact,
  normalizeYouthNoteCategory,
  normalizeYouthNotePriority,
  type YouthProfile,
  type YouthSpecialNote,
} from "@/lib/youth-management-core";

const youthInclude = {
  decisionDocuments: {
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  },
  dischargeExtensions: {
    orderBy: [{ extensionOrder: "asc" }],
    include: {
      processedBy: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  },
  notes: {
    orderBy: [{ recordedAt: "desc" }, { createdAt: "desc" }],
  },
} satisfies Prisma.YouthInclude;

type YouthRecord = Prisma.YouthGetPayload<{
  include: typeof youthInclude;
}> & {
  familyContacts: YouthFamilyContactRecord[];
};

type YouthFamilyContactRecord = {
  id: string;
  relationship: string | null;
  phone: string | null;
  youthId: string;
};
type YouthSpecialNoteRecord = YouthRecord["notes"][number];

export async function getYouthProfiles(): Promise<YouthProfile[]> {
  const youths = await prisma.youth.findMany({
    include: youthInclude,
    orderBy: [{ name: "asc" }],
  });
  const familyContactsByYouthId = await getFamilyContactsByYouthId(
    youths.map((youth) => youth.id),
  );

  return youths.map((youth) =>
    mapYouthProfile({
      ...youth,
      familyContacts: familyContactsByYouthId.get(youth.id) ?? [],
    }),
  );
}

export async function getFamilyContactsByYouthId(youthIds: string[]) {
  const contactsByYouthId = new Map<string, YouthFamilyContactRecord[]>();

  if (youthIds.length === 0) {
    return contactsByYouthId;
  }

  const contacts = await prisma.$queryRaw<YouthFamilyContactRecord[]>`
    SELECT "id", "relationship", "phone", "youthId"
    FROM "YouthFamilyContact"
    WHERE "youthId" IN (${Prisma.join(youthIds)})
    ORDER BY "createdAt" ASC, "id" ASC
  `;

  for (const contact of contacts) {
    const current = contactsByYouthId.get(contact.youthId) ?? [];

    current.push(contact);
    contactsByYouthId.set(contact.youthId, current);
  }

  return contactsByYouthId;
}

export function mapYouthProfile(record: YouthRecord): YouthProfile {
  return {
    id: record.id,
    name: record.name,
    admissionDate: record.admissionDate,
    birthDate: record.birthDate,
    initialDischargeDate: record.initialDischargeDate,
    dischargeDate: record.dischargeDate,
    age: getYouthDisplayAge({
      age: record.age,
      birthDate: record.birthDate,
    }),
    phone: record.phone,
    familyContacts: mapYouthFamilyContacts(record),
    decisionDocuments: record.decisionDocuments.map(mapYouthDecisionDocument),
    dischargeExtensions: record.dischargeExtensions.map((extension) => ({
      id: extension.id,
      extensionOrder: extension.extensionOrder,
      previousDischargeDate: extension.previousDischargeDate,
      extendedDischargeDate: extension.extendedDischargeDate,
      reason: extension.reason,
      processedAt: extension.processedAt.toISOString(),
      processedBy: extension.processedBy,
    })),
    notes: record.notes.map(mapYouthSpecialNote),
  };
}

export function mapYouthDecisionDocument(record: {
  id: string;
  originalName: string;
  size: number;
  createdAt: Date;
}): YouthDecisionDocumentItem {
  return {
    id: record.id,
    originalName: record.originalName,
    size: record.size,
    createdAt: record.createdAt.toISOString(),
  };
}

function mapYouthFamilyContacts(record: YouthRecord): YouthFamilyContact[] {
  const contacts = record.familyContacts.map(mapYouthFamilyContact);

  if (contacts.length > 0) {
    return contacts;
  }

  const legacyPhone = record.familyPhone ?? record.familyContact;

  if (!record.familyRelationship && !legacyPhone) {
    return [];
  }

  return [
    {
      id: `legacy-family-${record.id}`,
      relationship: record.familyRelationship,
      phone: legacyPhone,
    },
  ];
}

function mapYouthFamilyContact(
  record: YouthFamilyContactRecord,
): YouthFamilyContact {
  return {
    id: record.id,
    relationship: record.relationship,
    phone: record.phone,
  };
}

export function mapYouthSpecialNote(
  record: YouthSpecialNoteRecord,
): YouthSpecialNote {
  return {
    id: record.id,
    title: record.title,
    summary: record.summary,
    detail: record.detail,
    category: normalizeYouthNoteCategory(record.category),
    recordedAt: record.recordedAt,
    author: record.author,
    priority: normalizeYouthNotePriority(record.priority),
  };
}
