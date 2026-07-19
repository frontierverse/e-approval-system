import {
  ApprovalStepStatus,
  DocumentStatus as DbDocumentStatus,
  Prisma,
} from "@/generated/prisma/client";
import type {
  DocumentStatus,
  UserSummary,
} from "@/lib/mock-data";
import { prisma } from "@/lib/prisma";

const DEFAULT_INBOX_LIMIT = 5;
const MAX_INBOX_LIMIT = 5;
const DEFAULT_SENT_LIMIT = 4;
const MAX_SENT_LIMIT = 4;
const OVERDUE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

const activeDocumentStatuses = [
  DbDocumentStatus.SUBMITTED,
  DbDocumentStatus.IN_PROGRESS,
] as const;

const userSummarySelect = {
  id: true,
  name: true,
  profileImageStorageKey: true,
  profileImageUpdatedAt: true,
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
} satisfies Prisma.UserSelect;

const dashboardDocumentSelect = {
  id: true,
  title: true,
  documentNo: true,
  category: true,
  status: true,
  submittedAt: true,
  createdAt: true,
  drafter: {
    select: userSummarySelect,
  },
  approvalSteps: {
    orderBy: {
      order: "asc",
    },
    select: {
      order: true,
      status: true,
      approver: {
        select: userSummarySelect,
      },
    },
  },
} satisfies Prisma.ApprovalDocumentSelect;

type DashboardDocumentRecord = Prisma.ApprovalDocumentGetPayload<{
  select: typeof dashboardDocumentSelect;
}>;

export type HomeDashboardDocument = {
  id: string;
  title: string;
  documentNo: string;
  category: string;
  status: DocumentStatus;
  submittedAt: string | null;
  createdAt: string;
  drafter: UserSummary;
  currentApprover: UserSummary | null;
  currentStepOrder: number | null;
  totalSteps: number;
  completedSteps: number;
};

export type HomeDashboardData = {
  generatedAt: string;
  counts: {
    activeInbox: number;
    overdueInbox: number;
    recalled: number;
    activeSent: number;
  };
  inboxDocuments: HomeDashboardDocument[];
  sentDocuments: HomeDashboardDocument[];
};

export type HomeDashboardOptions = {
  now?: Date;
  inboxLimit?: number;
  sentLimit?: number;
  includeApprovalQueue?: boolean;
};

/**
 * Loads only the actionable summary required by the home dashboard.
 *
 * Counts intentionally use dedicated aggregate queries and list records use a
 * constrained select so the dashboard does not materialize full documents,
 * attachments, comments, or audit histories. Facility-head-only approval queue
 * queries are opt-in and are never executed for the default employee view.
 */
export async function getHomeDashboardData(
  userId: string,
  options: HomeDashboardOptions = {},
): Promise<HomeDashboardData> {
  const now = options.now ?? new Date();
  const overdueBefore = new Date(now.getTime() - OVERDUE_THRESHOLD_MS);
  const inboxLimit = normalizeLimit(
    options.inboxLimit,
    DEFAULT_INBOX_LIMIT,
    MAX_INBOX_LIMIT,
  );
  const sentLimit = normalizeLimit(
    options.sentLimit,
    DEFAULT_SENT_LIMIT,
    MAX_SENT_LIMIT,
  );
  const activeInboxWhere = {
    status: {
      in: [...activeDocumentStatuses],
    },
    approvalSteps: {
      some: {
        approverId: userId,
        status: ApprovalStepStatus.PENDING,
      },
    },
  } satisfies Prisma.ApprovalDocumentWhereInput;
  const activeSentWhere = {
    drafterId: userId,
    status: {
      in: [...activeDocumentStatuses],
    },
  } satisfies Prisma.ApprovalDocumentWhereInput;

  const approvalQueuePromise = options.includeApprovalQueue
    ? Promise.all([
        prisma.approvalDocument.count({
          where: activeInboxWhere,
        }),
        prisma.approvalDocument.count({
          where: {
            ...activeInboxWhere,
            submittedAt: {
              lte: overdueBefore,
            },
          },
        }),
        prisma.approvalDocument.findMany({
          where: activeInboxWhere,
          select: dashboardDocumentSelect,
          orderBy: [
            {
              submittedAt: {
                sort: "asc",
                nulls: "last",
              },
            },
            {
              createdAt: "asc",
            },
          ],
          take: inboxLimit,
        }),
      ])
    : Promise.resolve([0, 0, [] as DashboardDocumentRecord[]] as const);

  const [
    [activeInbox, overdueInbox, inboxRecords],
    recalled,
    activeSent,
    sentRecords,
  ] = await Promise.all([
    approvalQueuePromise,
    prisma.approvalDocument.count({
      where: {
        drafterId: userId,
        status: DbDocumentStatus.RECALLED,
      },
    }),
    prisma.approvalDocument.count({
      where: activeSentWhere,
    }),
    prisma.approvalDocument.findMany({
      where: activeSentWhere,
      select: dashboardDocumentSelect,
      orderBy: [
        {
          submittedAt: {
            sort: "asc",
            nulls: "last",
          },
        },
        {
          createdAt: "asc",
        },
      ],
      take: sentLimit,
    }),
  ]);

  return {
    generatedAt: now.toISOString(),
    counts: {
      activeInbox,
      overdueInbox,
      recalled,
      activeSent,
    },
    inboxDocuments: inboxRecords.map(toHomeDashboardDocument),
    sentDocuments: sentRecords.map(toHomeDashboardDocument),
  };
}

function normalizeLimit(
  value: number | undefined,
  defaultValue: number,
  maximum: number,
) {
  if (value === undefined || !Number.isFinite(value)) {
    return defaultValue;
  }

  return Math.min(maximum, Math.max(0, Math.trunc(value)));
}

function toHomeDashboardDocument(
  record: DashboardDocumentRecord,
): HomeDashboardDocument {
  const currentStep = record.approvalSteps.find(
    (step) => step.status === ApprovalStepStatus.PENDING,
  );

  return {
    id: record.id,
    title: record.title,
    documentNo: record.documentNo ?? "",
    category: record.category,
    status: toDocumentStatus(record.status),
    submittedAt: record.submittedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    drafter: toUserSummary(record.drafter),
    currentApprover: currentStep
      ? toUserSummary(currentStep.approver)
      : null,
    currentStepOrder: currentStep?.order ?? null,
    totalSteps: record.approvalSteps.length,
    completedSteps: record.approvalSteps.filter(
      (step) =>
        step.status === ApprovalStepStatus.APPROVED ||
        step.status === ApprovalStepStatus.SKIPPED,
    ).length,
  };
}

function toUserSummary(
  record: DashboardDocumentRecord["drafter"],
): UserSummary {
  return {
    id: record.id,
    name: record.name,
    departmentName: record.department.name,
    positionName: record.position.name,
    profileImageStorageKey: record.profileImageStorageKey,
    profileImageUpdatedAt:
      record.profileImageUpdatedAt?.toISOString() ?? null,
  };
}

function toDocumentStatus(status: DbDocumentStatus): DocumentStatus {
  const statusMap = {
    DRAFT: "draft",
    SUBMITTED: "submitted",
    IN_PROGRESS: "in_progress",
    APPROVED: "approved",
    REJECTED: "rejected",
    RECALLED: "recalled",
  } satisfies Record<DbDocumentStatus, DocumentStatus>;

  return statusMap[status];
}
