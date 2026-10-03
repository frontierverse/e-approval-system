import type { Prisma } from "@/generated/prisma/client";
import { parseMobileDocumentFilters, type MobileDocumentFilters } from "@/lib/mobile-document-library-core";

export type MobileInboxFilters = Pick<MobileDocumentFilters, "query" | "dateFrom" | "dateTo" | "sort" | "page">;
export const mobileInboxPageSize = 20;

export function parseMobileInboxFilters(params: URLSearchParams):
  | { ok: true; filters: MobileInboxFilters }
  | { ok: false; error: string } {
  // Only inbox criteria are accepted; a client cannot change the folder or owner.
  const criteria = new URLSearchParams();
  for (const name of ["q", "dateFrom", "dateTo", "sort", "page"]) {
    const value = params.get(name);
    if (value !== null) criteria.set(name, value);
  }
  const parsed = parseMobileDocumentFilters(criteria);
  if (!parsed.ok) return parsed;
  const { query, dateFrom, dateTo, sort, page } = parsed.filters;
  return { ok: true, filters: { query, dateFrom, dateTo, sort, page } };
}

export function mobileInboxWhere(userId: string, filters: MobileInboxFilters): Prisma.ApprovalDocumentWhereInput {
  const and: Prisma.ApprovalDocumentWhereInput[] = [{
    status: { in: ["SUBMITTED", "IN_PROGRESS"] },
    approvalSteps: { some: { approverId: userId, status: "PENDING" } },
  }];
  if (filters.query) {
    const contains = { contains: filters.query, mode: "insensitive" } as const;
    and.push({ OR: [{ title: contains }, { documentNo: contains }, { category: contains }, { drafter: { name: contains } }] });
  }
  if (filters.dateFrom || filters.dateTo) {
    const range = {
      ...(filters.dateFrom ? { gte: new Date(`${filters.dateFrom}T00:00:00+09:00`) } : {}),
      ...(filters.dateTo ? { lte: new Date(`${filters.dateTo}T23:59:59.999+09:00`) } : {}),
    };
    and.push({ OR: [{ submittedAt: { not: null, ...range } }, { submittedAt: null, createdAt: range }] });
  }
  return { AND: and };
}

export function mobileInboxOrderBy(filters: MobileInboxFilters): Prisma.ApprovalDocumentOrderByWithRelationInput[] {
  const direction = filters.sort === "oldest" ? "asc" : "desc";
  return [{ submittedAt: { sort: direction, nulls: "last" } }, { createdAt: direction }, { id: direction }];
}
