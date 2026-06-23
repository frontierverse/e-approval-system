import {
  ApprovalStepStatus as DbApprovalStepStatus,
  AuditAction,
  DocumentStatus as DbDocumentStatus,
  Prisma,
  UserRole,
  UserStatus,
} from "@/generated/prisma/client";
import { getReadableDocumentWhere } from "@/lib/approval-permissions";
import {
  createApprovalApprovedAuditMessage,
  createApprovalRejectedAuditMessage,
  createProxyApprovedAuditMessage,
  createProxyRejectedAuditMessage,
} from "@/lib/approval-audit-messages";
import {
  generatedPdfAuditActionLabel,
  isGeneratedPdfAuditLog,
} from "@/lib/generated-pdf-audit";
import { extractDisplayContentFromTemplate } from "@/lib/draft-template-content";
import { prisma } from "@/lib/prisma";
import { getArchiveReviewBaseDateRange } from "@/lib/document-archive-policy";
import {
  type ApprovalDocument,
  type ApprovalHistory,
  type ApprovalStep,
  type ApprovalStepStatus,
  type DocumentStatus,
} from "@/lib/mock-data";

const documentInclude = {
  template: true,
  drafter: {
    select: {
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
    },
  },
  approvalSteps: {
    include: {
      approver: {
        select: {
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
        },
      },
      actedBy: {
        select: {
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
        },
      },
      proxyApprovedBy: {
        select: {
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
        },
      },
    },
    orderBy: {
      order: "asc",
    },
  },
  auditLogs: {
    include: {
      actor: {
        select: {
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
        },
      },
    },
    orderBy: {
      createdAt: "asc",
    },
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
      convertedAt: true,
      convertedSourceAttachmentId: true,
      signedBy: {
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
          profileImageStorageKey: true,
          profileImageUpdatedAt: true,
        },
      },
      convertedBy: {
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
          profileImageStorageKey: true,
          profileImageUpdatedAt: true,
        },
      },
    },
    orderBy: {
      createdAt: "asc",
    },
  },
  _count: {
    select: {
      attachments: true,
    },
  },
} satisfies Prisma.ApprovalDocumentInclude;

type DocumentRecord = Prisma.ApprovalDocumentGetPayload<{
  include: typeof documentInclude;
}>;

export type InboxDocumentStatusFilter = "all" | "active";
export type DraftDocumentStatusFilter = "all" | "draft" | "recalled";
export type SentDocumentStatusFilter =
  | "all"
  | "active"
  | "approved"
  | "rejected";
export type CompletedDocumentStatusFilter = "all" | "approved" | "rejected";
export type DocumentPageSort = "latest" | "oldest";
export type CompletedDocumentArchiveReviewFilter = "none" | "review";

export type DocumentDateRangeOptions = {
  dateFrom?: string;
  dateTo?: string;
};

export type InboxDocumentPageOptions = {
  query?: string;
  status?: InboxDocumentStatusFilter;
  sort?: DocumentPageSort;
  page?: number;
  pageSize?: number;
} & DocumentDateRangeOptions;

export type SentDocumentPageOptions = {
  query?: string;
  status?: SentDocumentStatusFilter;
  sort?: DocumentPageSort;
  page?: number;
  pageSize?: number;
} & DocumentDateRangeOptions;

export type DraftDocumentPageOptions = {
  query?: string;
  status?: DraftDocumentStatusFilter;
  sort?: DocumentPageSort;
  page?: number;
  pageSize?: number;
} & DocumentDateRangeOptions;

export type CompletedDocumentPageOptions = {
  query?: string;
  status?: CompletedDocumentStatusFilter;
  archiveReview?: CompletedDocumentArchiveReviewFilter;
  sort?: DocumentPageSort;
  page?: number;
  pageSize?: number;
} & DocumentDateRangeOptions;

const documentStatusMap: Record<DbDocumentStatus, DocumentStatus> = {
  DRAFT: "draft",
  SUBMITTED: "submitted",
  IN_PROGRESS: "in_progress",
  APPROVED: "approved",
  REJECTED: "rejected",
  RECALLED: "recalled",
};

const approvalStepStatusMap: Record<
  DbApprovalStepStatus,
  ApprovalStepStatus
> = {
  WAITING: "waiting",
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
  SKIPPED: "waiting",
};

const auditActionLabels: Record<AuditAction, string> = {
  CREATE_DRAFT: "임시저장",
  UPDATE_DRAFT: "임시저장 수정",
  DELETE_DRAFT: "임시저장 삭제",
  SUBMIT: "결재 요청",
  APPROVE: "승인",
  PROXY_APPROVE: "대리결재",
  PROXY_REJECT: "대리결재 반려",
  REJECT: "반려",
  RECALL: "회수",
  COMPLETE: "승인완료",
  CREATE_USER: "사용자 생성",
  UPDATE_USER: "사용자 수정",
  CREATE_DEPARTMENT: "부서 생성",
  UPDATE_DEPARTMENT: "부서 수정",
  CREATE_POSITION: "직급 생성",
  UPDATE_POSITION: "직급 수정",
  CREATE_TEMPLATE: "양식 생성",
  UPDATE_TEMPLATE: "양식 수정",
  UPDATE_ATTACHMENT_POLICY: "첨부 정책 수정",
  UPDATE_COMPANY_INFO: "회사 정보 수정",
  CHANGE_PASSWORD: "비밀번호 변경",
  CREATE_RESOURCE: "자료 업로드",
  UPDATE_RESOURCE: "자료 수정",
  DELETE_RESOURCE: "자료 삭제",
  CREATE_YOUTH: "청소년 등록",
  UPDATE_YOUTH: "청소년 정보 수정",
  UPDATE_YOUTH_NOTE: "청소년 특이사항 수정",
  DELETE_YOUTH_NOTE: "청소년 특이사항 삭제",
};

export async function getInboxDocuments(userId: string) {
  const records = await prisma.approvalDocument.findMany({
    where: {
      approvalSteps: {
        some: {
          approverId: userId,
          status: DbApprovalStepStatus.PENDING,
        },
      },
    },
    include: documentInclude,
    orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }],
  });

  return records.map(toApprovalDocument);
}

export async function getInboxDocumentPage(
  userId: string,
  options: InboxDocumentPageOptions = {},
) {
  const pageSize = options.pageSize ?? 10;
  const where = getInboxDocumentWhere(userId, options);
  const orderBy = getSubmittedDocumentOrderBy(options.sort ?? "latest");

  return getDocumentPage(where, orderBy, pageSize, options.page);
}

export async function getSentDocuments(userId: string) {
  const records = await prisma.approvalDocument.findMany({
    where: getSentDocumentWhere(userId, {}),
    include: documentInclude,
    orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }],
  });

  return records.map(toApprovalDocument);
}

export async function getDraftDocuments(userId: string) {
  const records = await prisma.approvalDocument.findMany({
    where: getDraftDocumentWhere(userId, {}),
    include: documentInclude,
    orderBy: getDraftDocumentOrderBy("latest"),
  });

  return records.map(toApprovalDocument);
}

export async function getSentDocumentPage(
  userId: string,
  options: SentDocumentPageOptions = {},
) {
  const pageSize = options.pageSize ?? 10;
  const where = getSentDocumentWhere(userId, options);
  const orderBy = getSubmittedDocumentOrderBy(options.sort ?? "latest");

  return getDocumentPage(where, orderBy, pageSize, options.page);
}

export async function getDraftDocumentPage(
  userId: string,
  options: DraftDocumentPageOptions = {},
) {
  const pageSize = options.pageSize ?? 10;
  const where = getDraftDocumentWhere(userId, options);
  const orderBy = getDraftDocumentOrderBy(options.sort ?? "latest");

  return getDocumentPage(where, orderBy, pageSize, options.page);
}

export async function getCompletedDocuments(userId: string) {
  const records = await prisma.approvalDocument.findMany({
    where: {
      status: {
        in: [DbDocumentStatus.APPROVED, DbDocumentStatus.REJECTED],
      },
      OR: [
        { drafterId: userId },
        {
          approvalSteps: {
            some: {
              approverId: userId,
            },
          },
        },
      ],
    },
    include: documentInclude,
    orderBy: [{ completedAt: "desc" }, { submittedAt: "desc" }],
  });

  return records.map(toApprovalDocument);
}

export async function getCompletedDocumentPage(
  userId: string,
  options: CompletedDocumentPageOptions = {},
) {
  const pageSize = options.pageSize ?? 10;
  const where = getCompletedDocumentWhere(userId, options);
  const orderBy = getCompletedDocumentOrderBy(options.sort ?? "latest");

  return getDocumentPage(where, orderBy, pageSize, options.page);
}

export async function getShellDocumentCounts(userId: string) {
  const [inbox, drafts, sent, completed, archiveReview] = await Promise.all([
    prisma.approvalDocument.count({
      where: getInboxDocumentWhere(userId, {}),
    }),
    prisma.approvalDocument.count({
      where: getDraftDocumentWhere(userId, {}),
    }),
    prisma.approvalDocument.count({
      where: getSentDocumentWhere(userId, {}),
    }),
    prisma.approvalDocument.count({
      where: getCompletedDocumentWhere(userId, {}),
    }),
    prisma.approvalDocument.count({
      where: getCompletedDocumentWhere(userId, { archiveReview: "review" }),
    }),
  ]);

  return {
    inbox,
    drafts,
    sent,
    completed,
    archiveReview,
  };
}

export async function getReadableDocumentById(
  documentId: string,
  userId: string,
  role: UserRole,
) {
  const record = await prisma.approvalDocument.findFirst({
    where: {
      AND: [
        {
          id: documentId,
        },
        getReadableDocumentWhere(userId, role),
      ],
    },
    include: documentInclude,
  });

  return record ? toApprovalDocument(record) : null;
}

export async function getEditableDraftDocumentById(
  documentId: string,
  userId: string,
) {
  const record = await prisma.approvalDocument.findFirst({
    where: {
      id: documentId,
      drafterId: userId,
      status: {
        in: [DbDocumentStatus.DRAFT, DbDocumentStatus.RECALLED],
      },
    },
    select: {
      id: true,
      title: true,
      category: true,
      content: true,
      templateId: true,
      status: true,
      template: {
        select: {
          schema: true,
        },
      },
      approvalSteps: {
        orderBy: {
          order: "asc",
        },
        select: {
          approverId: true,
        },
      },
      attachments: {
        select: {
          id: true,
          originalName: true,
          mimeType: true,
          size: true,
          createdAt: true,
          signedSourceAttachmentId: true,
        },
        orderBy: {
          createdAt: "asc",
        },
      },
    },
  });

  if (!record) {
    return null;
  }

  return {
    id: record.id,
    title: record.title,
    category: record.category,
    content: extractDisplayContentFromTemplate(
      record.content,
      record.templateId,
      record.template.schema,
    ),
    templateId: record.templateId,
    status: documentStatusMap[record.status],
    approverIds: record.approvalSteps.map((step) => step.approverId),
    attachments: record.attachments.map((attachment) => ({
      id: attachment.id,
      originalName: attachment.originalName,
      mimeType: attachment.mimeType,
      signedSourceAttachmentId: attachment.signedSourceAttachmentId,
      size: attachment.size,
      createdAt: attachment.createdAt.toISOString(),
    })),
  };
}

export async function getRecentHistories(
  userId: string,
  role: UserRole,
  limit = 5,
) {
  const records = await prisma.auditLog.findMany({
    where:
      role === UserRole.ADMIN
        ? {
            documentId: {
              not: null,
            },
          }
        : {
            document: {
              is: getReadableDocumentWhere(userId, role),
            },
          },
    take: limit,
    orderBy: {
      createdAt: "desc",
    },
    include: {
      actor: {
        select: {
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
        },
      },
      document: {
        select: {
          documentNo: true,
          title: true,
          drafter: {
            select: {
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
            },
          },
          approvalSteps: {
            include: {
              approver: {
                select: {
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
                },
              },
            },
            orderBy: {
              order: "asc",
            },
          },
        },
      },
    },
  });

  return records.map((record) => ({
    id: record.id,
    actorId: record.actorId,
    actorName: record.actor.name,
    actor: {
      id: record.actor.id,
      name: record.actor.name,
      departmentName: record.actor.department.name,
      positionName: record.actor.position.name,
      profileImageStorageKey: record.actor.profileImageStorageKey,
      profileImageUpdatedAt:
        record.actor.profileImageUpdatedAt?.toISOString() ?? null,
    },
    action: getApprovalHistoryActionLabel(record),
    actionValue: record.action,
    createdAt: record.createdAt.toISOString(),
    description: record.message ?? "",
    documentId: record.documentId ?? record.targetId,
    documentNo: record.document?.documentNo ?? "-",
    title: record.document?.title ?? record.targetId,
    requester: record.document
      ? {
          id: record.document.drafter.id,
          name: record.document.drafter.name,
          departmentName: record.document.drafter.department.name,
          positionName: record.document.drafter.position.name,
          profileImageStorageKey: record.document.drafter.profileImageStorageKey,
          profileImageUpdatedAt:
            record.document.drafter.profileImageUpdatedAt?.toISOString() ??
            null,
        }
      : {
          id: record.actor.id,
          name: record.actor.name,
          departmentName: record.actor.department.name,
          positionName: record.actor.position.name,
          profileImageStorageKey: record.actor.profileImageStorageKey,
          profileImageUpdatedAt:
            record.actor.profileImageUpdatedAt?.toISOString() ?? null,
        },
    approvalSteps:
      record.document?.approvalSteps.map((step) => ({
        id: step.id,
        order: step.order,
        approverId: step.approverId,
        approver: {
          id: step.approver.id,
          name: step.approver.name,
          departmentName: step.approver.department.name,
          positionName: step.approver.position.name,
          profileImageStorageKey: step.approver.profileImageStorageKey,
          profileImageUpdatedAt:
            step.approver.profileImageUpdatedAt?.toISOString() ?? null,
        },
        status: approvalStepStatusMap[step.status],
        actedAt: step.actedAt?.toISOString() ?? null,
        comment: step.comment,
      })) ?? [],
  }));
}

export async function getActiveDocumentTemplates() {
  return prisma.documentTemplate.findMany({
    where: {
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      description: true,
      schema: true,
    },
    orderBy: {
      name: "asc",
    },
  });
}

export async function getApprovalCandidateUsers(currentUserId: string) {
  return prisma.user.findMany({
    where: {
      id: {
        not: currentUserId,
      },
      status: UserStatus.ACTIVE,
    },
    select: {
      id: true,
      name: true,
      email: true,
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
          level: true,
        },
      },
    },
    orderBy: [
      {
        department: {
          sortOrder: "asc",
        },
      },
      {
        position: {
          level: "desc",
        },
      },
      {
        name: "asc",
      },
    ],
  });
}

function getInboxDocumentWhere(
  userId: string,
  options: InboxDocumentPageOptions,
): Prisma.ApprovalDocumentWhereInput {
  const query = options.query?.trim();
  const status = options.status ?? "all";
  const where: Prisma.ApprovalDocumentWhereInput = {
    approvalSteps: {
      some: {
        approverId: userId,
        status: DbApprovalStepStatus.PENDING,
      },
    },
  };

  if (status === "active") {
    where.status = {
      in: [DbDocumentStatus.SUBMITTED, DbDocumentStatus.IN_PROGRESS],
    };
  }

  if (query) {
    where.OR = getDocumentSearchConditions(query);
  }

  const dateRangeCondition = getActivityDateRangeCondition(options);

  if (dateRangeCondition) {
    where.AND = [dateRangeCondition];
  }

  return where;
}

function getSentDocumentWhere(
  userId: string,
  options: SentDocumentPageOptions,
): Prisma.ApprovalDocumentWhereInput {
  const query = options.query?.trim();
  const status = options.status ?? "all";
  const where: Prisma.ApprovalDocumentWhereInput = {
    drafterId: userId,
    status: {
      notIn: [DbDocumentStatus.DRAFT, DbDocumentStatus.RECALLED],
    },
  };

  if (status === "active") {
    where.status = {
      in: [DbDocumentStatus.SUBMITTED, DbDocumentStatus.IN_PROGRESS],
    };
  } else if (status !== "all") {
    where.status = toDbDocumentStatus(status);
  }

  if (query) {
    where.OR = getDocumentSearchConditions(query);
  }

  const dateRangeCondition = getActivityDateRangeCondition(options);

  if (dateRangeCondition) {
    where.AND = [dateRangeCondition];
  }

  return where;
}

function getDraftDocumentWhere(
  userId: string,
  options: DraftDocumentPageOptions,
): Prisma.ApprovalDocumentWhereInput {
  const query = options.query?.trim();
  const status = options.status ?? "all";
  const where: Prisma.ApprovalDocumentWhereInput = {
    drafterId: userId,
    status:
      status === "all"
        ? {
            in: [DbDocumentStatus.DRAFT, DbDocumentStatus.RECALLED],
          }
        : toDbDocumentStatus(status),
  };

  if (query) {
    where.OR = getDocumentSearchConditions(query);
  }

  const dateRangeCondition = getActivityDateRangeCondition(options);

  if (dateRangeCondition) {
    where.AND = [dateRangeCondition];
  }

  return where;
}

function getCompletedDocumentWhere(
  userId: string,
  options: CompletedDocumentPageOptions,
): Prisma.ApprovalDocumentWhereInput {
  const query = options.query?.trim();
  const status = options.status ?? "all";
  const archiveReview = options.archiveReview ?? "none";
  const and: Prisma.ApprovalDocumentWhereInput[] = [
    {
      OR: [
        { drafterId: userId },
        {
          approvalSteps: {
            some: {
              approverId: userId,
            },
          },
        },
      ],
    },
  ];

  if (status === "all") {
    and.push({
      status: {
        in:
          archiveReview === "review"
            ? [
                DbDocumentStatus.APPROVED,
                DbDocumentStatus.REJECTED,
                DbDocumentStatus.RECALLED,
              ]
            : [DbDocumentStatus.APPROVED, DbDocumentStatus.REJECTED],
      },
    });
  } else {
    and.push({
      status: toDbDocumentStatus(status),
    });
  }

  if (query) {
    and.push({
      OR: getDocumentSearchConditions(query),
    });
  }

  if (archiveReview === "review") {
    const archiveReviewDateRangeCondition =
      getArchiveReviewDateRangeCondition(options);

    if (archiveReviewDateRangeCondition) {
      and.push(archiveReviewDateRangeCondition);
    }
  } else {
    const dateRangeCondition = getActivityDateRangeCondition(options);

    if (dateRangeCondition) {
      and.push(dateRangeCondition);
    }
  }

  return {
    AND: and,
  };
}

function getArchiveReviewDateRangeCondition(
  options: CompletedDocumentPageOptions,
): Prisma.ApprovalDocumentWhereInput | null {
  if (options.archiveReview !== "review") {
    return null;
  }

  const range = getArchiveReviewBaseDateRange({
    dateFrom: options.dateFrom,
    dateTo: options.dateTo,
  });
  const dateFilter = {
    ...(range.from ? { gte: range.from } : {}),
    ...(range.to ? { lte: range.to } : {}),
  } satisfies Prisma.DateTimeFilter;

  return {
    OR: [
      {
        completedAt: {
          not: null,
          ...dateFilter,
        },
      },
      {
        completedAt: null,
        submittedAt: {
          not: null,
          ...dateFilter,
        },
      },
      {
        completedAt: null,
        submittedAt: null,
        createdAt: {
          ...dateFilter,
        },
      },
    ],
  };
}

function getDocumentSearchConditions(
  query: string,
): Prisma.ApprovalDocumentWhereInput[] {
  return [
    {
      title: {
        contains: query,
      },
    },
    {
      documentNo: {
        contains: query,
      },
    },
    {
      category: {
        contains: query,
      },
    },
    {
      drafter: {
        name: {
          contains: query,
        },
      },
    },
  ];
}

function getSubmittedDocumentOrderBy(
  sort: DocumentPageSort,
): Prisma.ApprovalDocumentOrderByWithRelationInput[] {
  const direction = sort === "oldest" ? "asc" : "desc";

  return [
    {
      submittedAt: direction,
    },
    {
      createdAt: direction,
    },
  ];
}

function getDraftDocumentOrderBy(
  sort: DocumentPageSort,
): Prisma.ApprovalDocumentOrderByWithRelationInput[] {
  const direction = sort === "oldest" ? "asc" : "desc";

  return [
    {
      updatedAt: direction,
    },
    {
      createdAt: direction,
    },
  ];
}

function getActivityDateRangeCondition(
  options: DocumentDateRangeOptions,
): Prisma.ApprovalDocumentWhereInput | null {
  const range = getDateTimeRangeFilter(options);

  if (!range) {
    return null;
  }

  return {
    OR: [
      {
        completedAt: {
          not: null,
          ...range,
        },
      },
      {
        completedAt: null,
        submittedAt: {
          not: null,
          ...range,
        },
      },
      {
        completedAt: null,
        submittedAt: null,
        createdAt: range,
      },
    ],
  };
}

function getDateTimeRangeFilter(options: DocumentDateRangeOptions) {
  const from = parseDateStart(options.dateFrom);
  const to = parseDateEnd(options.dateTo);

  if (!from && !to) {
    return null;
  }

  return {
    ...(from ? { gte: from } : {}),
    ...(to ? { lte: to } : {}),
  } satisfies Prisma.DateTimeFilter;
}

function parseDateStart(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const date = new Date(`${value}T00:00:00+09:00`);

  return Number.isNaN(date.getTime()) ? null : date;
}

function parseDateEnd(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const date = new Date(`${value}T23:59:59.999+09:00`);

  return Number.isNaN(date.getTime()) ? null : date;
}

function getCompletedDocumentOrderBy(
  sort: DocumentPageSort,
): Prisma.ApprovalDocumentOrderByWithRelationInput[] {
  const direction = sort === "oldest" ? "asc" : "desc";

  return [
    {
      completedAt: direction,
    },
    {
      submittedAt: direction,
    },
    {
      createdAt: direction,
    },
  ];
}

async function getDocumentPage(
  where: Prisma.ApprovalDocumentWhereInput,
  orderBy: Prisma.ApprovalDocumentOrderByWithRelationInput[],
  pageSize: number,
  requestedPage = 1,
) {
  const total = await prisma.approvalDocument.count({
    where,
  });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, requestedPage), totalPages);
  const records = await prisma.approvalDocument.findMany({
    where,
    include: documentInclude,
    orderBy,
    skip: (page - 1) * pageSize,
    take: pageSize,
  });

  return {
    documents: records.map(toApprovalDocument),
    page,
    pageSize,
    total,
    totalPages,
  };
}

type DocumentStatusFilterValue = Exclude<
  | DraftDocumentStatusFilter
  | SentDocumentStatusFilter
  | CompletedDocumentStatusFilter,
  "all" | "active"
>;

function toDbDocumentStatus(status: DocumentStatusFilterValue) {
  const statusMap = {
    draft: DbDocumentStatus.DRAFT,
    approved: DbDocumentStatus.APPROVED,
    rejected: DbDocumentStatus.REJECTED,
    recalled: DbDocumentStatus.RECALLED,
  } satisfies Record<DocumentStatusFilterValue, DbDocumentStatus>;

  return statusMap[status];
}

function toApprovalDocument(record: DocumentRecord): ApprovalDocument {
  return {
    id: record.id,
    documentNo: record.documentNo ?? "",
    title: record.title,
    templateName: record.template.name,
    category: record.category,
    status: documentStatusMap[record.status],
    drafter: {
      id: record.drafter.id,
      name: record.drafter.name,
      departmentName: record.drafter.department.name,
      positionName: record.drafter.position.name,
      profileImageStorageKey: record.drafter.profileImageStorageKey,
      profileImageUpdatedAt:
        record.drafter.profileImageUpdatedAt?.toISOString() ?? null,
    },
    drafterId: record.drafterId,
    createdAt: record.createdAt.toISOString(),
    submittedAt: record.submittedAt?.toISOString() ?? null,
    completedAt: record.completedAt?.toISOString() ?? null,
    content: extractDisplayContentFromTemplate(
      record.content,
      record.templateId,
      record.template.schema,
    ),
    attachmentCount: record._count.attachments,
    attachments: record.attachments.map((attachment) => ({
      id: attachment.id,
      originalName: attachment.originalName,
      mimeType: attachment.mimeType,
      size: attachment.size,
      createdAt: attachment.createdAt.toISOString(),
      signedAt: attachment.signedAt?.toISOString() ?? null,
      signedBy: attachment.signedBy
        ? {
            id: attachment.signedBy.id,
            name: attachment.signedBy.name,
            departmentName: attachment.signedBy.department.name,
            positionName: attachment.signedBy.position.name,
            profileImageStorageKey: attachment.signedBy.profileImageStorageKey,
            profileImageUpdatedAt:
              attachment.signedBy.profileImageUpdatedAt?.toISOString() ?? null,
          }
        : null,
      signedSourceAttachmentId: attachment.signedSourceAttachmentId,
      convertedAt: attachment.convertedAt?.toISOString() ?? null,
      convertedBy: attachment.convertedBy
        ? {
            id: attachment.convertedBy.id,
            name: attachment.convertedBy.name,
            departmentName: attachment.convertedBy.department.name,
            positionName: attachment.convertedBy.position.name,
            profileImageStorageKey:
              attachment.convertedBy.profileImageStorageKey,
            profileImageUpdatedAt:
              attachment.convertedBy.profileImageUpdatedAt?.toISOString() ??
              null,
          }
        : null,
      convertedSourceAttachmentId: attachment.convertedSourceAttachmentId,
    })),
    approvalSteps: record.approvalSteps.map(toApprovalStep),
    histories: record.auditLogs.map((auditLog) =>
      toApprovalHistory(auditLog, record),
    ),
  };
}

function toApprovalStep(
  record: DocumentRecord["approvalSteps"][number],
): ApprovalStep {
  return {
    id: record.id,
    order: record.order,
    approverId: record.approverId,
    approver: {
      id: record.approver.id,
      name: record.approver.name,
      departmentName: record.approver.department.name,
      positionName: record.approver.position.name,
      profileImageStorageKey: record.approver.profileImageStorageKey,
      profileImageUpdatedAt:
        record.approver.profileImageUpdatedAt?.toISOString() ?? null,
    },
    actedBy: record.actedBy
      ? {
          id: record.actedBy.id,
          name: record.actedBy.name,
          departmentName: record.actedBy.department.name,
          positionName: record.actedBy.position.name,
          profileImageStorageKey: record.actedBy.profileImageStorageKey,
          profileImageUpdatedAt:
            record.actedBy.profileImageUpdatedAt?.toISOString() ?? null,
        }
      : null,
    proxyApprovedBy: record.proxyApprovedBy
      ? {
          id: record.proxyApprovedBy.id,
          name: record.proxyApprovedBy.name,
          departmentName: record.proxyApprovedBy.department.name,
          positionName: record.proxyApprovedBy.position.name,
          profileImageStorageKey:
            record.proxyApprovedBy.profileImageStorageKey,
          profileImageUpdatedAt:
            record.proxyApprovedBy.profileImageUpdatedAt?.toISOString() ?? null,
        }
      : null,
    decisionType: record.decisionType,
    status: approvalStepStatusMap[record.status],
    actedAt: record.actedAt?.toISOString() ?? null,
    comment: record.comment,
  };
}

function toApprovalHistory(
  record: DocumentRecord["auditLogs"][number],
  document: DocumentRecord,
): ApprovalHistory {
  return {
    id: record.id,
    actorId: record.actorId,
    actorName: record.actor.name,
    actor: {
      id: record.actor.id,
      name: record.actor.name,
      departmentName: record.actor.department.name,
      positionName: record.actor.position.name,
      profileImageStorageKey: record.actor.profileImageStorageKey,
      profileImageUpdatedAt:
        record.actor.profileImageUpdatedAt?.toISOString() ?? null,
    },
    action: getApprovalHistoryActionLabel(record),
    createdAt: record.createdAt.toISOString(),
    description: getApprovalHistoryDescription(record, document),
    metadata: record.metadata,
    ipAddress: record.ipAddress,
    userAgent: record.userAgent,
    browser: record.browser,
    os: record.os,
    device: record.device,
    country: record.country,
    region: record.region,
    city: record.city,
  };
}

function getApprovalHistoryActionLabel(record: {
  action: AuditAction;
  targetType: string;
  message?: string | null;
  metadata?: unknown;
}) {
  return isGeneratedPdfAuditLog(record)
    ? generatedPdfAuditActionLabel
    : auditActionLabels[record.action];
}

function getApprovalHistoryDescription(
  auditLog: DocumentRecord["auditLogs"][number],
  document: DocumentRecord,
) {
  const step = document.approvalSteps.find(
    (approvalStep) => approvalStep.id === auditLog.targetId,
  );

  if (!step) {
    return auditLog.message ?? "";
  }

  if (auditLog.action === AuditAction.APPROVE) {
    return createApprovalApprovedAuditMessage({
      approver: step.approver,
      drafter: document.drafter,
    });
  }

  if (auditLog.action === AuditAction.REJECT) {
    return createApprovalRejectedAuditMessage({
      approver: step.approver,
      drafter: document.drafter,
      comment: step.comment ?? undefined,
    });
  }

  if (auditLog.action === AuditAction.PROXY_APPROVE) {
    return createProxyApprovedAuditMessage({
      actor: auditLog.actor,
      approver: step.approver,
    });
  }

  if (auditLog.action === AuditAction.PROXY_REJECT) {
    return createProxyRejectedAuditMessage({
      actor: auditLog.actor,
      actorId: auditLog.actorId,
      step,
      comment: step.comment ?? undefined,
    });
  }

  return auditLog.message ?? "";
}
