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
import { AppModal } from "@/components/app-modal";
import { CafeItemRow } from "@/components/cafe-item-row";
import { buttonClass, buttonStyles } from "@/lib/button-styles";
import {
  cafeItemCategories,
  cafeItemDeadlineFilters,
  createCafeItemExpiredHref,
  createCafeItemExpiringFoodPrintHref,
  formatCafeItemDate,
  getCafeItemUsageDday,
  normalizeCafeItemCategory,
  normalizeCafeItemDeadlineFilter,
  normalizeCafeItemPage,
  normalizeCafeItemSort,
  type CafeItem,
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
  const [isHeldItemsOpen, setIsHeldItemsOpen] = useState(false);
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
    <>
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
              <button
                type="button"
                aria-haspopup="dialog"
                disabled={currentItemPage.heldItems.length === 0}
                onClick={() => setIsHeldItemsOpen(true)}
                className={[
                  "inline-flex h-8 items-center gap-2 rounded-md border px-3 text-xs font-semibold transition",
                  currentItemPage.heldItems.length > 0
                    ? "border-[#e6cf91] bg-[#fff4d8] text-[#7a5200] hover:bg-[#ffedbf]"
                    : "cursor-not-allowed border-[#cfd6e3] bg-[#f7f9fc] text-[#8a95a6]",
                ].join(" ")}
              >
                보류 처리 {currentItemPage.heldItems.length}개
              </button>
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
          <div>
            <p className="border-b border-[var(--border)] px-5 py-2 text-xs text-[var(--text-muted)] lg:hidden">
              표를 좌우로 스크롤하면 모든 상세 정보를 확인할 수 있습니다.
            </p>
            <div className="relative overflow-x-auto">
              <table className="w-max min-w-[1352px] max-w-none border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-[#eef1f5] bg-[#f7f9fc] text-xs font-semibold text-[#394150]">
                    <th className="sticky left-0 z-20 w-14 bg-[var(--surface-muted)] px-4 py-3.5 text-center">
                      번호
                    </th>
                    <th className="sticky left-14 z-20 w-[12rem] border-r border-[var(--border)] bg-[var(--surface-muted)] px-6 py-3.5">
                      물품명
                    </th>
                    <th className="w-[9rem] px-6 py-3.5">구매일</th>
                    <th className="w-[8rem] px-6 py-3.5">종류</th>
                    <th className="w-[10rem] px-6 py-3.5">사용 기한</th>
                    <SortableExpirationHeader
                      filters={currentItemPage.filters}
                    />
                    <th className="w-[8rem] px-6 py-3.5">가격</th>
                    <th className="w-[6rem] px-6 py-3.5">구매 사유</th>
                    <th className="w-[12rem] px-6 py-3.5">보류 사유</th>
                    <th className="w-[10rem] px-6 py-3.5">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eef1f5]">
                  {currentItemPage.items.map((item, index) => (
                    <CafeItemRow
                      key={item.id}
                      item={item}
                      rowNumber={firstItem + index}
                      today={currentToday}
                    />
                  ))}
                </tbody>
              </table>
            </div>
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

      {isHeldItemsOpen ? (
        <CafeItemHeldItemsModal
          heldItems={currentItemPage.heldItems}
          onClose={() => setIsHeldItemsOpen(false)}
          today={currentToday}
        />
      ) : null}
    </>
  );
}

export function CafeItemHeldItemsModal({
  heldItems,
  onClose,
  today,
}: {
  heldItems: CafeItem[];
  onClose: () => void;
  today: string;
}) {
  return (
    <AppModal
      className="max-w-4xl"
      labelledBy="cafe-held-items-title"
      onClose={onClose}
    >
      <div className="flex max-h-[calc(100vh-3rem)] min-h-0 flex-col">
        <header className="shrink-0 border-b border-[#eef1f5] px-6 py-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-[#7a5200]">
                카페 물품 보류 현황
              </p>
              <h3
                id="cafe-held-items-title"
                className="mt-1 text-xl font-semibold text-[#16181d]"
              >
                보류 처리된 물품
              </h3>
              <p className="mt-1 text-sm text-[#697386]">
                폐기하지 않고 보관 중인 물품 {heldItems.length}개입니다.
              </p>
            </div>
            <span className="rounded-md border border-[#e6cf91] bg-[#fff4d8] px-3 py-1.5 text-sm font-semibold text-[#7a5200]">
              총 {heldItems.length}개
            </span>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-auto px-6 py-5">
          {heldItems.length > 0 ? (
            <div className="overflow-x-auto rounded-md border border-[#e2e7ee]">
              <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-[#e2e7ee] bg-[#f7f9fc] text-xs font-semibold text-[#394150]">
                    <th className="px-4 py-3">물품명</th>
                    <th className="w-36 px-4 py-3">유통기한</th>
                    <th className="w-28 px-4 py-3">경과 상태</th>
                    <th className="w-[45%] px-4 py-3">보류 사유</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#eef1f5]">
                  {heldItems.map((item) => {
                    const usageDday = getCafeItemUsageDday(item, today);

                    return (
                      <tr key={item.id} className="align-top">
                        <td className="px-4 py-4 font-semibold text-[#16181d]">
                          {item.name}
                        </td>
                        <td className="px-4 py-4 text-[#394150]">
                          {formatCafeItemDate(item.expirationDate)}
                        </td>
                        <td className="px-4 py-4">
                          <span className="inline-flex rounded-md border border-[#efb4b4] bg-[#fff1f1] px-2 py-1 text-xs font-semibold text-[#a13a3a]">
                            {usageDday.label}
                          </span>
                        </td>
                        <td className="whitespace-pre-line break-words px-4 py-4 leading-6 text-[#394150] [overflow-wrap:anywhere]">
                          {item.expirationHoldReason}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="rounded-md border border-dashed border-[#cfd6e3] bg-[#fbfcfd] px-4 py-8 text-center text-sm text-[#697386]">
              보류 처리된 물품이 없습니다.
            </p>
          )}
        </div>

        <footer className="flex shrink-0 justify-end border-t border-[#eef1f5] bg-white px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className={buttonClass(
              buttonStyles.base,
              buttonStyles.neutral,
              "h-10 px-4 text-sm",
            )}
          >
            닫기
          </button>
        </footer>
      </div>
    </AppModal>
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
        className="inline-flex h-11 items-center justify-center rounded-md border border-[var(--border-strong)] bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--brand)] transition hover:border-[var(--brand)] hover:bg-[var(--brand-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 sm:ml-auto"
      >
        유통기한 15일 이내 PDF
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
