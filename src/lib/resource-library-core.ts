export type ResourceCategory = "corporation" | "cafe" | "bajaul" | "education";

export type ResourceAttachment = {
  id?: string;
  fileName: string;
  mimeType?: string | null;
  size: number;
};

export type ResourceUser = {
  id: string;
  name: string;
  departmentName: string;
  positionName?: string;
  profileImageStorageKey?: string | null;
  profileImageUpdatedAt?: string | null;
};

export type ResourceLibraryItem = {
  id: string;
  title: string;
  summary: string;
  category: ResourceCategory;
  authorId: string;
  authorName: string;
  departmentName: string;
  author: ResourceUser;
  createdAt: string;
  updatedAt: string;
  viewCount: number;
  pinned: boolean;
  attachments: ResourceAttachment[];
  canManage?: boolean;
};

export type ResourceViewer = {
  userId: string;
  name: string;
  departmentName: string;
  positionName: string;
  profileImageStorageKey?: string | null;
  profileImageUpdatedAt?: string | null;
  firstViewedAt: string;
  lastViewedAt: string;
  viewCount: number;
};

export type ResourcePostDetail = ResourceLibraryItem & {
  viewers: ResourceViewer[];
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
  corporation: "법인",
  cafe: "카페",
  bajaul: "바자울",
  education: "교육",
};

export const resourceCategoryOptions: {
  value: ResourceCategoryFilter;
  label: string;
}[] = [
  { value: "all", label: "전체" },
  { value: "corporation", label: resourceCategoryLabels.corporation },
  { value: "cafe", label: resourceCategoryLabels.cafe },
  { value: "bajaul", label: resourceCategoryLabels.bajaul },
  { value: "education", label: resourceCategoryLabels.education },
];

export function isResourceCategory(value: string): value is ResourceCategory {
  return (
    value === "corporation" ||
    value === "cafe" ||
    value === "bajaul" ||
    value === "education"
  );
}

export function normalizeResourceCategory(value: string | undefined) {
  return value && isResourceCategory(value) ? value : "bajaul";
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
