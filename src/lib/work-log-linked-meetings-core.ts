import { getSafeDocumentTemplateSchema } from "@/lib/document-template-schema";
import { extractDocumentTemplateFieldValuesFromContent } from "@/lib/draft-template-content";
import {
  isWorkLogDate,
  type WorkLogMeetingAttachment,
} from "@/lib/work-log-core";

export type WorkLogMeetingAttachmentRecord = {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: Date;
  signedAt: Date | null;
  signedSourceAttachmentId: string | null;
};

/** An ambiguous or missing meeting date must never become a submission date. */
export function getWorkLogMeetingDate(content: string, schema: unknown) {
  const safeSchema = getSafeDocumentTemplateSchema(schema).schema;
  const dateField = safeSchema.fields.find(
    (field) => field.name === "meetingDate" && field.type === "date",
  );

  if (!dateField) {
    return null;
  }

  const dateHeadings = content
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((line) => line.startsWith(`${dateField.label}:`));

  if (dateHeadings.length !== 1) {
    return null;
  }

  const date = extractDocumentTemplateFieldValuesFromContent(
    safeSchema,
    content,
  ).meetingDate?.trim() ?? "";

  return isWorkLogDate(date) ? date : null;
}

/** Display the latest signed copy instead of repeating its unsigned original. */
export function selectWorkLogMeetingAttachments(
  records: readonly WorkLogMeetingAttachmentRecord[],
): WorkLogMeetingAttachment[] {
  const byId = new Map(records.map((record) => [record.id, record]));
  const signedBySource = new Map<string, WorkLogMeetingAttachmentRecord>();

  for (const record of byId.values()) {
    if (!record.signedSourceAttachmentId) {
      continue;
    }

    const previous = signedBySource.get(record.signedSourceAttachmentId);

    if (!previous || compareAttachmentVersions(record, previous) > 0) {
      signedBySource.set(record.signedSourceAttachmentId, record);
    }
  }

  const displayed = [...byId.values()]
    .filter((record) =>
      !record.signedSourceAttachmentId || !byId.has(record.signedSourceAttachmentId),
    )
    .sort((first, second) =>
      first.createdAt.getTime() - second.createdAt.getTime() || first.id.localeCompare(second.id),
    )
    .map((record) => signedBySource.get(record.id) ?? record);

  return [...new Map(displayed.map((record) => [record.id, record])).values()].map(
    (record) => ({
      id: record.id,
      originalName: record.originalName,
      mimeType: record.mimeType,
      size: record.size,
      isSigned: Boolean(record.signedSourceAttachmentId),
    }),
  );
}

function compareAttachmentVersions(
  first: WorkLogMeetingAttachmentRecord,
  second: WorkLogMeetingAttachmentRecord,
) {
  return (first.signedAt ?? first.createdAt).getTime()
    - (second.signedAt ?? second.createdAt).getTime()
    || first.createdAt.getTime() - second.createdAt.getTime()
    || first.id.localeCompare(second.id);
}
