"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import type { MouseEvent } from "react";
import { EducationResourceQuickFilters } from "@/components/education-resource-quick-filters";
import { ResourceLibraryFilterControls } from "@/components/resource-library-filter-controls";
import { ResourceLibraryList } from "@/components/resource-library-list";
import { buttonClass, buttonStyles } from "@/lib/button-styles";
import {
  normalizeResourceCategoryFilter,
  normalizeResourceEducationLevelFilter,
  type ResourceCategoryFilter,
  type ResourceEducationLevelFilter,
  type ResourceLibraryPage,
} from "@/lib/resource-library-core";

type ResourceLibraryPageFilters = {
  category: ResourceCategoryFilter;
  educationLevel: ResourceEducationLevelFilter;
  page: number;
  query: string;
};

type ResourceLibraryPageActionResult = Promise<
  | {
      ok: true;
      data: {
        resourcePage: ResourceLibraryPage;
      };
    }
  | { ok: false; error: string }
>;

type ResourceLibraryPageSectionProps = {
  filters: ResourceLibraryPageFilters;
  loadPage: (
    filters: ResourceLibraryPageFilters,
  ) => ResourceLibraryPageActionResult;
  resourcePage: ResourceLibraryPage;
};

export function ResourceLibraryPageSection({
  filters,
  loadPage,
  resourcePage,
}: ResourceLibraryPageSectionProps) {
  const [pageState, setPageState] = useState({
    filters,
    resourcePage,
  });
  const [pageError, setPageError] = useState("");
  const [pendingPage, setPendingPage] = useState<number | null>(null);
  const [isPagePending, startPageTransition] = useTransition();

  const loadResourcePage = useCallback(
    (
      nextPage: number,
      options?: {
        filters?: ResourceLibraryPageFilters;
        updateHistory?: boolean;
      },
    ) => {
      const nextFilters = {
        ...pageState.filters,
        ...(options?.filters ?? {}),
        page: nextPage,
      };
      const updateHistory = options?.updateHistory ?? true;

      setPendingPage(nextPage);
      startPageTransition(async () => {
        try {
          const result = await loadPage(nextFilters);

          if (!result.ok) {
            setPageError(result.error);
            return;
          }

          const { resourcePage: nextResourcePage } = result.data;
          const normalizedFilters = {
            ...nextFilters,
            page: nextResourcePage.page,
          };

          setPageState({
            filters: normalizedFilters,
            resourcePage: nextResourcePage,
          });
          setPageError("");

          if (updateHistory) {
            window.history.pushState(
              { resourceLibraryPage: nextResourcePage.page },
              "",
              getResourcePageHref({
                category: normalizedFilters.category,
                educationLevel: normalizedFilters.educationLevel,
                page: nextResourcePage.page,
                query: normalizedFilters.query,
              }),
            );
          }
        } finally {
          setPendingPage(null);
        }
      });
    },
    [loadPage, pageState.filters],
  );

  useEffect(() => {
    function loadFromHistory() {
      if (window.location.pathname !== "/resources") {
        return;
      }

      const nextFilters = getResourceFiltersFromLocation();

      loadResourcePage(nextFilters.page, {
        filters: nextFilters,
        updateHistory: false,
      });
    }

    window.addEventListener("popstate", loadFromHistory);

    return () => window.removeEventListener("popstate", loadFromHistory);
  }, [loadResourcePage]);

  const currentFilters = pageState.filters;
  const currentPage = pageState.resourcePage;
  const hasActiveFilter = Boolean(
    currentFilters.query || currentFilters.educationLevel !== "all",
  );
  const firstItemNumber =
    currentPage.total - (currentPage.page - 1) * currentPage.pageSize;

  return (
    <>
      {pageError ? (
        <p className="mb-4 rounded-md border border-[#f4b5b5] bg-[#fff5f5] px-4 py-3 text-sm font-semibold text-[#b42318]">
          {pageError}
        </p>
      ) : null}

      <div className={isPagePending ? "opacity-60" : undefined}>
        <ResourceLibraryList
          compact={currentFilters.category === "education"}
          firstItemNumber={firstItemNumber}
          hasActiveFilter={hasActiveFilter}
          items={currentPage.items}
          toolbar={
            <ResourceListToolbar
              category={currentFilters.category}
              educationLevel={currentFilters.educationLevel}
              page={currentPage.page}
              pageSize={currentPage.pageSize}
              query={currentFilters.query}
              total={currentPage.total}
            />
          }
        />
      </div>

      <ResourcePagination
        category={currentFilters.category}
        educationLevel={currentFilters.educationLevel}
        isPending={isPagePending}
        onPageChange={loadResourcePage}
        page={currentPage.page}
        pendingPage={pendingPage}
        query={currentFilters.query}
        totalPages={currentPage.totalPages}
      />
    </>
  );
}

function ResourceListToolbar({
  category,
  educationLevel,
  page,
  pageSize,
  query,
  total,
}: {
  category: ResourceCategoryFilter;
  educationLevel: ResourceEducationLevelFilter;
  page: number;
  pageSize: number;
  query: string;
  total: number;
}) {
  return (
    <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0 flex-1">
        <ResourceLibraryFilterControls
          category={category}
          query={query}
          leadingControl={
            category === "education" ? (
              <EducationResourceQuickFilters
                educationLevel={educationLevel}
                query={query}
              />
            ) : null
          }
        />
      </div>

      <ResourceListSummary page={page} pageSize={pageSize} total={total} />
    </div>
  );
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
    <p className="shrink-0 text-xs text-[#697386]">
      {total > 0
        ? `${total}건 중 ${firstItem}-${lastItem}건 표시`
        : "표시할 자료가 없습니다."}
    </p>
  );
}

function ResourcePagination({
  category,
  educationLevel,
  isPending,
  onPageChange,
  page,
  pendingPage,
  query,
  totalPages,
}: {
  category: ResourceCategoryFilter;
  educationLevel: ResourceEducationLevelFilter;
  isPending: boolean;
  onPageChange: (page: number) => void;
  page: number;
  pendingPage: number | null;
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
          disabled={page <= 1 || isPending}
          href={getResourcePageHref({
            category,
            educationLevel,
            page: page - 1,
            query,
          })}
          onPageChange={onPageChange}
          page={page - 1}
          pending={pendingPage === page - 1}
        >
          이전
        </ResourcePaginationLink>
        <ResourcePaginationLink
          disabled={page >= totalPages || isPending}
          href={getResourcePageHref({
            category,
            educationLevel,
            page: page + 1,
            query,
          })}
          onPageChange={onPageChange}
          page={page + 1}
          pending={pendingPage === page + 1}
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
  onPageChange,
  page,
  pending,
}: {
  children: React.ReactNode;
  disabled: boolean;
  href: string;
  onPageChange: (page: number) => void;
  page: number;
  pending: boolean;
}) {
  if (disabled) {
    return (
      <span className="inline-flex h-10 items-center justify-center rounded-md border border-[#d9dee7] bg-[#f7f9fc] px-4 text-sm font-semibold text-[#9aa4b2]">
        {pending ? "..." : children}
      </span>
    );
  }

  return (
    <a
      href={href}
      aria-busy={pending || undefined}
      className={buttonClass(
        buttonStyles.base,
        buttonStyles.neutral,
        "h-10 px-4 text-sm",
      )}
      onClick={(event) => {
        if (shouldUseNativeNavigation(event)) {
          return;
        }

        event.preventDefault();
        onPageChange(page);
      }}
    >
      {pending ? "..." : children}
    </a>
  );
}

function getResourcePageHref({
  category,
  educationLevel,
  page,
  query,
}: {
  category: ResourceCategoryFilter;
  educationLevel: ResourceEducationLevelFilter;
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

  if (category === "education" && educationLevel !== "all") {
    params.set("level", educationLevel);
  }

  if (page > 1) {
    params.set("page", String(page));
  }

  const queryString = params.toString();

  return queryString ? `/resources?${queryString}` : "/resources";
}

function getResourceFiltersFromLocation(): ResourceLibraryPageFilters {
  const params = new URLSearchParams(window.location.search);
  const category = normalizeCategory(params.get("category") ?? undefined);

  return {
    category,
    educationLevel:
      category === "education"
        ? normalizeResourceEducationLevelFilter(params.get("level") ?? undefined)
        : "all",
    page: normalizePositivePage(params.get("page")),
    query: String(params.get("q") ?? "").trim(),
  };
}

function normalizeCategory(
  value: string | undefined,
): ResourceCategoryFilter {
  const category = normalizeResourceCategoryFilter(value);

  return category === "all" ? "corporation" : category;
}

function normalizePositivePage(value: string | null | undefined) {
  const page = Number(value);

  return Number.isInteger(page) && page > 0 ? page : 1;
}

function shouldUseNativeNavigation(event: MouseEvent<HTMLAnchorElement>) {
  return (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  );
}
