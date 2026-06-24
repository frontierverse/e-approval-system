import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  isCafeItemCategory,
  shiftCafeItemDate,
  type CafeItem,
  type CafeItemCategoryFilter,
  type CafeItemDeadlineFilter,
  type CafeItemPage,
} from "@/lib/cafe-items-core";

type CafeItemRecord = {
  id: string;
  name: string;
  category: string;
  purchasedAt: string;
  priceWon: number | null;
  purchaseReason: string | null;
  expirationDate: string | null;
  createdAt: Date;
};

export async function getCafeItemPage({
  category,
  deadline,
  page,
  pageSize,
  query,
  today,
}: {
  category: CafeItemCategoryFilter;
  deadline: CafeItemDeadlineFilter;
  page: number;
  pageSize: number;
  query: string;
  today: string;
}): Promise<CafeItemPage> {
  const where = createCafeItemWhere({ category, deadline, query, today });
  const normalizedPageSize = Math.max(1, pageSize);
  const [items, total] = await Promise.all([
    prisma.cafeItem.findMany({
      where,
      orderBy:
        deadline === "dueSoon"
          ? [{ expirationDate: "asc" }, { createdAt: "desc" }]
          : [{ createdAt: "desc" }],
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
      today,
    });
  }

  return {
    filters: {
      category,
      deadline,
      page: normalizedPage,
      query,
    },
    items: items.map(mapCafeItem),
    page: normalizedPage,
    pageSize: normalizedPageSize,
    total,
    totalPages,
  };
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
        lt: today,
      },
    });
  } else if (deadline === "dueSoon") {
    conditions.push({
      category: "food",
      expirationDate: {
        gte: today,
        lte: shiftCafeItemDate(today, 30),
      },
    });
  } else if (deadline === "over100") {
    conditions.push({
      NOT: {
        category: "food",
      },
      purchasedAt: {
        lte: shiftCafeItemDate(today, -100),
      },
    });
  }

  return conditions.length > 0
    ? {
        AND: conditions,
      }
    : {};
}

function mapCafeItem(item: CafeItemRecord): CafeItem {
  return {
    ...item,
    category: isCafeItemCategory(item.category) ? item.category : "other",
    createdAt: item.createdAt.toISOString(),
  };
}

function clampPage(page: number, totalPages: number) {
  if (!Number.isInteger(page) || page < 1) {
    return 1;
  }

  return Math.min(page, totalPages);
}
