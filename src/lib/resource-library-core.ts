export type ResourceCategory = "corporation" | "cafe" | "bajaul" | "education";
export type ResourceEducationLevel = "common" | "high" | "middle";

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
  educationLevel: ResourceEducationLevel | null;
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
export type ResourceEducationLevelFilter = "all" | ResourceEducationLevel;

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

export const resourceEducationLevelLabels: Record<
  ResourceEducationLevel,
  string
> = {
  common: "공통",
  high: "고등",
  middle: "중등",
};

export const resourceEducationLevelOptions: {
  value: ResourceEducationLevelFilter;
  label: string;
}[] = [
  { value: "all", label: "대상" },
  { value: "common", label: resourceEducationLevelLabels.common },
  { value: "high", label: resourceEducationLevelLabels.high },
  { value: "middle", label: resourceEducationLevelLabels.middle },
];

export function getResourceCategoryDisplayLabel({
  category,
  educationLevel,
}: {
  category: ResourceCategory;
  educationLevel?: ResourceEducationLevel | null;
}) {
  const categoryLabel = resourceCategoryLabels[category];

  return category === "education" && educationLevel
    ? `${categoryLabel} · ${resourceEducationLevelLabels[educationLevel]}`
    : categoryLabel;
}

export const defaultResourceLibraryPageSize = 3;
export const educationResourceLibraryPageSize = 10;

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

export function isResourceEducationLevel(
  value: string,
): value is ResourceEducationLevel {
  return value === "common" || value === "high" || value === "middle";
}

export function normalizeResourceEducationLevel(
  value: string | undefined,
): ResourceEducationLevel | "" {
  return value && isResourceEducationLevel(value) ? value : "";
}

export function normalizeResourceEducationLevelFilter(
  value: string | undefined,
): ResourceEducationLevelFilter {
  return value && isResourceEducationLevel(value) ? value : "all";
}

export function getResourceLibraryPageSize(category: ResourceCategoryFilter) {
  return category === "education"
    ? educationResourceLibraryPageSize
    : defaultResourceLibraryPageSize;
}

export function getResourceSearchTerms(query: string) {
  return query.trim().split(/\s+/).filter(Boolean);
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
