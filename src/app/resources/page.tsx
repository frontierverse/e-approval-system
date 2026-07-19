import type { Metadata } from "next";
import Link from "next/link";
import { PageTitle } from "@/components/page-title";
import { ResourceLibraryPageSection } from "@/components/resource-library-page-section";
import { getResourceLibraryPageAction } from "@/app/resources/actions";
import { requireUser } from "@/lib/auth";
import { buttonClass, buttonStyles } from "@/lib/button-styles";
import { getResourceLibraryPage } from "@/lib/resource-library";
import {
  getResourceLibraryPageSize,
  normalizeResourceCategoryFilter,
  normalizeResourceEducationLevelFilter,
  type ResourceCategory,
  type ResourceCategoryFilter,
  type ResourceEducationLevelFilter,
} from "@/lib/resource-library-core";

export const metadata: Metadata = {
  title: "자료실",
};

type ResourcesPageSearchParams = {
  q?: string;
  category?: string;
  level?: string;
  page?: string;
};

const resourcePageCopy: Record<
  ResourceCategory,
  {
    description: string;
    title: string;
  }
> = {
  corporation: {
    title: "법인 자료실",
    description: "법인 운영, 공문, 규정, 회의자료처럼 조직 공통 기준이 되는 자료를 보관합니다.",
  },
  bajaul: {
    title: "바자울 자료실",
    description: "바자울 운영, 현장 업무, 프로그램 진행에 필요한 자료를 모아둡니다.",
  },
  cafe: {
    title: "카페 자료실",
    description: "카페 운영, 매장 관리, 판매와 서비스 업무에 필요한 자료를 정리합니다.",
  },
  education: {
    title: "교육 자료실",
    description: "직원 교육, 청소년 지원, 프로그램 운영에 필요한 교육자료를 보관합니다.",
  },
};

export default async function ResourcesPage({
  searchParams,
}: {
  searchParams: Promise<ResourcesPageSearchParams>;
}) {
  const user = await requireUser();
  const filters = getFilters(await searchParams);
  const pageSize = getResourceLibraryPageSize(filters.category);
  const resourcePage = await getResourceLibraryPage({
    ...filters,
    currentUserId: user.id,
    currentUserRole: user.role,
    pageSize,
  });
  const pageCopy = getResourcePageCopy(filters.category);

  return (
    <>
      <PageTitle
        title={pageCopy.title}
        description={pageCopy.description}
        action={
          <Link
            href={getNewResourceHref(filters)}
            className={buttonClass(
              buttonStyles.base,
              buttonStyles.create,
              "h-10 px-4 text-sm",
            )}
          >
            자료 업로드
          </Link>
        }
      />

      <ResourceLibraryPageSection
        key={[
          filters.query,
          filters.category,
          filters.educationLevel,
          resourcePage.page,
        ].join(":")}
        filters={filters}
        loadPage={getResourceLibraryPageAction}
        resourcePage={resourcePage}
      />
    </>
  );
}

function getFilters(params: ResourcesPageSearchParams) {
  const category = normalizeCategory(params.category);

  return {
    query: String(params.q ?? "").trim(),
    category,
    educationLevel:
      category === "education"
        ? normalizeResourceEducationLevelFilter(params.level)
        : "all",
    page: normalizePage(params.page),
  };
}

function getResourcePageCopy(category: ResourceCategoryFilter) {
  if (category === "all") {
    return {
      title: "자료실",
      description: "법인, 카페, 바자울, 교육 자료를 구분해서 확인하는 공간입니다.",
    };
  }

  return resourcePageCopy[category];
}

function normalizeCategory(
  value: string | undefined,
): ResourceCategoryFilter {
  const category = normalizeResourceCategoryFilter(value);

  return category === "all" ? "corporation" : category;
}

function normalizePage(value: string | undefined) {
  const page = Number(value);

  return Number.isInteger(page) && page > 0 ? page : 1;
}

function getNewResourceHref({
  category,
  educationLevel,
}: {
  category: ResourceCategoryFilter;
  educationLevel: ResourceEducationLevelFilter;
}) {
  const params = new URLSearchParams();

  if (category !== "all") {
    params.set("category", category);
  }

  if (category === "education" && educationLevel !== "all") {
    params.set("level", educationLevel);
  }

  const queryString = params.toString();

  return queryString ? `/resources/new?${queryString}` : "/resources/new";
}
