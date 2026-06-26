"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useState,
  useTransition,
  type MouseEvent,
  type ReactNode,
} from "react";
import { CafeItemRow } from "@/components/cafe-item-row";
import { buttonClass, buttonStyles } from "@/lib/button-styles";
import {
  cafeItemCategories,
  cafeItemDeadlineFilters,
  createCafeItemExpiredHref,
  createCafeItemExpiringFoodPrintHref,
  formatCafeItemDate,
  normalizeCafeItemCategory,
  normalizeCafeItemDeadlineFilter,
  normalizeCafeItemPage,
  normalizeCafeItemSort,
  type CafeItemActionResult,
  type CafeItemCategoryFilter,
  type CafeItemDeadlineFilter,
  type CafeItemPage,
  type CafeItemPageFilters,
  type CafeItemSort,
} from "@/lib/cafe-items-core";

type CafeItemListProps = {
  itemPage: CafeItemPage;
  loadItemPage?: (
    filters: CafeItemPageFilters,
  ) => Promise<CafeItemActionResult<{ itemPage: CafeItemPage; today: string }>>;
  today: string;
};

export function CafeItemList({
  itemPage,
  loadItemPage,
  today,
}: CafeItemListProps) {
  const [itemPageState, setItemPageState] = useState(itemPage);
  const [todayState, setTodayState] = useState(today);
  const [pageError, setPageError] = useState("");
  const [pendingPage, setPendingPage] = useState<number | null>(null);
  const [isPagePending, startPageTransition] = useTransition();

  const loadPage = useCallback(
    (
      page: number,
      {
        filters,
        updateHistory = true,
      }: { filters?: CafeItemPageFilters; updateHistory?: boolean } = {},
    ) => {
      if (!loadItemPage) {
        return;
      }

      const nextFilters = filters ?? {
        ...itemPageState.filters,
        page,
      };

      setPendingPage(page);

      startPageTransition(async () => {
        try {
          const result = await loadItemPage(nextFilters);

          if (!result.ok) {
            setPageError(result.error);
            return;
          }

          setItemPageState(result.data.itemPage);
          setTodayState(result.data.today);
          setPageError("");

          if (updateHistory) {
            window.history.pushState(
              { cafeItemPage: result.data.itemPage.page },
              "",
              getCafeItemPageHref(
                result.data.itemPage.filters,
                result.data.itemPage.page,
              ),
            );
          }
        } finally {
          setPendingPage(null);
        }
      });
    },
    [itemPageState.filters, loadItemPage],
  );

  useEffect(() => {
    if (!loadItemPage) {
      return;
    }

    function loadPageFromHistory() {
      const filters = getCafeItemFiltersFromLocation();

      loadPage(filters.page, {
        filters,
        updateHistory: false,
      });
    }

    window.addEventListener("popstate", loadPageFromHistory);

    return () => window.removeEventListener("popstate", loadPageFromHistory);
  }, [loadItemPage, loadPage]);

  const currentItemPage = itemPageState;
  const currentToday = todayState;
  const firstItem =
    currentItemPage.total === 0
      ? 0
      : (currentItemPage.page - 1) * currentItemPage.pageSize + 1;
  const lastItem = Math.min(
    currentItemPage.page * currentItemPage.pageSize,
    currentItemPage.total,
  );

  return (
    <section
      aria-busy={isPagePending || undefined}
      className="rounded-md border border-[#d9dee7] bg-white shadow-sm"
    >
      <div className="border-b border-[#eef1f5] px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[#16181d]">
              물품 목록
            </h2>
            <p className="mt-1 text-sm text-[#697386]">
              {currentItemPage.total > 0
                ? `${currentItemPage.total}건 중 ${firstItem}-${lastItem}건 표시`
                : "등록된 물품이 없습니다."}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Link
              href={createCafeItemExpiredHref()}
              className={[
                "inline-flex h-8 items-center gap-2 rounded-md border px-3 text-xs font-semibold transition",
                currentItemPage.expiredFoodCount > 0
                  ? "border-[#efb4b4] bg-[#fff1f1] text-[#a13a3a] hover:bg-[#ffe7e7]"
                  : "border-[#cfd6e3] bg-[#f7f9fc] text-[#394150] hover:bg-[#eef2f7]",
              ].join(" ")}
            >
              유통기한 경과 식품 {currentItemPage.expiredFoodCount}개
            </Link>
            <span className="rounded-md border border-[#cfd6e3] bg-[#f7f9fc] px-3 py-1.5 text-xs font-semibold text-[#394150]">
              기준일 {formatCafeItemDate(currentToday)}
            </span>
          </div>
        </div>

        <CafeItemFilterControls filters={currentItemPage.filters} />
      </div>

      {currentItemPage.items.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-max min-w-[1152px] max-w-none border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-[#eef1f5] bg-[#f7f9fc] text-xs font-semibold text-[#394150]">
                <th className="w-[12rem] px-6 py-3.5">물품</th>
                <th className="w-[9rem] px-6 py-3.5">구매일</th>
                <th className="w-[8rem] px-6 py-3.5">종류</th>
                <th className="w-[10rem] px-6 py-3.5">사용 기한</th>
                <SortableExpirationHeader filters={currentItemPage.filters} />
                <th className="w-[8rem] px-6 py-3.5">가격</th>
                <th className="w-[6rem] px-6 py-3.5">구매 사유</th>
                <th className="w-[10rem] px-6 py-3.5">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eef1f5]">
              {currentItemPage.items.map((item) => (
                <CafeItemRow key={item.id} item={item} today={currentToday} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mx-5 my-5 rounded-md border border-dashed border-[#cfd6e3] bg-[#fbfcfd] px-4 py-8 text-sm text-[#697386]">
          조건에 맞는 물품이 없습니다.
        </p>
      )}

      {pageError ? (
        <p className="mx-5 mb-4 rounded-md border border-[#efb4b4] bg-[#fff7f7] px-4 py-3 text-sm font-semibold text-[#a13a3a]">
          {pageError}
        </p>
      ) : null}

      <CafeItemPagination
        itemPage={currentItemPage}
        onPageChange={loadItemPage ? loadPage : undefined}
        pendingPage={pendingPage}
      />
    </section>
  );
}

function CafeItemFilterControls({
  filters,
}: {
  filters: CafeItemPage["filters"];
}) {
  const hasFilters =
    filters.query ||
    filters.category !== "all" ||
    filters.deadline !== "all" ||
    filters.sort !== "latest";

  return (
    <form className="mt-4 flex min-w-0 flex-wrap items-end gap-2">
      {filters.sort !== "latest" ? (
        <input type="hidden" name="sort" value={filters.sort} />
      ) : null}
      <label className="flex min-w-0 items-center gap-3">
        <span className="shrink-0 text-xs font-semibold text-[#697386]">
          검색
        </span>
        <input
          name="q"
          defaultValue={filters.query}
          placeholder="물품명 또는 구매 사유"
          className="h-10 w-56 min-w-0 rounded-md border border-[#cfd6e3] bg-white px-3 text-sm outline-none transition placeholder:text-[#9aa4b2] focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
        />
      </label>
      <label className="flex min-w-0 items-center gap-3">
        <span className="shrink-0 text-xs font-semibold text-[#697386]">
          종류
        </span>
        <select
          name="category"
          defaultValue={filters.category}
          className="h-10 w-36 min-w-0 rounded-md border border-[#cfd6e3] bg-white px-3 text-sm outline-none transition focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
        >
          <option value="all">전체 종류</option>
          {cafeItemCategories.map((category) => (
            <option key={category.value} value={category.value}>
              {category.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-w-0 items-center gap-3">
        <span className="shrink-0 text-xs font-semibold text-[#697386]">
          사용 기한
        </span>
        <select
          name="deadline"
          defaultValue={filters.deadline}
          className="h-10 w-44 min-w-0 rounded-md border border-[#cfd6e3] bg-white px-3 text-sm outline-none transition focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
        >
          {cafeItemDeadlineFilters.map((filter) => (
            <option key={filter.value} value={filter.value}>
              {filter.label}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        className={buttonClass(
          buttonStyles.base,
          buttonStyles.filter,
          "h-10 px-4 text-sm",
        )}
      >
        적용
      </button>
      {hasFilters ? (
        <Link
          href="/work-schedule/cafe"
          className={buttonClass(
            buttonStyles.base,
            buttonStyles.neutral,
            "h-10 px-4 text-sm",
          )}
        >
          초기화
        </Link>
      ) : null}
      <Link
        href={createCafeItemExpiringFoodPrintHref()}
        target="_blank"
        rel="noreferrer"
        className="inline-flex h-10 items-center justify-center rounded-md border border-[#0f5553] bg-[#196b69] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#12514f] focus:outline-none focus:ring-2 focus:ring-[#d7eceb] sm:ml-auto"
      >
        PDF 출력 · 유통기한 15일 이내
      </Link>
    </form>
  );
}

function SortableExpirationHeader({
  filters,
}: {
  filters: CafeItemPage["filters"];
}) {
  const isActive =
    filters.sort === "expirationAsc" || filters.sort === "expirationDesc";
  const nextSort =
    filters.sort === "expirationAsc" ? "expirationDesc" : "expirationAsc";
  const nextSortLabel =
    nextSort === "expirationAsc" ? "오름차순" : "내림차순";

  return (
    <th
      scope="col"
      aria-sort={
        isActive
          ? filters.sort === "expirationAsc"
            ? "ascending"
            : "descending"
          : "none"
      }
      className="w-[9rem] px-6 py-3.5"
    >
      <Link
        href={getCafeItemSortHref(filters, nextSort)}
        aria-label={`유통기한 ${nextSortLabel} 정렬`}
        className="-mx-2 inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-semibold text-[#394150] transition hover:bg-[#eaf0f7] hover:text-[#196b69] focus:outline-none focus:ring-2 focus:ring-[#d7eceb]"
      >
        <span>유통기한</span>
        <span
          aria-hidden="true"
          className="inline-flex w-3 justify-center text-[11px] text-[#697386]"
        >
          {isActive ? (filters.sort === "expirationAsc" ? "↑" : "↓") : "↕"}
        </span>
      </Link>
    </th>
  );
}

function CafeItemPagination({
  itemPage,
  onPageChange,
  pendingPage,
}: {
  itemPage: CafeItemPage;
  onPageChange?: (page: number) => void;
  pendingPage: number | null;
}) {
  if (itemPage.totalPages <= 1) {
    return null;
  }

  return (
    <nav
      aria-label="카페 물품 목록 페이지"
      className="flex flex-wrap items-center justify-between gap-3 border-t border-[#eef1f5] px-5 py-4"
    >
      <p className="text-sm text-[#697386]">
        {itemPage.page} / {itemPage.totalPages} 페이지
      </p>
      <div className="flex gap-2">
        <CafeItemPaginationLink
          disabled={itemPage.page <= 1}
          href={getCafeItemPageHref(itemPage.filters, itemPage.page - 1)}
          onPageChange={onPageChange}
          page={itemPage.page - 1}
          pending={pendingPage === itemPage.page - 1}
        >
          이전
        </CafeItemPaginationLink>
        <CafeItemPaginationLink
          disabled={itemPage.page >= itemPage.totalPages}
          href={getCafeItemPageHref(itemPage.filters, itemPage.page + 1)}
          onPageChange={onPageChange}
          page={itemPage.page + 1}
          pending={pendingPage === itemPage.page + 1}
        >
          다음
        </CafeItemPaginationLink>
      </div>
    </nav>
  );
}

function CafeItemPaginationLink({
  children,
  disabled,
  href,
  onPageChange,
  page,
  pending,
}: {
  children: ReactNode;
  disabled: boolean;
  href: string;
  onPageChange?: (page: number) => void;
  page: number;
  pending: boolean;
}) {
  if (disabled) {
    return (
      <span className="inline-flex h-10 items-center justify-center rounded-md border border-[#d9dee7] bg-[#f7f9fc] px-4 text-sm font-semibold text-[#9aa4b2]">
        {children}
      </span>
    );
  }

  return (
    <a
      href={href}
      aria-busy={pending || undefined}
      onClick={(event) => {
        if (!onPageChange || shouldUseNativeNavigation(event)) {
          return;
        }

        event.preventDefault();
        onPageChange(page);
      }}
      className={buttonClass(
        buttonStyles.base,
        buttonStyles.neutral,
        "h-10 px-4 text-sm",
      )}
    >
      {children}
    </a>
  );
}

function getCafeItemPageHref(
  filters: {
    category: CafeItemCategoryFilter;
    deadline: CafeItemDeadlineFilter;
    query: string;
    sort: CafeItemSort;
  },
  page: number,
) {
  const params = new URLSearchParams();

  if (filters.query) {
    params.set("q", filters.query);
  }

  if (filters.category !== "all") {
    params.set("category", filters.category);
  }

  if (filters.deadline !== "all") {
    params.set("deadline", filters.deadline);
  }

  if (filters.sort !== "latest") {
    params.set("sort", filters.sort);
  }

  if (page > 1) {
    params.set("page", String(page));
  }

  const queryString = params.toString();

  return queryString ? `/work-schedule/cafe?${queryString}` : "/work-schedule/cafe";
}

function getCafeItemFiltersFromLocation(): CafeItemPageFilters {
  const params = new URLSearchParams(window.location.search);

  return {
    category: normalizeCafeItemCategory(params.get("category") ?? undefined),
    deadline: normalizeCafeItemDeadlineFilter(
      params.get("deadline") ?? undefined,
    ),
    page: normalizeCafeItemPage(params.get("page") ?? undefined),
    query: String(params.get("q") ?? "").trim(),
    sort: normalizeCafeItemSort(params.get("sort") ?? undefined),
  };
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

function getCafeItemSortHref(
  filters: {
    category: CafeItemCategoryFilter;
    deadline: CafeItemDeadlineFilter;
    query: string;
  },
  sort: CafeItemSort,
) {
  return getCafeItemPageHref(
    {
      ...filters,
      sort,
    },
    1,
  );
}
