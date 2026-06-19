import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  isYouthRuleCategory,
  normalizeYouthRuleCategory,
  type YouthRule,
  type YouthRuleCategoryFilter,
  type YouthRuleTarget,
  type YouthRuleTargetFilter,
} from "@/lib/youth-management-core";

export type { YouthRuleCategoryFilter, YouthRuleTargetFilter };

export type YouthRulesResult = {
  category: YouthRuleCategoryFilter;
  page: number;
  pageSize: number;
  rules: YouthRule[];
  target: YouthRuleTargetFilter;
  total: number;
  totalPages: number;
};

type YouthRuleRecord = {
  id: string;
  category: string;
  detail: string;
  targetYouthId: string | null;
  targetYouthName: string | null;
  createdAt: Date | string;
};

const youthRulesPageSize = 10;

export async function getYouthRules({
  category = "all",
  page = 1,
  pageSize = youthRulesPageSize,
  target = "all",
}: {
  category?: YouthRuleCategoryFilter;
  page?: number;
  pageSize?: number;
  target?: YouthRuleTargetFilter;
} = {}): Promise<YouthRulesResult> {
  const normalizedCategory = isYouthRuleCategory(category) ? category : "all";
  const normalizedTarget = normalizeYouthRuleTargetFilter(target);
  const normalizedPageSize = Math.max(1, pageSize);
  const whereClause = createYouthRuleWhereClause({
    category: normalizedCategory,
    target: normalizedTarget,
  });
  const countRows = await prisma.$queryRaw<Array<{ total: number }>>(
    Prisma.sql`
      SELECT COUNT(*)::int AS "total"
      FROM "YouthRule" rule
      ${whereClause}
    `,
  );
  const total = countRows[0]?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / normalizedPageSize));
  const normalizedPage = clampPage(page, totalPages);
  const offset = (normalizedPage - 1) * normalizedPageSize;
  const rules = await prisma.$queryRaw<YouthRuleRecord[]>(
    Prisma.sql`
    SELECT
      rule."id",
      rule."category",
      rule."detail",
      rule."targetYouthId",
      youth."name" AS "targetYouthName",
      rule."createdAt"
    FROM "YouthRule" rule
    LEFT JOIN "Youth" youth ON youth."id" = rule."targetYouthId"
    ${whereClause}
    ORDER BY rule."createdAt" DESC, rule."id" DESC
    LIMIT ${normalizedPageSize}
    OFFSET ${offset}
    `,
  );

  return {
    category: normalizedCategory,
    page: normalizedPage,
    pageSize: normalizedPageSize,
    rules: rules.map(mapYouthRule),
    target: normalizedTarget,
    total,
    totalPages,
  };
}

export async function getYouthRuleTargets(): Promise<YouthRuleTarget[]> {
  return prisma.$queryRaw<YouthRuleTarget[]>`
    SELECT "id", "name"
    FROM "Youth"
    ORDER BY "name" ASC
  `;
}

export function mapYouthRule(record: YouthRuleRecord): YouthRule {
  return {
    id: record.id,
    category: normalizeYouthRuleCategory(record.category),
    detail: record.detail,
    targetYouthId: record.targetYouthId,
    targetYouthName: record.targetYouthName,
    createdAt:
      record.createdAt instanceof Date
        ? record.createdAt.toISOString()
        : new Date(record.createdAt).toISOString(),
  };
}

function clampPage(page: number, totalPages: number) {
  if (!Number.isInteger(page) || page < 1) {
    return 1;
  }

  return Math.min(page, totalPages);
}

function createYouthRuleWhereClause({
  category,
  target,
}: {
  category: YouthRuleCategoryFilter;
  target: YouthRuleTargetFilter;
}) {
  const conditions: Prisma.Sql[] = [];

  if (category !== "all") {
    conditions.push(Prisma.sql`rule."category" = ${category}`);
  }

  if (target === "common") {
    conditions.push(Prisma.sql`rule."targetYouthId" IS NULL`);
  } else if (target !== "all") {
    conditions.push(Prisma.sql`rule."targetYouthId" = ${target}`);
  }

  return conditions.length > 0
    ? Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`
    : Prisma.empty;
}

function normalizeYouthRuleTargetFilter(
  target: YouthRuleTargetFilter,
): YouthRuleTargetFilter {
  const normalizedTarget = target.trim();

  return normalizedTarget ? normalizedTarget : "all";
}
