import "server-only";

import { DocumentStatus, type Prisma } from "@/generated/prisma/client";
import { getReadableDocumentWhere } from "@/lib/approval-permissions";
import { meetingMinutesTemplateId } from "@/lib/document-template-schema";
import { prisma } from "@/lib/prisma";
import type { WorkLogMeetingDocument } from "@/lib/work-log-core";
import {
  getWorkLogMeetingDate,
  selectWorkLogMeetingAttachments,
} from "@/lib/work-log-linked-meetings-core";
import type { WorkLogReadClient } from "@/lib/work-log-linked-tasks";

export type WorkLogMeetingDateIndexEntry = {
  documentId: string;
  meetingDate: string;
};

function getWorkLogMeetingWhere(
  authorId: string,
): Prisma.ApprovalDocumentWhereInput {
  return {
    templateId: meetingMinutesTemplateId,
    status: DocumentStatus.APPROVED,
    attachments: { some: {} },
    // A work log represents personal work, even when its owner is an admin.
    AND: [getReadableDocumentWhere(authorId, "USER")],
  };
}

/** Date is stored in compiled template content, not in an indexed date column. */
export async function getWorkLogMeetingDateIndex(
  { authorId, endDate }: { authorId: string; endDate: string },
  db: WorkLogReadClient = prisma,
): Promise<WorkLogMeetingDateIndexEntry[]> {
  const records = await db.approvalDocument.findMany({
    where: getWorkLogMeetingWhere(authorId),
    select: {
      id: true,
      content: true,
      template: { select: { schema: true } },
    },
    orderBy: { id: "asc" },
  });

  return records.flatMap((record) => {
    const meetingDate = getWorkLogMeetingDate(record.content, record.template.schema);

    return meetingDate && meetingDate <= endDate
      ? [{ documentId: record.id, meetingDate }]
      : [];
  });
}

function getMeetingDocumentSelect(authorId: string) {
  return {
    id: true,
    title: true,
    documentNo: true,
    content: true,
    status: true,
    createdAt: true,
    updatedAt: true,
    completedAt: true,
    template: { select: { schema: true } },
    drafterId: true,
    drafter: { select: { name: true } },
    approvalSteps: {
      where: { approverId: authorId },
      select: { approverId: true, approver: { select: { name: true } } },
    },
    attachments: {
      select: {
        id: true,
        originalName: true,
        mimeType: true,
        size: true,
        createdAt: true,
        signedAt: true,
        signedSourceAttachmentId: true,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    },
  } as const satisfies Prisma.ApprovalDocumentSelect;
}

export type WorkLogMeetingDocumentRecord = Prisma.ApprovalDocumentGetPayload<{
  select: ReturnType<typeof getMeetingDocumentSelect>;
}>;

/** Recheck current permission and date before exposing any file metadata. */
export async function getWorkLogMeetingRecords(
  {
    authorId,
    documentIds,
    workDates,
  }: {
    authorId: string;
    documentIds: readonly string[];
    workDates: readonly string[];
  },
  db: WorkLogReadClient = prisma,
): Promise<WorkLogMeetingDocumentRecord[]> {
  if (documentIds.length === 0 || workDates.length === 0) {
    return [];
  }

  const dates = new Set(workDates);
  const records = await db.approvalDocument.findMany({
    where: {
      ...getWorkLogMeetingWhere(authorId),
      id: { in: [...new Set(documentIds)] },
    },
    select: getMeetingDocumentSelect(authorId),
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  return records.filter((record) => {
    const date = getWorkLogMeetingDate(record.content, record.template.schema);

    return date !== null && dates.has(date);
  });
}

export function mapWorkLogMeetingDocument(
  record: WorkLogMeetingDocumentRecord,
): WorkLogMeetingDocument {
  const meetingDate = getWorkLogMeetingDate(record.content, record.template.schema);

  if (!meetingDate) {
    throw new Error("A linked meeting must have an unambiguous meeting date.");
  }

  return {
    id: record.id,
    title: record.title,
    meetingDate,
    documentNo: record.documentNo,
    status: record.status,
    attachments: selectWorkLogMeetingAttachments(record.attachments),
  };
}

export function getWorkLogMeetingAuthorName(
  record: WorkLogMeetingDocumentRecord,
  authorId: string,
) {
  return record.drafterId === authorId
    ? record.drafter.name
    : record.approvalSteps.find((step) => step.approverId === authorId)
      ?.approver.name ?? "";
}
