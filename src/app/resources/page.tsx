import Link from "next/link";
import { PageTitle } from "@/components/page-title";
import { ResourceLibraryList } from "@/components/resource-library-list";
import { requireUser } from "@/lib/auth";
import { buttonClass, buttonStyles } from "@/lib/button-styles";
import { getResourceLibraryPage } from "@/lib/resource-library";
import {
  normalizeResourceCategoryFilter,
  resourceCategoryOptions,
  type ResourceCategoryFilter,
} from "@/lib/resource-library-core";

type ResourcesPageSearchParams = {
  q?: string;
  category?: string;
  page?: string;
};

const pageSize = 3;

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
  const hasActiveFilter = Boolean(filters.query || filters.category !== "all");
  const firstItemNumber =
    resourcePage.total - (resourcePage.page - 1) * resourcePage.pageSize;

  return (
    <>
      <PageTitle
        title="자료실"
        description="직원들이 업무 자료와 공유사항을 확인하는 공간입니다."
        action={
          <Link
            href="/resources/new"
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
        <form className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_12rem_auto_auto]">
          <div>
            <label
              htmlFor="resourceSearch"
              className="text-xs font-semibold text-[#697386]"
            >
              검색
            </label>
            <input
              id="resourceSearch"
              name="q"
              type="search"
              defaultValue={filters.query}
              placeholder="제목, 내용, 작성자, 첨부파일"
              className="mt-2 h-10 w-full rounded-md border border-[#cfd6e3] bg-white px-3 text-sm outline-none transition placeholder:text-[#9aa4b2] focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
            />
          </div>

          <div>
            <label
              htmlFor="resourceCategory"
              className="text-xs font-semibold text-[#697386]"
            >
              분류
            </label>
            <select
              id="resourceCategory"
              name="category"
              defaultValue={filters.category}
              className="mt-2 h-10 w-full rounded-md border border-[#cfd6e3] bg-white px-3 text-sm outline-none transition focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
            >
              {resourceCategoryOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              className={buttonClass(
                buttonStyles.base,
                buttonStyles.filter,
                "h-10 w-full px-4 text-sm",
              )}
            >
              검색
            </button>
          </div>

          <div className="flex items-end">
            {hasActiveFilter ? (
              <Link
                href="/resources"
                className={buttonClass(
                  buttonStyles.base,
                  buttonStyles.neutral,
                  "h-10 w-full px-4 text-sm",
                )}
              >
                초기화
              </Link>
            ) : null}
          </div>
        </form>

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

function normalizeCategory(
  value: string | undefined,
): ResourceCategoryFilter {
  return normalizeResourceCategoryFilter(value);
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
