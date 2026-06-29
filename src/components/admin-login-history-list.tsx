"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import type { MouseEvent } from "react";
import {
  AdminLoginHistoryFilterControls,
  type AdminLoginHistoryFilters,
  type AdminLoginHistoryUser,
} from "@/components/admin-login-history-filter-controls";
import { UserIdentity } from "@/components/user-identity";
import { adminListStyles } from "@/lib/admin-list-styles";
import { buttonClass, buttonStyles } from "@/lib/button-styles";
import {
  getLoginFailureReasonLabel,
  getLoginLocationLabel,
} from "@/lib/login-history-core";

type AdminLoginHistory = {
  id: string;
  attemptedName: string;
  success: boolean;
  failureReason: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  browser: string | null;
  os: string | null;
  device: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  createdAt: Date;
  user: {
    id: string;
    name: string;
    email: string | null;
    profileImageStorageKey?: string | null;
    profileImageUpdatedAt?: Date | string | null;
  } | null;
};

type AdminLoginHistoryPageActionResult = Promise<
  | {
      ok: true;
      data: {
        historyPage: {
          histories: AdminLoginHistory[];
          page: number;
          pageSize: number;
          total: number;
          totalPages: number;
        };
      };
    }
  | { ok: false; error: string }
>;

type AdminLoginHistoryListProps = {
  histories: AdminLoginHistory[];
  users?: AdminLoginHistoryUser[];
  filters?: AdminLoginHistoryFilters;
  filterControls?: React.ReactNode;
  loadPage?: (
    filters: AdminLoginHistoryFilters & { page: number },
  ) => AdminLoginHistoryPageActionResult;
  page?: number;
  pageSize?: number;
  total?: number;
  totalPages?: number;
};

const defaultFilters: AdminLoginHistoryFilters = {
  query: "",
  result: "all",
  userId: "all",
  dateFrom: "",
  dateTo: "",
};

export function AdminLoginHistoryList({
  histories,
  users = [],
  filters = defaultFilters,
  filterControls,
  loadPage,
  page = 1,
  pageSize = 12,
  total = histories.length,
  totalPages = 1,
}: AdminLoginHistoryListProps) {
  const [pageState, setPageState] = useState({
    filters,
    histories,
    page,
    pageSize,
    total,
    totalPages,
  });
  const [pageError, setPageError] = useState("");
  const [pendingPage, setPendingPage] = useState<number | null>(null);
  const [isPagePending, startPageTransition] = useTransition();

  const loadLoginHistoryPage = useCallback(
    (
      nextPage: number,
      options?: {
        filters?: AdminLoginHistoryFilters & { page: number };
        updateHistory?: boolean;
      },
    ) => {
      if (!loadPage) {
        return;
      }

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

          const { historyPage } = result.data;

          setPageState({
            filters: {
              dateFrom: nextFilters.dateFrom,
              dateTo: nextFilters.dateTo,
              query: nextFilters.query,
              result: nextFilters.result,
              userId: nextFilters.userId,
            },
            histories: historyPage.histories,
            page: historyPage.page,
            pageSize: historyPage.pageSize,
            total: historyPage.total,
            totalPages: historyPage.totalPages,
          });
          setPageError("");

          if (updateHistory) {
            window.history.pushState(
              { adminLoginHistoryPage: historyPage.page },
              "",
              getLoginHistoryHref(nextFilters, historyPage.page),
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
    if (!loadPage) {
      return;
    }

    function loadFromHistory() {
      const params = new URLSearchParams(window.location.search);

      if (params.get("tab") !== "login-history") {
        return;
      }

      const nextFilters = getLoginHistoryFiltersFromLocation(params);

      loadLoginHistoryPage(nextFilters.page, {
        filters: nextFilters,
        updateHistory: false,
      });
    }

    window.addEventListener("popstate", loadFromHistory);

    return () => window.removeEventListener("popstate", loadFromHistory);
  }, [loadLoginHistoryPage, loadPage]);

  const currentFilters = pageState.filters;
  const currentHistories = pageState.histories;
  const firstItem =
    pageState.total === 0 ? 0 : (pageState.page - 1) * pageState.pageSize + 1;
  const lastItem = Math.min(
    pageState.page * pageState.pageSize,
    pageState.total,
  );
  const hasActiveFilter = hasLoginHistoryFilter(currentFilters);

  return (
    <section className={adminListStyles.panel}>
      <div className={adminListStyles.header}>
        <div>
          <h2 className={adminListStyles.title}>로그인 이력</h2>
          <p className={adminListStyles.description}>
            모든 사용자의 로그인 성공/실패 기록과 접속 환경을 확인합니다.
          </p>
        </div>
        <span className={adminListStyles.count}>총 {pageState.total}건</span>
      </div>

      {filterControls ?? (
        <AdminLoginHistoryFilterControls
          filters={currentFilters}
          total={pageState.total}
          users={users}
        />
      )}

      {pageError ? (
        <p className="m-5 rounded-md border border-[#f4b5b5] bg-[#fff5f5] px-4 py-3 text-sm font-semibold text-[#b42318]">
          {pageError}
        </p>
      ) : null}

      {currentHistories.length > 0 ? (
        <ol
          className={[
            "divide-y divide-[#eef1f5]",
            isPagePending ? "opacity-60" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {currentHistories.map((history) => (
            <li
              key={history.id}
              className="grid gap-3 px-5 py-4 xl:grid-cols-[12rem_8rem_minmax(12rem,0.9fr)_minmax(0,1fr)_minmax(10rem,0.8fr)]"
            >
              <time
                dateTime={history.createdAt.toISOString()}
                className="text-sm font-medium text-[#394150]"
              >
                {formatLoginDate(history.createdAt)}
              </time>

              <div>
                <ResultBadge success={history.success} />
                {!history.success ? (
                  <p className="mt-1 text-xs text-[#8a1f1f]">
                    {getLoginFailureReasonLabel(history.failureReason)}
                  </p>
                ) : null}
              </div>

              <div className="min-w-0">
                {history.user ? (
                  <UserIdentity
                    user={history.user}
                    size="xs"
                    meta={formatOptionalEmail(history.user.email)}
                  />
                ) : (
                  <div className="text-sm">
                    <p className="font-semibold text-[#16181d]">
                      {history.attemptedName || "미입력"}
                    </p>
                    <p className="mt-1 text-xs text-[#697386]">
                      연결된 사용자 없음
                    </p>
                  </div>
                )}
              </div>

              <div className="min-w-0 text-sm text-[#394150]">
                <p className="truncate font-semibold">
                  {[history.device, history.browser, history.os]
                    .filter(Boolean)
                    .join(" · ") || "기기 정보 없음"}
                </p>
                <p className="mt-1 truncate text-xs text-[#697386]">
                  {history.userAgent || "User-Agent 없음"}
                </p>
              </div>

              <div className="min-w-0 text-sm text-[#394150]">
                <p className="truncate font-semibold">
                  {history.ipAddress || "IP 없음"}
                </p>
                <p className="mt-1 truncate text-xs text-[#697386]">
                  {getLoginLocationLabel(history)}
                </p>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <div className="px-5 py-10 text-center">
          <p className="text-sm font-semibold text-[#394150]">
            {hasActiveFilter
              ? "조건에 맞는 로그인 이력이 없습니다."
              : "아직 로그인 이력이 없습니다."}
          </p>
          <p className="mt-1 text-sm text-[#697386]">
            {hasActiveFilter
              ? "검색어나 기간, 사용자, 결과 필터를 조정해보세요."
              : "사용자가 로그인하거나 실패하면 이곳에 기록됩니다."}
          </p>
        </div>
      )}

      <LoginHistoryPagination
        filters={currentFilters}
        firstItem={firstItem}
        isPending={isPagePending}
        lastItem={lastItem}
        onPageChange={loadPage ? loadLoginHistoryPage : undefined}
        page={pageState.page}
        pendingPage={pendingPage}
        total={pageState.total}
        totalPages={pageState.totalPages}
      />
    </section>
  );
}

function LoginHistoryPagination({
  filters,
  firstItem,
  isPending,
  lastItem,
  onPageChange,
  page,
  pendingPage,
  total,
  totalPages,
}: {
  filters: AdminLoginHistoryFilters;
  firstItem: number;
  isPending: boolean;
  lastItem: number;
  onPageChange?: (page: number) => void;
  page: number;
  pendingPage: number | null;
  total: number;
  totalPages: number;
}) {
  if (totalPages <= 1 && total === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#eef1f5] px-5 py-4">
      <p className="text-sm text-[#697386]">
        {total > 0
          ? `${total}건 중 ${firstItem}-${lastItem}건 표시`
          : "표시할 로그인 이력이 없습니다."}
      </p>
      {totalPages > 1 ? (
        <nav
          aria-label="로그인 이력 페이지"
          className="flex flex-wrap items-center gap-2"
        >
          <PaginationLink
            disabled={page <= 1 || isPending}
            href={getLoginHistoryHref(filters, page - 1)}
            onPageChange={onPageChange}
            page={page - 1}
            pending={pendingPage === page - 1}
          >
            이전
          </PaginationLink>
          <PaginationLink
            disabled={page >= totalPages || isPending}
            href={getLoginHistoryHref(filters, page + 1)}
            onPageChange={onPageChange}
            page={page + 1}
            pending={pendingPage === page + 1}
          >
            다음
          </PaginationLink>
        </nav>
      ) : null}
    </div>
  );
}

function PaginationLink({
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
  onPageChange?: (page: number) => void;
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
        if (!onPageChange || shouldUseNativeNavigation(event)) {
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

function ResultBadge({ success }: { success: boolean }) {
  return (
    <span
      className={[
        "inline-flex h-7 items-center rounded-md border px-2.5 text-xs font-semibold",
        success
          ? "border-[#bddfc9] bg-[#e8f5ed] text-[#22633a]"
          : "border-[#f0c6c6] bg-[#fff1f1] text-[#8a1f1f]",
      ].join(" ")}
    >
      {success ? "성공" : "실패"}
    </span>
  );
}

function getLoginHistoryHref(
  filters: AdminLoginHistoryFilters,
  page: number,
) {
  const params = new URLSearchParams({ tab: "login-history" });

  if (filters.query) {
    params.set("q", filters.query);
  }

  if (filters.dateFrom) {
    params.set("dateFrom", filters.dateFrom);
  }

  if (filters.dateTo) {
    params.set("dateTo", filters.dateTo);
  }

  if (filters.userId !== "all") {
    params.set("user", filters.userId);
  }

  if (filters.result !== "all") {
    params.set("result", filters.result);
  }

  if (page > 1) {
    params.set("page", String(page));
  }

  return `/admin?${params.toString()}`;
}

function getLoginHistoryFiltersFromLocation(
  params: URLSearchParams,
): AdminLoginHistoryFilters & { page: number } {
  return {
    dateFrom: normalizeDateParam(params.get("dateFrom")),
    dateTo: normalizeDateParam(params.get("dateTo")),
    page: normalizePositivePage(params.get("page")),
    query: String(params.get("q") ?? "").trim(),
    result: normalizeLoginResult(params.get("result")),
    userId: normalizeUserId(params.get("user")),
  };
}

function normalizeLoginResult(
  value: string | null | undefined,
): AdminLoginHistoryFilters["result"] {
  return value === "success" || value === "failure" ? value : "all";
}

function normalizeUserId(value: string | null | undefined) {
  const userId = String(value ?? "").trim();

  return userId || "all";
}

function normalizeDateParam(value: string | null | undefined) {
  const date = String(value ?? "").trim();

  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
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

function hasLoginHistoryFilter(filters: AdminLoginHistoryFilters) {
  return (
    Boolean(filters.query) ||
    Boolean(filters.dateFrom) ||
    Boolean(filters.dateTo) ||
    filters.userId !== "all" ||
    filters.result !== "all"
  );
}

function formatOptionalEmail(email: string | null) {
  return email || "이메일 미등록";
}

function formatLoginDate(date: Date) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}
