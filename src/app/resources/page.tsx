import Link from "next/link";
import { PageTitle } from "@/components/page-title";
import { ResourceLibraryFilterControls } from "@/components/resource-library-filter-controls";
import { ResourceLibraryList } from "@/components/resource-library-list";
import { requireUser } from "@/lib/auth";
import { buttonClass, buttonStyles } from "@/lib/button-styles";
import { getResourceLibraryPage } from "@/lib/resource-library";
import {
  normalizeResourceCategoryFilter,
  type ResourceCategory,
  type ResourceCategoryFilter,
} from "@/lib/resource-library-core";

type ResourcesPageSearchParams = {
  q?: string;
  category?: string;
  page?: string;
};

const pageSize = 3;
const resourcePageCopy: Record<
  ResourceCategory,
  {
    description: string;
    title: string;
  }
> = {
  corporation: {
    title: "법인 자료실",
    description:
      "법인 운영, 공문, 규정, 회의자료처럼 조직 공통 기준이 되는 자료를 보관합니다.",
  },
  bajaul: {
    title: "바자울 자료실",
    description:
      "바자울 운영, 현장 업무, 프로그램 진행에 필요한 자료를 모아둡니다.",
  },
  cafe: {
    title: "카페 자료실",
    description:
      "카페 운영, 매장 관리, 판매와 서비스 업무에 필요한 자료를 정리합니다.",
  },
  education: {
    title: "교육 자료실",
    description:
      "직원 교육, 청소년 지도, 프로그램 운영에 필요한 교육자료를 보관합니다.",
  },
};

export default async function ResourcesPage({
  searchParams,
}: {
  searchParams: Promise<ResourcesPageSearchParams>;
}) {
  const user = await requireUser();
  const filters = getFilters(await searchParams);
  const resourcePage = await getResourceLibraryPage({
    ...filters,
    currentUserId: user.id,
    currentUserRole: user.role,
    pageSize,
  });
  const hasActiveFilter = Boolean(filters.query);
  const firstItemNumber =
    resourcePage.total - (resourcePage.page - 1) * resourcePage.pageSize;
  const pageCopy = getResourcePageCopy(filters.category);

  return (
    <>
      <PageTitle
        title={pageCopy.title}
        description={pageCopy.description}
        action={
          <Link
            href={`/resources/new?category=${filters.category}`}
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

      <section className="mb-4 rounded-md border border-[#d9dee7] bg-white p-4">
        <ResourceLibraryFilterControls
          category={filters.category}
          query={filters.query}
        />

        <ResourceListSummary
          page={resourcePage.page}
          pageSize={resourcePage.pageSize}
          total={resourcePage.total}
        />
      </section>

      <ResourceLibraryList
        items={resourcePage.items}
        firstItemNumber={firstItemNumber}
        hasActiveFilter={hasActiveFilter}
      />

      <ResourcePagination
        category={filters.category}
        page={resourcePage.page}
        query={filters.query}
        totalPages={resourcePage.totalPages}
      />
    </>
  );
}

function getFilters(params: ResourcesPageSearchParams) {
  return {
    query: String(params.q ?? "").trim(),
    category: normalizeCategory(params.category),
    page: normalizePage(params.page),
  };
}

function getResourcePageCopy(category: ResourceCategoryFilter) {
  if (category === "all") {
    return {
      title: "자료실",
      description:
        "법인, 카페, 바자울, 교육 자료를 구분해서 확인하는 공간입니다.",
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

function ResourceListSummary({
  page,
  pageSize,
  total,
}: {
  page: number;
  pageSize: number;
  total: number;
}) {
  const firstItem = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastItem = Math.min(page * pageSize, total);

  return (
    <p className="mt-3 text-xs text-[#697386]">
      {total > 0
        ? `${total}건 중 ${firstItem}-${lastItem}건 표시`
        : "표시할 자료가 없습니다."}
    </p>
  );
}

function ResourcePagination({
  category,
  page,
  query,
  totalPages,
}: {
  category: ResourceCategoryFilter;
  page: number;
  query: string;
  totalPages: number;
}) {
  if (totalPages <= 1) {
    return null;
  }

  return (
    <nav
      aria-label="자료실 페이지"
      className="mt-4 flex flex-wrap items-center justify-between gap-3"
    >
      <p className="text-sm text-[#697386]">
        {page} / {totalPages} 페이지
      </p>
      <div className="flex gap-2">
        <ResourcePaginationLink
          disabled={page <= 1}
          href={getResourcePageHref({ category, page: page - 1, query })}
        >
          이전
        </ResourcePaginationLink>
        <ResourcePaginationLink
          disabled={page >= totalPages}
          href={getResourcePageHref({ category, page: page + 1, query })}
        >
          다음
        </ResourcePaginationLink>
      </div>
    </nav>
  );
}

function ResourcePaginationLink({
  children,
  disabled,
  href,
}: {
  children: React.ReactNode;
  disabled: boolean;
  href: string;
}) {
  if (disabled) {
    return (
      <span className="inline-flex h-10 items-center justify-center rounded-md border border-[#d9dee7] bg-[#f7f9fc] px-4 text-sm font-semibold text-[#9aa4b2]">
        {children}
      </span>
    );
  }

  return (
    <Link
      href={href}
      className={buttonClass(
        buttonStyles.base,
        buttonStyles.neutral,
        "h-10 px-4 text-sm",
      )}
    >
      {children}
    </Link>
  );
}

function getResourcePageHref({
  category,
  page,
  query,
}: {
  category: ResourceCategoryFilter;
  page: number;
  query: string;
}) {
  const params = new URLSearchParams();

  if (query) {
    params.set("q", query);
  }

  if (category !== "all") {
    params.set("category", category);
  }

  if (page > 1) {
    params.set("page", String(page));
  }

  const queryString = params.toString();

  return queryString ? `/resources?${queryString}` : "/resources";
}
