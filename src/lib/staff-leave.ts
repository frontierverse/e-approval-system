import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { vacationRequestTemplateId } from "@/lib/document-template-schema";
import { getKoreanDateValue } from "@/lib/document-archive-policy";
import { extractDocumentTemplateFieldValuesFromContent } from "@/lib/draft-template-content";
import { prisma } from "@/lib/prisma";
import {
  formatStaffLeaveDays,
  getStaffLeaveAccrualEntries,
  getLegacyVacationLeaveDeductionFromContent,
  getVacationLeaveDeduction,
  staffLeaveEntryTypes,
} from "@/lib/staff-leave-core";

type LeaveLedgerClient = Pick<
  Prisma.TransactionClient,
  "staffLeaveLedger" | "user"
>;

type ApprovedVacationDocument = {
  content: string;
  drafterId: string;
  id: string;
  templateId: string;
  title: string;
  template: {
    name: string;
    schema: unknown;
  };
};

export async function ensureStaffLeaveAccrualsForUser(
  userId: string,
  today = getKoreanDateValue(),
) {
  await ensureStaffLeaveAccruals(prisma, userId, today);
}

export async function ensureStaffLeaveAccruals(
  client: LeaveLedgerClient,
  userId: string,
  today = getKoreanDateValue(),
) {
  const user = await client.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      hireDate: true,
      resignationDate: true,
    },
  });

  if (!user?.hireDate) {
    return;
  }

  const existingEntries = await client.staffLeaveLedger.findMany({
    where: {
      userId,
      sourceKey: {
        not: null,
      },
    },
    select: {
      sourceKey: true,
    },
  });
  const accrualUntil =
    user.resignationDate && user.resignationDate < today
      ? user.resignationDate
      : today;
  const accrualEntries = getStaffLeaveAccrualEntries({
    existingSourceKeys: existingEntries
      .map((entry) => entry.sourceKey)
      .filter((sourceKey): sourceKey is string => Boolean(sourceKey)),
    hireDate: user.hireDate,
    today: accrualUntil,
  });

  if (accrualEntries.length === 0) {
    return;
  }

  await client.staffLeaveLedger.createMany({
    data: accrualEntries.map((entry) => ({
      amountHalfDays: entry.amountHalfDays,
      entryType: entry.entryType,
      eventDate: entry.eventDate,
      reason: entry.reason,
      sourceKey: entry.sourceKey,
      userId,
    })),
    skipDuplicates: true,
  });
}

export async function getStaffLeaveBalanceHalfDays(userId: string) {
  const result = await prisma.staffLeaveLedger.aggregate({
    where: {
      userId,
    },
    _sum: {
      amountHalfDays: true,
    },
  });

  return result._sum.amountHalfDays ?? 0;
}

export async function getStaffLeaveBalanceLabel(userId: string) {
  const balanceHalfDays = await getStaffLeaveBalanceHalfDays(userId);

  return formatStaffLeaveDays(balanceHalfDays);
}

export async function recordApprovedVacationLeaveDeduction(
  client: Pick<Prisma.TransactionClient, "staffLeaveLedger">,
  {
    actorId,
    document,
  }: {
    actorId: string;
    document: ApprovedVacationDocument;
  },
) {
  if (
    document.templateId !== vacationRequestTemplateId &&
    !document.template.name.includes("휴가")
  ) {
    return;
  }

  const values = extractDocumentTemplateFieldValuesFromContent(
    document.template.schema,
    document.content,
  );
  const deduction =
    getVacationLeaveDeduction(values) ??
    getLegacyVacationLeaveDeductionFromContent(document.content);

  if (!deduction) {
    return;
  }

  await client.staffLeaveLedger.createMany({
    data: [
      {
        actorId,
        amountHalfDays: deduction.amountHalfDays,
        documentId: document.id,
        entryType: staffLeaveEntryTypes.vacationDeduction,
        eventDate: deduction.eventDate,
        reason: `${deduction.reason} / ${document.title}`,
        sourceKey: `approval-document:${document.id}`,
        userId: document.drafterId,
      },
    ],
    skipDuplicates: true,
  });
}
