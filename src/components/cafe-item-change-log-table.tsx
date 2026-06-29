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
import { buttonClass, buttonStyles } from "@/lib/button-styles";
import {
  cafeItemChangeLogActionFilters,
  getCafeItemChangeLogActionLabel,
  normalizeCafeItemChangeLogAction,
  normalizeCafeItemPage,
  type CafeItemActionResult,
  type CafeItemChangeLogAction,
  type CafeItemChangeLogPage,
  type CafeItemChangeLogPageFilters,
  type CafeItemPageFilters,
} from "@/lib/cafe-items-core";

type CafeItemChangeLogTableProps = {
  itemFilters: CafeItemPageFilters;
  loadLogPage?: (
    filters: CafeItemChangeLogPageFilters,
  ) => Promise<CafeItemActionResult<{ logPage: CafeItemChangeLogPage }>>;
  logPage: CafeItemChangeLogPage;
};

export function CafeItemChangeLogTable({
  itemFilters,
  loadLogPage,
  logPage,
}: CafeItemChangeLogTableProps) {
  const [logPageState, setLogPageState] = useState(logPage);
  const [pageError, setPageError] = useState("");
  const [pendingPage, setPendingPage] = useState<number | null>(null);
  const [isPagePending, startPageTransition] = useTransition();
  const loadPage = useCallback(
    (
      page: number,
      {
        filters,
        updateHistory = true,
      }: { filters?: CafeItemChangeLogPageFilters; updateHistory?: boolean } = {},
    ) => {
      if (!loadLogPage) {
        return;
      }

      const nextFilters = filters ?? {
        ...logPageState.filters,
        page,
      };

      setPendingPage(page);

      startPageTransition(async () => {
        try {
          const result = await loadLogPage(nextFilters);

          if (!result.ok) {
            setPageError(result.error);
            return;
          }

          setLogPageState(result.data.logPage);
          setPageError("");

          if (updateHistory) {
            window.history.pushState(
              { cafeItemLogPage: result.data.logPage.page },
              "",
              createCafeManagementHref({
                itemFilters,
                logFilters: result.data.logPage.filters,
              }),
            );
          }
        } finally {
          setPendingPage(null);
        }
      });
    },
    [itemFilters, loadLogPage, logPageState.filters],
  );

  useEffect(() => {
    if (!loadLogPage) {
      return;
    }

    function loadPageFromHistory() {
      const filters = getCafeItemChangeLogFiltersFromLocation();

      loadPage(filters.page, {
        filters,
        updateHistory: false,
      });
    }

    window.addEventListener("popstate", loadPageFromHistory);

    return () => window.removeEventListener("popstate", loadPageFromHistory);
  }, [loadLogPage, loadPage]);

  const currentLogPage = logPageState;
  const firstLog =
    currentLogPage.total === 0
      ? 0
      : (currentLogPage.page - 1) * currentLogPage.pageSize + 1;
  const lastLog = Math.min(
    currentLogPage.page * currentLogPage.pageSize,
    currentLogPage.total,
  );
  const hasFilters =
    currentLogPage.filters.action !== "all" ||
    currentLogPage.filters.actorId !== "all" ||
    currentLogPage.filters.query !== "";

  return (
    <section
      aria-busy={isPagePending || undefined}
      className="rounded-md border border-[#d9dee7] bg-white shadow-sm"
    >
      <div className="border-b border-[#eef1f5] px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[#16181d]">
              변경내역
            </h2>
            <p className="mt-1 text-sm text-[#697386]">
              {currentLogPage.total > 0
                ? `${currentLogPage.total}건 중 ${firstLog}-${lastLog}건 표시`
                : "표시할 변경내역이 없습니다."}
            </p>
          </div>
        </div>

        <form className="mt-4 flex min-w-0 flex-wrap items-end gap-2">
          <ItemFilterHiddenFields filters={itemFilters} />
          <input type="hidden" name="logPage" value="1" />
          <label className="flex min-w-0 items-center gap-3">
            <span className="shrink-0 text-xs font-semibold text-[#697386]">
              검색
            </span>
            <input
              name="logQ"
              defaultValue={currentLogPage.filters.query}
              placeholder="물품명, 내용, 직원"
              className="h-10 w-56 min-w-0 rounded-md border border-[#cfd6e3] bg-white px-3 text-sm outline-none transition placeholder:text-[#9aa4b2] focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
            />
          </label>
          <label className="flex min-w-0 items-center gap-3">
            <span className="shrink-0 text-xs font-semibold text-[#697386]">
              작업
            </span>
            <select
              name="logAction"
              defaultValue={currentLogPage.filters.action}
              className="h-10 w-36 min-w-0 rounded-md border border-[#cfd6e3] bg-white px-3 text-sm outline-none transition focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
            >
              {cafeItemChangeLogActionFilters.map((filter) => (
                <option key={filter.value} value={filter.value}>
                  {filter.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 items-center gap-3">
            <span className="shrink-0 text-xs font-semibold text-[#697386]">
              직원
            </span>
            <select
              name="logStaff"
              defaultValue={currentLogPage.filters.actorId}
              className="h-10 w-40 min-w-0 rounded-md border border-[#cfd6e3] bg-white px-3 text-sm outline-none transition focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
            >
              <option value="all">전체 직원</option>
              {currentLogPage.actors.map((actor) => (
                <option key={actor.id} value={actor.id}>
                  {actor.name}
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
              href={createCafeManagementHref({
                itemFilters,
                logFilters: {
                  action: "all",
                  actorId: "all",
                  page: 1,
                  query: "",
                },
              })}
              className={buttonClass(
                buttonStyles.base,
                buttonStyles.neutral,
                "h-10 px-4 text-sm",
              )}
            >
              초기화
            </Link>
          ) : null}
        </form>
      </div>

      {currentLogPage.logs.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-[#eef1f5] bg-[#f7f9fc] text-xs font-semibold text-[#394150]">
                <th className="w-[10rem] px-6 py-3.5">일시</th>
                <th className="w-[7rem] px-6 py-3.5">작업</th>
                <th className="w-[14rem] px-6 py-3.5">물품</th>
                <th className="w-[10rem] px-6 py-3.5">직원</th>
                <th className="min-w-[22rem] px-6 py-3.5">내용</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eef1f5]">
              {currentLogPage.logs.map((log) => (
                <tr key={log.id} className="align-top">
                  <td className="px-6 py-5 leading-6 text-[#394150]">
                    {formatDateTime(log.createdAt)}
                  </td>
                  <td className="px-6 py-5">
                    <span
                      className={[
                        "inline-flex h-8 items-center rounded-md border px-2.5 text-xs font-semibold",
                        getActionBadgeClassName(log.actionType),
                      ].join(" ")}
                    >
                      {getCafeItemChangeLogActionLabel(log.actionType)}
                    </span>
                  </td>
                  <td className="px-6 py-5">
                    <p className="break-words font-semibold text-[#16181d] [overflow-wrap:anywhere]">
                      {log.itemName}
                    </p>
                  </td>
                  <td className="px-6 py-5 leading-6 text-[#394150]">
                    {log.actor.name}
                  </td>
                  <td className="px-6 py-5">
                    <p className="whitespace-pre-line break-words leading-6 text-[#394150] [overflow-wrap:anywhere]">
                      {log.message}
                    </p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mx-5 my-5 rounded-md border border-dashed border-[#cfd6e3] bg-[#fbfcfd] px-4 py-8 text-sm text-[#697386]">
          {hasFilters
            ? "조건에 맞는 변경내역이 없습니다."
            : "아직 기록된 변경내역이 없습니다."}
        </p>
      )}

      {pageError ? (
        <p className="mx-5 mb-4 rounded-md border border-[#efb4b4] bg-[#fff7f7] px-4 py-3 text-sm font-semibold text-[#a13a3a]">
          {pageError}
        </p>
      ) : null}

      <CafeItemChangeLogPagination
        isPending={isPagePending}
        itemFilters={itemFilters}
        logPage={currentLogPage}
        onPageChange={loadLogPage ? loadPage : undefined}
        pendingPage={pendingPage}
      />
    </section>
  );
}

function CafeItemChangeLogPagination({
  isPending,
  itemFilters,
  logPage,
  onPageChange,
  pendingPage,
}: {
  isPending: boolean;
  itemFilters: CafeItemPageFilters;
  logPage: CafeItemChangeLogPage;
  onPageChange?: (page: number) => void;
  pendingPage: number | null;
}) {
  if (logPage.totalPages <= 1) {
    return null;
  }

  return (
    <nav
      aria-label="카페 물품 변경내역 페이지"
      className="flex flex-wrap items-center justify-between gap-3 border-t border-[#eef1f5] px-5 py-4"
    >
      <p className="text-sm text-[#697386]">
        {logPage.page} / {logPage.totalPages} 페이지
      </p>
      <div className="flex gap-2">
        <CafeItemChangeLogPaginationLink
          disabled={logPage.page <= 1 || isPending}
          href={createCafeManagementHref({
            itemFilters,
            logFilters: {
              ...logPage.filters,
              page: logPage.page - 1,
            },
          })}
          onPageChange={onPageChange}
          page={logPage.page - 1}
          pending={pendingPage === logPage.page - 1}
        >
          이전
        </CafeItemChangeLogPaginationLink>
        <CafeItemChangeLogPaginationLink
          disabled={logPage.page >= logPage.totalPages || isPending}
          href={createCafeManagementHref({
            itemFilters,
            logFilters: {
              ...logPage.filters,
              page: logPage.page + 1,
            },
          })}
          onPageChange={onPageChange}
          page={logPage.page + 1}
          pending={pendingPage === logPage.page + 1}
        >
          다음
        </CafeItemChangeLogPaginationLink>
      </div>
    </nav>
  );
}

function CafeItemChangeLogPaginationLink({
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

function ItemFilterHiddenFields({ filters }: { filters: CafeItemPageFilters }) {
  return (
    <>
      {filters.query ? <input type="hidden" name="q" value={filters.query} /> : null}
      {filters.category !== "all" ? (
        <input type="hidden" name="category" value={filters.category} />
      ) : null}
      {filters.deadline !== "all" ? (
        <input type="hidden" name="deadline" value={filters.deadline} />
      ) : null}
      {filters.sort !== "latest" ? (
        <input type="hidden" name="sort" value={filters.sort} />
      ) : null}
      {filters.page > 1 ? (
        <input type="hidden" name="page" value={filters.page} />
      ) : null}
    </>
  );
}

function createCafeManagementHref({
  itemFilters,
  logFilters,
}: {
  itemFilters: CafeItemPageFilters;
  logFilters: CafeItemChangeLogPage["filters"];
}) {
  const params = new URLSearchParams();

  if (itemFilters.query) {
    params.set("q", itemFilters.query);
  }

  if (itemFilters.category !== "all") {
    params.set("category", itemFilters.category);
  }

  if (itemFilters.deadline !== "all") {
    params.set("deadline", itemFilters.deadline);
  }

  if (itemFilters.sort !== "latest") {
    params.set("sort", itemFilters.sort);
  }

  if (itemFilters.page > 1) {
    params.set("page", String(itemFilters.page));
  }

  if (logFilters.query) {
    params.set("logQ", logFilters.query);
  }

  if (logFilters.action !== "all") {
    params.set("logAction", logFilters.action);
  }

  if (logFilters.actorId !== "all") {
    params.set("logStaff", logFilters.actorId);
  }

  if (logFilters.page > 1) {
    params.set("logPage", String(logFilters.page));
  }

  const queryString = params.toString();

  return queryString ? `/work-schedule/cafe?${queryString}` : "/work-schedule/cafe";
}

function getCafeItemChangeLogFiltersFromLocation(): CafeItemChangeLogPageFilters {
  const params = new URLSearchParams(window.location.search);

  return {
    action: normalizeCafeItemChangeLogAction(
      params.get("logAction") ?? undefined,
    ),
    actorId: String(params.get("logStaff") ?? "all").trim() || "all",
    page: normalizeCafeItemPage(params.get("logPage") ?? undefined),
    query: String(params.get("logQ") ?? "").trim(),
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

function getActionBadgeClassName(action: CafeItemChangeLogAction) {
  if (action === "create") {
    return "border-[#bddfc9] bg-[#e8f5ed] text-[#22633a]";
  }

  if (action === "delete") {
    return "border-[#f0c6c6] bg-[#fff1f1] text-[#a13a3a]";
  }

  return "border-[#c9d6ea] bg-[#f3f7fc] text-[#3f5f8c]";
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}
