import "server-only";

import { AuditAction, Prisma } from "@/generated/prisma/client";
import type { AuditActionValue } from "@/lib/audit-log-display";
import { getAttachmentPolicy } from "@/lib/attachment-policy";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type AdminAuditLogStatusFilter = "all" | AuditActionValue;
export type AdminLoginHistoryResultFilter = "all" | "success" | "failure";

export type AdminAuditLogFilters = {
  query: string;
  status: AdminAuditLogStatusFilter;
  actorId: string;
  dateFrom: string;
  dateTo: string;
  page: number;
  pageSize: number;
};

export type AdminLoginHistoryFilters = {
  query: string;
  result: AdminLoginHistoryResultFilter;
  userId: string;
  dateFrom: string;
  dateTo: string;
  page: number;
  pageSize: number;
};

export async function getAdminOverview() {
  await requireAdmin();

  const [
    totalUsers,
    activeUsers,
    totalDepartments,
    activeDepartments,
    totalPositions,
    activePositions,
    totalTemplates,
    activeTemplates,
    totalLoginHistories,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { status: "ACTIVE" } }),
    prisma.department.count(),
    prisma.department.count({ where: { isActive: true } }),
    prisma.position.count(),
    prisma.position.count({ where: { isActive: true } }),
    prisma.documentTemplate.count(),
    prisma.documentTemplate.count({ where: { isActive: true } }),
    prisma.loginHistory.count(),
  ]);

  return {
    users: {
      total: totalUsers,
      active: activeUsers,
    },
    departments: {
      total: totalDepartments,
      active: activeDepartments,
    },
    positions: {
      total: totalPositions,
      active: activePositions,
    },
    templates: {
      total: totalTemplates,
      active: activeTemplates,
    },
    loginHistories: {
      total: totalLoginHistories,
    },
  };
}

export async function getAdminUsers() {
  await requireAdmin();

  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      profileImageStorageKey: true,
      profileImageUpdatedAt: true,
      departmentId: true,
      positionId: true,
      department: {
        select: {
          name: true,
          sortOrder: true,
        },
      },
      position: {
        select: {
          name: true,
          level: true,
        },
      },
      _count: {
        select: {
          draftedDocuments: true,
          approvalSteps: true,
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

  return users.map((user) => ({
    ...user,
    profileImageUpdatedAt: user.profileImageUpdatedAt?.toISOString() ?? null,
  }));
}

export async function getAdminDepartments() {
  await requireAdmin();

  return prisma.department.findMany({
    select: {
      id: true,
      name: true,
      code: true,
      parentId: true,
      sortOrder: true,
      isActive: true,
      parent: {
        select: {
          name: true,
        },
      },
      _count: {
        select: {
          children: true,
          users: true,
        },
      },
    },
    orderBy: [
      {
        sortOrder: "asc",
      },
      {
        name: "asc",
      },
    ],
  });
}

export async function getAdminPositions() {
  await requireAdmin();

  return prisma.position.findMany({
    select: {
      id: true,
      name: true,
      level: true,
      sortOrder: true,
      isActive: true,
      _count: {
        select: {
          users: true,
        },
      },
    },
    orderBy: [
      {
        level: "desc",
      },
      {
        sortOrder: "asc",
      },
      {
        name: "asc",
      },
    ],
  });
}

export async function getAdminDocumentTemplates() {
  await requireAdmin();

  return prisma.documentTemplate.findMany({
    select: {
      id: true,
      name: true,
      description: true,
      isActive: true,
      _count: {
        select: {
          documents: true,
        },
      },
    },
    orderBy: [
      {
        isActive: "desc",
      },
      {
        name: "asc",
      },
    ],
  });
}

export async function getAdminAttachmentPolicy() {
  await requireAdmin();

  return getAttachmentPolicy();
}

export async function getAdminAuditLogPage(filters: AdminAuditLogFilters) {
  await requireAdmin();

  const where = getAdminAuditLogWhere(filters);
  const total = await prisma.auditLog.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / filters.pageSize));
  const page = Math.min(filters.page, totalPages);

  const logs = await prisma.auditLog.findMany({
    where,
    select: adminAuditLogSelect,
    orderBy: {
      createdAt: "desc",
    },
    skip: (page - 1) * filters.pageSize,
    take: filters.pageSize,
  });

  return {
    logs,
    total,
    page,
    pageSize: filters.pageSize,
    totalPages,
  };
}

export async function getAdminAuditActors() {
  await requireAdmin();

  return prisma.user.findMany({
    where: {
      auditLogs: {
        some: {},
      },
    },
    select: {
      id: true,
      name: true,
      email: true,
    },
    orderBy: [
      {
        name: "asc",
      },
      {
        email: "asc",
      },
    ],
  });
}

export async function getAdminLoginHistoryPage(
  filters: AdminLoginHistoryFilters,
) {
  await requireAdmin();

  const where = getAdminLoginHistoryWhere(filters);
  const total = await prisma.loginHistory.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / filters.pageSize));
  const page = Math.min(filters.page, totalPages);

  const histories = await prisma.loginHistory.findMany({
    where,
    select: adminLoginHistorySelect,
    orderBy: {
      createdAt: "desc",
    },
    skip: (page - 1) * filters.pageSize,
    take: filters.pageSize,
  });

  return {
    histories,
    total,
    page,
    pageSize: filters.pageSize,
    totalPages,
  };
}

export async function getAdminLoginHistoryUsers() {
  await requireAdmin();

  return prisma.user.findMany({
    where: {
      loginHistories: {
        some: {},
      },
    },
    select: {
      id: true,
      name: true,
      email: true,
    },
    orderBy: [
      {
        name: "asc",
      },
      {
        email: "asc",
      },
    ],
  });
}

function getAdminAuditLogWhere(filters: AdminAuditLogFilters) {
  const and: Prisma.AuditLogWhereInput[] = [];

  if (filters.query) {
    const contains = {
      contains: filters.query,
      mode: Prisma.QueryMode.insensitive,
    };

    and.push({
      OR: [
        { message: contains },
        { targetType: contains },
        { targetId: contains },
        {
          actor: {
            OR: [{ name: contains }, { email: contains }],
          },
        },
        {
          document: {
            OR: [{ title: contains }, { documentNo: contains }],
          },
        },
      ],
    });
  }

  if (filters.status !== "all") {
    and.push({
      action: AuditAction[filters.status],
    });
  }

  if (filters.actorId !== "all") {
    and.push({
      actorId: filters.actorId,
    });
  }

  const createdAt: Prisma.DateTimeFilter<"AuditLog"> = {};

  if (filters.dateFrom) {
    createdAt.gte = getKoreanDateBoundary(filters.dateFrom, "start");
  }

  if (filters.dateTo) {
    createdAt.lte = getKoreanDateBoundary(filters.dateTo, "end");
  }

  if (createdAt.gte || createdAt.lte) {
    and.push({ createdAt });
  }

  return and.length > 0 ? { AND: and } : {};
}

function getAdminLoginHistoryWhere(filters: AdminLoginHistoryFilters) {
  const and: Prisma.LoginHistoryWhereInput[] = [];

  if (filters.query) {
    const contains = {
      contains: filters.query,
      mode: Prisma.QueryMode.insensitive,
    };

    and.push({
      OR: [
        { attemptedName: contains },
        { ipAddress: contains },
        { userAgent: contains },
        { browser: contains },
        { os: contains },
        { device: contains },
        { country: contains },
        { region: contains },
        { city: contains },
        { failureReason: contains },
        {
          user: {
            is: {
              OR: [{ name: contains }, { email: contains }],
            },
          },
        },
      ],
    });
  }

  if (filters.result !== "all") {
    and.push({
      success: filters.result === "success",
    });
  }

  if (filters.userId !== "all") {
    and.push({
      userId: filters.userId,
    });
  }

  const createdAt: Prisma.DateTimeFilter<"LoginHistory"> = {};

  if (filters.dateFrom) {
    createdAt.gte = getKoreanDateBoundary(filters.dateFrom, "start");
  }

  if (filters.dateTo) {
    createdAt.lte = getKoreanDateBoundary(filters.dateTo, "end");
  }

  if (createdAt.gte || createdAt.lte) {
    and.push({ createdAt });
  }

  return and.length > 0 ? { AND: and } : {};
}

function getKoreanDateBoundary(date: string, boundary: "start" | "end") {
  return new Date(
    boundary === "start"
      ? `${date}T00:00:00.000+09:00`
      : `${date}T23:59:59.999+09:00`,
  );
}

const adminAuditLogSelect = {
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
  document: {
    select: {
      title: true,
      documentNo: true,
    },
  },
} satisfies Prisma.AuditLogSelect;

const adminLoginHistorySelect = {
  id: true,
  attemptedName: true,
  success: true,
  failureReason: true,
  ipAddress: true,
  userAgent: true,
  browser: true,
  os: true,
  device: true,
  country: true,
  region: true,
  city: true,
  createdAt: true,
  user: {
    select: {
      id: true,
      name: true,
      email: true,
      profileImageStorageKey: true,
      profileImageUpdatedAt: true,
    },
  },
} satisfies Prisma.LoginHistorySelect;

export async function getAdminAuditLogs() {
  const page = await getAdminAuditLogPage({
    query: "",
    status: "all",
    actorId: "all",
    dateFrom: "",
    dateTo: "",
    page: 1,
    pageSize: 30,
  });

  return page.logs;
}

export async function getAdminReferenceData() {
  await requireAdmin();

  const [departments, positions] = await Promise.all([
    prisma.department.findMany({
      select: {
        id: true,
        name: true,
        isActive: true,
      },
      orderBy: [
        {
          sortOrder: "asc",
        },
        {
          name: "asc",
        },
      ],
    }),
    prisma.position.findMany({
      select: {
        id: true,
        name: true,
        level: true,
        isActive: true,
      },
      orderBy: [
        {
          level: "desc",
        },
        {
          sortOrder: "asc",
        },
      ],
    }),
  ]);

  return {
    departments,
    positions,
  };
}
