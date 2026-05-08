import "server-only";

import { getAttachmentPolicy } from "@/lib/attachment-policy";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { status: "ACTIVE" } }),
    prisma.department.count(),
    prisma.department.count({ where: { isActive: true } }),
    prisma.position.count(),
    prisma.position.count({ where: { isActive: true } }),
    prisma.documentTemplate.count(),
    prisma.documentTemplate.count({ where: { isActive: true } }),
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

export async function getAdminAuditLogs() {
  await requireAdmin();

  return prisma.auditLog.findMany({
    select: {
      id: true,
      action: true,
      targetType: true,
      targetId: true,
      message: true,
      createdAt: true,
      actor: {
        select: {
          name: true,
          email: true,
        },
      },
      document: {
        select: {
          title: true,
          documentNo: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 30,
  });
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
