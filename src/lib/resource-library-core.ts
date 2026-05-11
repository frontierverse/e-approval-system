export type ResourceCategory = "notice" | "manual" | "form" | "report";

export type ResourceAttachment = {
  id?: string;
  fileName: string;
  size: number;
};

export type ResourceLibraryItem = {
  id: string;
  title: string;
  summary: string;
  category: ResourceCategory;
  authorId: string;
  authorName: string;
  departmentName: string;
  createdAt: string;
  updatedAt: string;
  viewCount: number;
  pinned: boolean;
  attachments: ResourceAttachment[];
  canManage?: boolean;
};

export type ResourceCategoryFilter = "all" | ResourceCategory;

export type ResourceLibraryPage = {
  items: ResourceLibraryItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export const resourceCategoryLabels: Record<ResourceCategory, string> = {
  notice: "공지",
  manual: "업무 매뉴얼",
  form: "공통 양식",
  report: "업무 자료",
};

export const resourceCategoryOptions: {
  value: ResourceCategoryFilter;
  label: string;
}[] = [
  { value: "all", label: "전체" },
  { value: "notice", label: resourceCategoryLabels.notice },
  { value: "manual", label: resourceCategoryLabels.manual },
  { value: "form", label: resourceCategoryLabels.form },
  { value: "report", label: resourceCategoryLabels.report },
];

export function isResourceCategory(value: string): value is ResourceCategory {
  return value === "notice" || value === "manual" || value === "form" || value === "report";
}

export function normalizeResourceCategory(value: string | undefined) {
  return value && isResourceCategory(value) ? value : "report";
}

export function normalizeResourceCategoryFilter(
  value: string | undefined,
): ResourceCategoryFilter {
  return value && isResourceCategory(value) ? value : "all";
}

export function paginateResourceItems({
  items,
  page,
  pageSize,
}: {
  items: ResourceLibraryItem[];
  page: number;
  pageSize: number;
}): ResourceLibraryPage {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(page, 1), totalPages);
  const start = (currentPage - 1) * pageSize;

  return {
    items: items.slice(start, start + pageSize),
    page: currentPage,
    pageSize,
    total,
    totalPages,
  };
}
