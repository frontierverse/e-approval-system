import "server-only";

import { DocumentStatus } from "@/generated/prisma/client";
import { getKoreanDateValue } from "@/lib/document-archive-policy";
import { vacationRequestTemplateId } from "@/lib/document-template-schema";
import { extractDocumentTemplateFieldValuesFromContent } from "@/lib/draft-template-content";
import { prisma } from "@/lib/prisma";
import {
  formatStaffVacationDday,
  getInclusiveStaffLeaveDates,
  getLegacyVacationLeaveUsageFromContent,
  getStaffLeaveDateDiffInDays,
  getVacationLeaveUsage,
  shiftStaffLeaveDate,
  type StaffLeaveVacationUsage,
} from "@/lib/staff-leave-core";

export type ApprovedStaffVacationDateEntry = {
  date: string;
  ddayLabel: string;
  departmentName: string;
  detailLabel: string;
  id: string;
  positionName: string;
  staffName: string;
  vacationLabel: string;
  workScheduleHref: string;
};

export type StaffVacationTopbarAlert = {
  ddayLabel: string;
  items: ApprovedStaffVacationDateEntry[];
  staffName: string;
};

type VacationDocumentRecord = Awaited<
  ReturnType<typeof getApprovedVacationDocuments>
>[number];

export async function getApprovedStaffVacationDateEntries({
  fromDate,
  referenceDate = fromDate,
  toDate,
}: {
  fromDate: string;
  referenceDate?: string;
  toDate: string;
}) {
  const records = await getApprovedVacationDocuments();

  return records
    .flatMap((record) =>
      createApprovedStaffVacationDateEntries({
        fromDate,
        record,
        referenceDate,
        toDate,
      }),
    )
    .sort(compareApprovedStaffVacationDateEntries);
}

export async function getStaffVacationTopbarAlert(
  referenceDate = getKoreanDateValue(),
): Promise<StaffVacationTopbarAlert | null> {
  const items = await getApprovedStaffVacationDateEntries({
    fromDate: referenceDate,
    referenceDate,
    toDate: shiftStaffLeaveDate(referenceDate, 31),
  });
  const firstItem = items[0];

  if (!firstItem) {
    return null;
  }

  return {
    ddayLabel: firstItem.ddayLabel,
    items,
    staffName: firstItem.staffName,
  };
}

async function getApprovedVacationDocuments() {
  return prisma.approvalDocument.findMany({
    where: {
      OR: [
        {
          templateId: vacationRequestTemplateId,
        },
        {
          template: {
            name: {
              contains: "휴가",
            },
          },
        },
      ],
      status: DocumentStatus.APPROVED,
    },
    orderBy: [{ completedAt: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      content: true,
      templateId: true,
      drafter: {
        select: {
          id: true,
          name: true,
          department: {
            select: {
              name: true,
            },
          },
          position: {
            select: {
              name: true,
            },
          },
        },
      },
      template: {
        select: {
          name: true,
          schema: true,
        },
      },
    },
  });
}

function createApprovedStaffVacationDateEntries({
  fromDate,
  record,
  referenceDate,
  toDate,
}: {
  fromDate: string;
  record: VacationDocumentRecord;
  referenceDate: string;
  toDate: string;
}): ApprovedStaffVacationDateEntry[] {
  if (!isVacationDocument(record)) {
    return [];
  }

  const usage = getVacationUsageFromDocument(record);

  if (!usage) {
    return [];
  }

  return getInclusiveStaffLeaveDates(usage.startDate, usage.endDate)
    .filter((date) => date >= fromDate && date <= toDate)
    .map((date) => {
      const daysUntil = getStaffLeaveDateDiffInDays(referenceDate, date);

      return {
        date,
        ddayLabel: formatStaffVacationDday(daysUntil),
        departmentName: record.drafter.department.name,
        detailLabel: `${record.drafter.department.name} / ${record.drafter.position.name}`,
        id: `${record.id}:${date}`,
        positionName: record.drafter.position.name,
        staffName: record.drafter.name,
        vacationLabel: usage.vacationLabel,
        workScheduleHref: `/work-schedule?month=${date.slice(0, 7)}`,
      };
    });
}

function getVacationUsageFromDocument(document: {
  content: string;
  template: {
    schema: unknown;
  };
}): StaffLeaveVacationUsage | null {
  const values = extractDocumentTemplateFieldValuesFromContent(
    document.template.schema,
    document.content,
  );

  return (
    getVacationLeaveUsage(values) ??
    getLegacyVacationLeaveUsageFromContent(document.content)
  );
}

function isVacationDocument(document: {
  template: {
    name: string;
  };
  templateId: string;
}) {
  return (
    document.templateId === vacationRequestTemplateId ||
    document.template.name.includes("휴가")
  );
}

function compareApprovedStaffVacationDateEntries(
  first: ApprovedStaffVacationDateEntry,
  second: ApprovedStaffVacationDateEntry,
) {
  return (
    first.date.localeCompare(second.date) ||
    first.staffName.localeCompare(second.staffName, "ko-KR") ||
    first.vacationLabel.localeCompare(second.vacationLabel, "ko-KR")
  );
}
