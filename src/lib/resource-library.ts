import "server-only";

import { Prisma, UserRole } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  isResourceCategory,
  paginateResourceItems,
  type ResourceCategory,
  type ResourceCategoryFilter,
  type ResourceLibraryItem,
} from "@/lib/resource-library-core";

const resourcePostInclude = {
  author: {
    select: {
      id: true,
      name: true,
      department: {
        select: {
          name: true,
        },
      },
    },
  },
  attachments: {
    orderBy: {
      createdAt: "asc",
    },
    select: {
      id: true,
      originalName: true,
      size: true,
    },
  },
} satisfies Prisma.ResourcePostInclude;

type ResourcePostRecord = Prisma.ResourcePostGetPayload<{
  include: typeof resourcePostInclude;
}>;

export async function getResourceLibraryPage({
  category,
  currentUserId,
  currentUserRole,
  page,
  pageSize,
  query,
}: {
  category: ResourceCategoryFilter;
  currentUserId: string;
  currentUserRole: UserRole;
  page: number;
  pageSize: number;
  query: string;
}) {
  const where = getResourceWhere({ category, query });
  const [records, total] = await Promise.all([
    prisma.resourcePost.findMany({
      where,
      include: resourcePostInclude,
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
      skip: (Math.max(page, 1) - 1) * pageSize,
      take: pageSize,
    }),
    prisma.resourcePost.count({ where }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(page, 1), totalPages);

  if (currentPage !== page && total > 0) {
    return getResourceLibraryPage({
      category,
      currentUserId,
      currentUserRole,
      page: currentPage,
      pageSize,
      query,
    });
  }

  return {
    items: records.map((record) =>
      mapResourcePost(record, currentUserId, currentUserRole),
    ),
    page: currentPage,
    pageSize,
    total,
    totalPages,
  };
}

export async function getResourcePostForEdit({
  postId,
  userId,
  userRole,
}: {
  postId: string;
  userId: string;
  userRole: UserRole;
}) {
  const post = await prisma.resourcePost.findUnique({
    where: {
      id: postId,
    },
    include: {
      attachments: {
        orderBy: {
          createdAt: "asc",
        },
      },
    },
  });

  if (!post || !canManageResourcePost(userId, userRole, post.authorId)) {
    return null;
  }

  return post;
}

export async function getResourcePostById({
  currentUserId,
  currentUserRole,
  postId,
}: {
  currentUserId: string;
  currentUserRole: UserRole;
  postId: string;
}) {
  const record = await prisma.resourcePost.findUnique({
    where: {
      id: postId,
    },
    include: resourcePostInclude,
  });

  return record
    ? mapResourcePost(record, currentUserId, currentUserRole)
    : null;
}

export function canManageResourcePost(
  userId: string,
  userRole: UserRole,
  authorId: string,
) {
  return userRole === UserRole.ADMIN || userId === authorId;
}

function getResourceWhere({
  category,
  query,
}: {
  category: ResourceCategoryFilter;
  query: string;
}): Prisma.ResourcePostWhereInput {
  const and: Prisma.ResourcePostWhereInput[] = [];
  const normalizedQuery = query.trim();

  if (category !== "all") {
    and.push({ category });
  }

  if (normalizedQuery) {
    and.push({
      OR: [
        {
          title: {
            contains: normalizedQuery,
            mode: Prisma.QueryMode.insensitive,
          },
        },
        {
          summary: {
            contains: normalizedQuery,
            mode: Prisma.QueryMode.insensitive,
          },
        },
        {
          author: {
            name: {
              contains: normalizedQuery,
              mode: Prisma.QueryMode.insensitive,
            },
          },
        },
        {
          author: {
            department: {
              name: {
                contains: normalizedQuery,
                mode: Prisma.QueryMode.insensitive,
              },
            },
          },
        },
        {
          attachments: {
            some: {
              originalName: {
                contains: normalizedQuery,
                mode: Prisma.QueryMode.insensitive,
              },
            },
          },
        },
      ],
    });
  }

  return and.length > 0 ? { AND: and } : {};
}

function mapResourcePost(
  record: ResourcePostRecord,
  currentUserId: string,
  currentUserRole: UserRole,
): ResourceLibraryItem {
  const category = isResourceCategory(record.category)
    ? record.category
    : ("report" satisfies ResourceCategory);

  return {
    id: record.id,
    title: record.title,
    summary: record.summary,
    category,
    authorId: record.authorId,
    authorName: record.author.name,
    departmentName: record.author.department.name,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    viewCount: record.viewCount,
    pinned: record.pinned,
    attachments: record.attachments.map((attachment) => ({
      id: attachment.id,
      fileName: attachment.originalName,
      size: attachment.size,
    })),
    canManage: canManageResourcePost(
      currentUserId,
      currentUserRole,
      record.authorId,
    ),
  };
}

export { paginateResourceItems };
export type {
  ResourceAttachment,
  ResourceCategory,
  ResourceCategoryFilter,
  ResourceLibraryItem,
  ResourceLibraryPage,
} from "@/lib/resource-library-core";
