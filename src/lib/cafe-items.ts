import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  createCafeItemExpirationSearchHref,
  formatCafeItemDateValue,
  getCafeItemChangeLogActionLabel,
  getCafeItemToday,
  getCafeItemUsageDday,
  isCafeItemCategory,
  isCafeItemChangeLogActionFilter,
  shiftCafeItemDate,
  type CafeItem,
  type CafeItemChangeLog,
  type CafeItemChangeLogAction,
  type CafeItemChangeLogActionFilter,
  type CafeItemChangeLogActor,
  type CafeItemChangeLogPage,
  type CafeItemCategoryFilter,
  type CafeItemDeadlineFilter,
  type CafeItemExpirationAlert,
  type CafeItemExpirationAlertItem,
  type CafeItemPage,
  type CafeItemSort,
} from "@/lib/cafe-items-core";

type CafeItemRecord = {
  id: string;
  name: string;
  category: string;
  purchasedAt: Date | string;
  priceWon: number | null;
  purchaseReason: string | null;
  expirationDate: Date | string | null;
  createdAt: Date;
};

type CafeItemChangeLogMetadata = {
  changeType?: unknown;
  itemName?: unknown;
  nextName?: unknown;
  previousName?: unknown;
};

const cafeItemChangeLogPageSize = 5;

export async function getCafeItemExpirationAlert(
  today = getCafeItemToday(),
): Promise<CafeItemExpirationAlert | null> {
  const items = await prisma.cafeItem.findMany({
    where: {
      category: "food",
      expirationDate: {
        gte: formatCafeItemDateTimeFilterValue(today),
        lte: formatCafeItemDateTimeFilterValue(shiftCafeItemDate(today, 31)),
      },
    },
    orderBy: [{ expirationDate: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      expirationDate: true,
      name: true,
    },
  });
  const alertItems = items.flatMap((item): CafeItemExpirationAlertItem[] => {
    if (!item.expirationDate) {
      return [];
    }

    const expirationDate = formatCafeItemDateValue(item.expirationDate);
    const usageDday = getCafeItemUsageDday(
      {
        category: "food",
        expirationDate,
        purchasedAt: today,
      },
      today,
    );

    return [
      {
        ddayLabel: usageDday.label,
        expirationDate,
        href: createCafeItemExpirationSearchHref(item.name),
        id: item.id,
        itemName: item.name,
      },
    ];
  });
  const firstItem = alertItems[0];

  if (!firstItem) {
    return null;
  }

  return {
    ddayLabel: firstItem.ddayLabel,
    href: firstItem.href,
    itemName: firstItem.itemName,
    items: alertItems,
  };
}

export async function getCafeItemPage({
  category,
  deadline,
  page,
  pageSize,
  query,
  sort,
  today,
}: {
  category: CafeItemCategoryFilter;
  deadline: CafeItemDeadlineFilter;
  page: number;
  pageSize: number;
  query: string;
  sort: CafeItemSort;
  today: string;
}): Promise<CafeItemPage> {
  const where = createCafeItemWhere({ category, deadline, query, today });
  const normalizedPageSize = Math.max(1, pageSize);
  const [items, total, expiredFoodCount] = await Promise.all([
    prisma.cafeItem.findMany({
      where,
      orderBy: createCafeItemOrderBy({ deadline, sort }),
      skip: (Math.max(page, 1) - 1) * normalizedPageSize,
      take: normalizedPageSize,
      select: {
        id: true,
        name: true,
        category: true,
        purchasedAt: true,
        priceWon: true,
        purchaseReason: true,
        expirationDate: true,
        createdAt: true,
      },
    }),
    prisma.cafeItem.count({ where }),
    prisma.cafeItem.count({
      where: createExpiredFoodWhere(today),
    }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / normalizedPageSize));
  const normalizedPage = clampPage(page, totalPages);

  if (normalizedPage !== page && total > 0) {
    return getCafeItemPage({
      category,
      deadline,
      page: normalizedPage,
      pageSize: normalizedPageSize,
      query,
      sort,
      today,
    });
  }

  return {
    expiredFoodCount,
    filters: {
      category,
      deadline,
      page: normalizedPage,
      query,
      sort,
    },
    items: items.map(mapCafeItem),
    page: normalizedPage,
    pageSize: normalizedPageSize,
    total,
    totalPages,
  };
}

export async function getCafeItemsExpiringWithin({
  days,
  today,
}: {
  days: number;
  today: string;
}): Promise<CafeItem[]> {
  const items = await prisma.cafeItem.findMany({
    where: {
      category: "food",
      expirationDate: {
        gte: formatCafeItemDateTimeFilterValue(today),
        lte: formatCafeItemDateTimeFilterValue(shiftCafeItemDate(today, days)),
      },
    },
    orderBy: [{ expirationDate: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      name: true,
      category: true,
      purchasedAt: true,
      priceWon: true,
      purchaseReason: true,
      expirationDate: true,
      createdAt: true,
    },
  });

  return items.map(mapCafeItem);
}

function createCafeItemOrderBy({
  deadline,
  sort,
}: {
  deadline: CafeItemDeadlineFilter;
  sort: CafeItemSort;
}): Prisma.CafeItemOrderByWithRelationInput[] {
  if (sort === "expirationAsc" || sort === "expirationDesc") {
    return [
      {
        expirationDate: {
          nulls: "last",
          sort: sort === "expirationAsc" ? "asc" : "desc",
        },
      },
      { createdAt: "desc" },
    ];
  }

  if (deadline === "dueSoon") {
    return [
      {
        expirationDate: {
          nulls: "last",
          sort: "asc",
        },
      },
      { createdAt: "desc" },
    ];
  }

  return [{ createdAt: "desc" }];
}

function createExpiredFoodWhere(today: string): Prisma.CafeItemWhereInput {
  return {
    category: "food",
    expirationDate: {
      lt: formatCafeItemDateTimeFilterValue(today),
    },
  };
}

export async function getCafeItemChangeLogPage({
  action,
  actorId,
  page,
  pageSize = cafeItemChangeLogPageSize,
  query,
}: {
  action: CafeItemChangeLogActionFilter;
  actorId: string;
  page: number;
  pageSize?: number;
  query: string;
}): Promise<CafeItemChangeLogPage> {
  const normalizedActorId = actorId.trim() || "all";
  const normalizedPageSize = Math.max(1, pageSize);
  const normalizedQuery = query.trim();
  const where = createCafeItemChangeLogWhere({
    action,
    actorId: normalizedActorId,
    query: normalizedQuery,
  });
  const [actors, total] = await Promise.all([
    getCafeItemChangeLogActors(),
    prisma.auditLog.count({ where }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / normalizedPageSize));
  const normalizedPage = clampPage(page, totalPages);
  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: {
      createdAt: "desc",
    },
    skip: (normalizedPage - 1) * normalizedPageSize,
    take: normalizedPageSize,
    select: {
      id: true,
      createdAt: true,
      message: true,
      metadata: true,
      targetId: true,
      actor: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  return {
    actors,
    filters: {
      action,
      actorId: normalizedActorId,
      page: normalizedPage,
      query: normalizedQuery,
    },
    logs: logs.map(mapCafeItemChangeLog),
    page: normalizedPage,
    pageSize: normalizedPageSize,
    total,
    totalPages,
  };
}

async function getCafeItemChangeLogActors(): Promise<CafeItemChangeLogActor[]> {
  const rows = await prisma.auditLog.findMany({
    distinct: ["actorId"],
    where: createCafeItemChangeLogWhere(),
    orderBy: {
      createdAt: "desc",
    },
    select: {
      actor: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  return rows
    .map((row) => row.actor)
    .sort((first, second) => first.name.localeCompare(second.name, "ko-KR"));
}

function createCafeItemWhere({
  category,
  deadline,
  query,
  today,
}: {
  category: CafeItemCategoryFilter;
  deadline: CafeItemDeadlineFilter;
  query: string;
  today: string;
}): Prisma.CafeItemWhereInput {
  const conditions: Prisma.CafeItemWhereInput[] = [];
  const normalizedQuery = query.trim();

  if (normalizedQuery) {
    conditions.push({
      OR: [
        {
          name: {
            contains: normalizedQuery,
            mode: "insensitive",
          },
        },
        {
          purchaseReason: {
            contains: normalizedQuery,
            mode: "insensitive",
          },
        },
      ],
    });
  }

  if (category !== "all") {
    conditions.push({
      category,
    });
  }

  if (deadline === "expired") {
    conditions.push({
      category: "food",
      expirationDate: {
        lt: formatCafeItemDateTimeFilterValue(today),
      },
    });
  } else if (deadline === "dueSoon") {
    conditions.push({
      category: "food",
      expirationDate: {
        gte: formatCafeItemDateTimeFilterValue(today),
        lte: formatCafeItemDateTimeFilterValue(shiftCafeItemDate(today, 30)),
      },
    });
  } else if (deadline === "over100") {
    conditions.push({
      NOT: {
        category: "food",
      },
      purchasedAt: {
        lte: formatCafeItemDateTimeFilterValue(shiftCafeItemDate(today, -100)),
      },
    });
  }

  return conditions.length > 0
    ? {
        AND: conditions,
      }
    : {};
}

function createCafeItemChangeLogWhere({
  action = "all",
  actorId = "all",
  query = "",
}: {
  action?: CafeItemChangeLogActionFilter;
  actorId?: string;
  query?: string;
} = {}): Prisma.AuditLogWhereInput {
  const conditions: Prisma.AuditLogWhereInput[] = [
    {
      OR: [
        {
          targetType: "CafeItem",
        },
        {
          metadata: {
            path: ["source"],
            equals: "cafe-item",
          },
        },
      ],
    },
  ];

  if (actorId !== "all") {
    conditions.push({
      actorId,
    });
  }

  if (action !== "all") {
    conditions.push({
      metadata: {
        path: ["changeType"],
        equals: `cafeItem.${action}`,
      },
    });
  }

  if (query) {
    const contains = {
      contains: query,
      mode: "insensitive" as const,
    };

    conditions.push({
      OR: [
        {
          message: contains,
        },
        {
          targetId: contains,
        },
        {
          actor: {
            OR: [
              {
                name: contains,
              },
              {
                email: contains,
              },
            ],
          },
        },
      ],
    });
  }

  return {
    AND: conditions,
  };
}

function formatCafeItemDateTimeFilterValue(value: string) {
  return `${value}T00:00:00.000Z`;
}

function mapCafeItem(item: CafeItemRecord): CafeItem {
  return {
    ...item,
    category: isCafeItemCategory(item.category) ? item.category : "other",
    expirationDate: item.expirationDate
      ? formatCafeItemDateValue(item.expirationDate)
      : null,
    createdAt: item.createdAt.toISOString(),
    purchasedAt: formatCafeItemDateValue(item.purchasedAt),
  };
}

function mapCafeItemChangeLog(log: {
  id: string;
  actor: CafeItemChangeLogActor;
  createdAt: Date;
  message: string | null;
  metadata: unknown;
  targetId: string;
}): CafeItemChangeLog {
  const metadata = getCafeItemChangeLogMetadata(log.metadata);
  const actionType = getCafeItemChangeLogActionType(metadata);
  const itemName = getCafeItemChangeLogItemName(metadata);

  return {
    id: log.id,
    actionType,
    actor: log.actor,
    createdAt: log.createdAt.toISOString(),
    itemId: log.targetId,
    itemName,
    message:
      log.message ||
      `${itemName} 물품을 ${getCafeItemChangeLogActionLabel(actionType)}했습니다.`,
  };
}

function getCafeItemChangeLogMetadata(
  metadata: unknown,
): CafeItemChangeLogMetadata {
  return metadata && typeof metadata === "object"
    ? (metadata as CafeItemChangeLogMetadata)
    : {};
}

function getCafeItemChangeLogActionType(
  metadata: CafeItemChangeLogMetadata,
): CafeItemChangeLogAction {
  const changeType =
    typeof metadata.changeType === "string" ? metadata.changeType : "";
  const action = changeType.replace("cafeItem.", "");

  return isCafeItemChangeLogActionFilter(action) && action !== "all"
    ? action
    : "update";
}

function getCafeItemChangeLogItemName(metadata: CafeItemChangeLogMetadata) {
  for (const value of [
    metadata.itemName,
    metadata.nextName,
    metadata.previousName,
  ]) {
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  return "카페 물품";
}

function clampPage(page: number, totalPages: number) {
  if (!Number.isInteger(page) || page < 1) {
    return 1;
  }

  return Math.min(page, totalPages);
}
