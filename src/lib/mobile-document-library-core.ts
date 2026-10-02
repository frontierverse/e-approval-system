import type { DocumentStatus, Prisma } from "@/generated/prisma/client";
import { getReadableDocumentWhere } from "@/lib/approval-permissions";

export type MobileDocumentFolder = "sent" | "completed" | "drafts";
export type MobileDocumentFilters = {
  folder: MobileDocumentFolder;
  status: "all" | "active" | "approved" | "rejected" | "draft" | "recalled";
  query: string;
  dateFrom: string;
  dateTo: string;
  sort: "latest" | "oldest";
  page: number;
};
export const mobileDocumentPageSize = 20;

const statuses = {
  sent: ["all", "active", "approved", "rejected"],
  completed: ["all", "approved", "rejected"],
  drafts: ["all", "draft", "recalled"],
} as const;

export function parseMobileDocumentFilters(params: URLSearchParams):
  | { ok: true; filters: MobileDocumentFilters }
  | { ok: false; error: string } {
  const folder = params.get("folder") ?? "sent";
  if (folder !== "sent" && folder !== "completed" && folder !== "drafts") {
    return { ok: false, error: "문서함 종류가 올바르지 않습니다." };
  }
  const status = params.get("status") ?? "all";
  if (!(statuses[folder] as readonly string[]).includes(status)) {
    return { ok: false, error: "이 문서함에서 사용할 수 없는 상태입니다." };
  }
  const query = (params.get("q") ?? "").trim();
  if (query.length > 100) return { ok: false, error: "검색어는 100자 이내로 입력하세요." };
  const dateFrom = params.get("dateFrom") ?? "";
  const dateTo = params.get("dateTo") ?? "";
  if (![dateFrom, dateTo].every(value => !value || isCalendarDate(value))) {
    return { ok: false, error: "기간은 실제 날짜를 YYYY-MM-DD 형식으로 입력하세요." };
  }
  if (dateFrom && dateTo && dateFrom > dateTo) {
    return { ok: false, error: "시작일은 종료일보다 늦을 수 없습니다." };
  }
  const sort = params.get("sort") ?? "latest";
  if (sort !== "latest" && sort !== "oldest") {
    return { ok: false, error: "정렬 기준이 올바르지 않습니다." };
  }
  const pageValue = params.get("page") ?? "1";
  if (!/^[1-9]\d*$/.test(pageValue) || !Number.isSafeInteger(Number(pageValue))) {
    return { ok: false, error: "페이지 번호가 올바르지 않습니다." };
  }
  return { ok: true, filters: {
    folder, status: status as MobileDocumentFilters["status"], query,
    dateFrom, dateTo, sort, page: Number(pageValue),
  } };
}

function isCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function mobileDocumentWhere(userId: string, filters: MobileDocumentFilters): Prisma.ApprovalDocumentWhereInput {
  const folderStatuses = { sent: ["SUBMITTED", "IN_PROGRESS", "APPROVED", "REJECTED"],
    completed: ["APPROVED", "REJECTED"], drafts: ["DRAFT", "RECALLED"] } as const;
  const statusValues = { active: ["SUBMITTED", "IN_PROGRESS"], approved: ["APPROVED"], rejected: ["REJECTED"],
    draft: ["DRAFT"], recalled: ["RECALLED"] } satisfies Record<Exclude<MobileDocumentFilters["status"], "all">, DocumentStatus[]>;
  const selectedStatuses = filters.status === "all" ? [...folderStatuses[filters.folder]] : statusValues[filters.status];
  const and: Prisma.ApprovalDocumentWhereInput[] = [
    // Mobile administrator accounts still use the employee read policy.
    filters.folder === "completed" ? getReadableDocumentWhere(userId, "USER") : { drafterId: userId },
    { status: { in: selectedStatuses } },
  ];
  if (filters.query) {
    const contains = { contains: filters.query, mode: "insensitive" } as const;
    and.push({ OR: [{ title: contains }, { documentNo: contains }, { category: contains }, { drafter: { name: contains } }] });
  }
  if (filters.dateFrom || filters.dateTo) {
    const range = {
      ...(filters.dateFrom ? { gte: new Date(`${filters.dateFrom}T00:00:00+09:00`) } : {}),
      ...(filters.dateTo ? { lte: new Date(`${filters.dateTo}T23:59:59.999+09:00`) } : {}),
    };
    and.push(filters.folder === "drafts" ? { updatedAt: range } : filters.folder === "sent" ? {
      OR: [{ submittedAt: { not: null, ...range } }, { submittedAt: null, createdAt: range }],
    } : {
      OR: [{ completedAt: { not: null, ...range } },
        { completedAt: null, submittedAt: { not: null, ...range } },
        { completedAt: null, submittedAt: null, createdAt: range }],
    });
  }
  return { AND: and };
}

export function mobileDocumentOrderBy(filters: MobileDocumentFilters): Prisma.ApprovalDocumentOrderByWithRelationInput[] {
  const direction = filters.sort === "oldest" ? "asc" : "desc";
  return [filters.folder === "drafts" ? { updatedAt: direction } :
    filters.folder === "completed" ? { completedAt: { sort: direction, nulls: "last" } } : { submittedAt: { sort: direction, nulls: "last" } },
  { createdAt: direction }, { id: direction }];
}
