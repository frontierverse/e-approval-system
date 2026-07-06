"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import type { MouseEvent } from "react";
import {
  AdminAuditLogFilterControls,
  type AdminAuditActor,
  type AdminAuditLogFilters,
} from "@/components/admin-audit-log-filter-controls";
import { adminListStyles } from "@/lib/admin-list-styles";
import {
  getAuditActionBadgeClass,
  getAuditActionLabel,
  isAuditActionValue,
} from "@/lib/audit-log-display";
import { buttonClass, buttonStyles } from "@/lib/button-styles";
import {
  generatedPdfAuditActionLabel,
  generatedPdfAuditBadgeClass,
  isGeneratedPdfAuditLog,
} from "@/lib/generated-pdf-audit";
import { UserIdentity } from "@/components/user-identity";

type AdminAuditLog = {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  message: string | null;
  metadata?: unknown;
  createdAt: Date;
  actor: {
    id: string;
    name: string;
    email: string | null;
    profileImageStorageKey?: string | null;
    profileImageUpdatedAt?: Date | string | null;
  };
  document: {
    title: string;
    documentNo: string | null;
  } | null;
};

type AdminAuditLogPageActionResult = Promise<
  | {
      ok: true;
      data: {
        auditPage: {
          logs: AdminAuditLog[];
          page: number;
          pageSize: number;
          total: number;
          totalPages: number;
        };
      };
    }
  | { ok: false; error: string }
>;

type AdminAuditLogListProps = {
  logs: AdminAuditLog[];
  actors?: AdminAuditActor[];
  filters?: AdminAuditLogFilters;
  filterControls?: React.ReactNode;
  loadPage?: (
    filters: AdminAuditLogFilters & { page: number },
  ) => AdminAuditLogPageActionResult;
  page?: number;
  pageSize?: number;
  total?: number;
  totalPages?: number;
};

const defaultFilters: AdminAuditLogFilters = {
  query: "",
  status: "all",
  actorId: "all",
  dateFrom: "",
  dateTo: "",
};

export function AdminAuditLogList({
  logs,
  actors = [],
  filters = defaultFilters,
  filterControls,
  loadPage,
  page = 1,
  pageSize = 12,
  total = logs.length,
  totalPages = 1,
}: AdminAuditLogListProps) {
  const [pageState, setPageState] = useState({
    filters,
    logs,
    page,
    pageSize,
    total,
    totalPages,
  });
  const [pageError, setPageError] = useState("");
  const [pendingPage, setPendingPage] = useState<number | null>(null);
  const [isPagePending, startPageTransition] = useTransition();

  const loadAuditLogPage = useCallback(
    (
      nextPage: number,
      options?: {
        filters?: AdminAuditLogFilters & { page: number };
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

          const { auditPage } = result.data;

          setPageState({
            filters: {
              actorId: nextFilters.actorId,
              dateFrom: nextFilters.dateFrom,
              dateTo: nextFilters.dateTo,
              query: nextFilters.query,
              status: nextFilters.status,
            },
            logs: auditPage.logs,
            page: auditPage.page,
            pageSize: auditPage.pageSize,
            total: auditPage.total,
            totalPages: auditPage.totalPages,
          });
          setPageError("");

          if (updateHistory) {
            window.history.pushState(
              { adminAuditPage: auditPage.page },
              "",
              getAuditLogHref(nextFilters, auditPage.page),
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

      if (params.get("tab") !== "audit") {
        return;
      }

      const nextFilters = getAuditLogFiltersFromLocation(params);

      loadAuditLogPage(nextFilters.page, {
        filters: nextFilters,
        updateHistory: false,
      });
    }

    window.addEventListener("popstate", loadFromHistory);

    return () => window.removeEventListener("popstate", loadFromHistory);
  }, [loadAuditLogPage, loadPage]);

  const currentFilters = pageState.filters;
  const currentLogs = pageState.logs;
  const hasActiveFilter = hasAuditLogFilter(currentFilters);
  const firstItem =
    pageState.total === 0 ? 0 : (pageState.page - 1) * pageState.pageSize + 1;
  const lastItem = Math.min(
    pageState.page * pageState.pageSize,
    pageState.total,
  );

  return (
    <section className={adminListStyles.panel}>
      <div className={adminListStyles.header}>
        <div>
          <h2 className={adminListStyles.title}>감사 로그</h2>
          <p className={adminListStyles.description}>
            최근 관리자/결재 작업 기록을 확인합니다.
          </p>
        </div>
        <span className={adminListStyles.count}>
          총 {pageState.total}건
        </span>
      </div>

      {filterControls ?? (
        <AdminAuditLogFilterControls
          actors={actors}
          filters={currentFilters}
          total={pageState.total}
        />
      )}

      {pageError ? (
        <p className="m-5 rounded-md border border-[#f4b5b5] bg-[#fff5f5] px-4 py-3 text-sm font-semibold text-[#b42318]">
          {pageError}
        </p>
      ) : null}

      {currentLogs.length > 0 ? (
        <ol
          className={[
            "divide-y divide-[#eef1f5]",
            isPagePending ? "opacity-60" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {currentLogs.map((log) => (
            <li key={log.id} className="grid gap-3 px-5 py-4 lg:grid-cols-[12rem_9rem_minmax(0,1fr)]">
              <time
                dateTime={log.createdAt.toISOString()}
                className="text-sm font-medium text-[#394150]"
              >
                {formatAuditLogDate(log.createdAt)}
              </time>

              <div>
                <span
                  className={[
                    "inline-flex h-7 items-center rounded-md border px-2.5 text-xs font-semibold",
                    getAdminAuditActionBadgeClass(log),
                  ].join(" ")}
                >
                  {getAdminAuditActionLabel(log)}
                </span>
              </div>

              <div className="min-w-0">
                <p className="whitespace-pre-line text-sm font-semibold text-[#16181d]">
                  {log.message || getFallbackAuditMessage(log)}
                </p>
                <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-[#697386]">
                  <UserIdentity
                    user={log.actor}
                    size="xs"
                    nameClassName="text-[#697386]"
                  />
                  <span aria-hidden="true">·</span>
                  <span className="min-w-0 truncate">
                    {formatOptionalEmail(log.actor.email)}
                  </span>
                  {log.document
                    ? (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{log.document.documentNo ?? "문서번호 없음"}</span>
                          <span aria-hidden="true">·</span>
                          <span className="min-w-0 truncate">
                            {log.document.title}
                          </span>
                        </>
                      )
                    : (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>
                            {getTargetLabel(log.targetType)} {log.targetId}
                          </span>
                        </>
                      )}
                </div>
                <AdminAuditChangeList log={log} />
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <div className="px-5 py-10 text-center">
          <p className="text-sm font-semibold text-[#394150]">
            {hasActiveFilter
              ? "조건에 맞는 감사 로그가 없습니다."
              : "아직 기록된 작업이 없습니다."}
          </p>
          <p className="mt-1 text-sm text-[#697386]">
            {hasActiveFilter
              ? "검색어나 기간, 사용자, 상태 필터를 조정해보세요."
              : "사용자 수정, 결재 처리, 정책 변경 같은 주요 작업이 이곳에 표시됩니다."}
          </p>
        </div>
      )}

      <AuditLogPagination
        filters={currentFilters}
        firstItem={firstItem}
        isPending={isPagePending}
        lastItem={lastItem}
        onPageChange={loadPage ? loadAuditLogPage : undefined}
        page={pageState.page}
        pendingPage={pendingPage}
        total={pageState.total}
        totalPages={pageState.totalPages}
      />
    </section>
  );
}

function AuditLogPagination({
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
  filters: AdminAuditLogFilters;
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

  const pageItems = getVisibleAuditLogPages(page, totalPages);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#eef1f5] px-5 py-4">
      <p className="text-sm text-[#697386]">
        {total > 0
          ? `${total}건 중 ${firstItem}-${lastItem}건 표시`
          : "표시할 감사 로그가 없습니다."}
      </p>
      {totalPages > 1 ? (
        <nav
          aria-label="감사 로그 페이지"
          className="flex flex-wrap items-center gap-2"
        >
          <PaginationLink
            disabled={page <= 1 || isPending}
            href={getAuditLogHref(filters, 1)}
            onPageChange={onPageChange}
            page={1}
            pending={pendingPage === 1}
          >
            처음
          </PaginationLink>
          <PaginationLink
            disabled={page <= 1 || isPending}
            href={getAuditLogHref(filters, page - 1)}
            onPageChange={onPageChange}
            page={page - 1}
            pending={pendingPage === page - 1}
          >
            이전
          </PaginationLink>
          {pageItems.map((item, index) =>
            item === "ellipsis" ? (
              <span
                key={`audit-page-ellipsis-${index}`}
                className="inline-flex h-10 min-w-10 items-center justify-center px-1 text-sm font-semibold text-[#697386]"
              >
                ...
              </span>
            ) : (
              <PaginationPageLink
                key={item}
                current={item === page}
                filters={filters}
                isPending={isPending}
                onPageChange={onPageChange}
                page={item}
                pending={pendingPage === item}
              />
            ),
          )}
          <PaginationLink
            disabled={page >= totalPages || isPending}
            href={getAuditLogHref(filters, page + 1)}
            onPageChange={onPageChange}
            page={page + 1}
            pending={pendingPage === page + 1}
          >
            다음
          </PaginationLink>
          <PaginationLink
            disabled={page >= totalPages || isPending}
            href={getAuditLogHref(filters, totalPages)}
            onPageChange={onPageChange}
            page={totalPages}
            pending={pendingPage === totalPages}
          >
            끝
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

function PaginationPageLink({
  current,
  filters,
  isPending,
  onPageChange,
  page,
  pending,
}: {
  current: boolean;
  filters: AdminAuditLogFilters;
  isPending: boolean;
  onPageChange?: (page: number) => void;
  page: number;
  pending: boolean;
}) {
  if (current || isPending) {
    return (
      <span
        aria-current={current ? "page" : undefined}
        className={[
          "inline-flex size-10 items-center justify-center rounded-md border text-sm font-semibold",
          current
            ? "border-[#196b69] bg-[#196b69] text-white"
            : "border-[#d9dee7] bg-[#f7f9fc] text-[#9aa4b2]",
        ].join(" ")}
      >
        {pending ? "..." : page}
      </span>
    );
  }

  return (
    <a
      href={getAuditLogHref(filters, page)}
      aria-busy={pending || undefined}
      className={buttonClass(
        buttonStyles.base,
        buttonStyles.neutral,
        "size-10 px-0 text-sm",
      )}
      onClick={(event) => {
        if (!onPageChange || shouldUseNativeNavigation(event)) {
          return;
        }

        event.preventDefault();
        onPageChange(page);
      }}
    >
      {pending ? "..." : page}
    </a>
  );
}

type AuditLogPageItem = number | "ellipsis";

function getVisibleAuditLogPages(
  currentPage: number,
  totalPages: number,
): AuditLogPageItem[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set<number>([1, totalPages, currentPage]);

  for (let offset = -1; offset <= 1; offset += 1) {
    pages.add(currentPage + offset);
  }

  if (currentPage <= 3) {
    pages.add(2);
    pages.add(3);
    pages.add(4);
  }

  if (currentPage >= totalPages - 2) {
    pages.add(totalPages - 3);
    pages.add(totalPages - 2);
    pages.add(totalPages - 1);
  }

  const sortedPages = Array.from(pages)
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((a, b) => a - b);

  return sortedPages.reduce<AuditLogPageItem[]>((items, page, index) => {
    const previousPage = sortedPages[index - 1];

    if (previousPage && page - previousPage > 1) {
      items.push("ellipsis");
    }

    items.push(page);
    return items;
  }, []);
}

function getAuditLogHref(filters: AdminAuditLogFilters, page: number) {
  const params = new URLSearchParams({ tab: "audit" });

  if (filters.query) {
    params.set("q", filters.query);
  }

  if (filters.dateFrom) {
    params.set("dateFrom", filters.dateFrom);
  }

  if (filters.dateTo) {
    params.set("dateTo", filters.dateTo);
  }

  if (filters.actorId !== "all") {
    params.set("user", filters.actorId);
  }

  if (filters.status !== "all") {
    params.set("status", filters.status);
  }

  if (page > 1) {
    params.set("page", String(page));
  }

  return `/admin?${params.toString()}`;
}

function getAuditLogFiltersFromLocation(
  params: URLSearchParams,
): AdminAuditLogFilters & { page: number } {
  return {
    actorId: normalizeActorId(params.get("user")),
    dateFrom: normalizeDateParam(params.get("dateFrom")),
    dateTo: normalizeDateParam(params.get("dateTo")),
    page: normalizePositivePage(params.get("page")),
    query: String(params.get("q") ?? "").trim(),
    status: normalizeAuditStatus(params.get("status")),
  };
}

function normalizeAuditStatus(
  value: string | null | undefined,
): AdminAuditLogFilters["status"] {
  return value && isAuditActionValue(value) ? value : "all";
}

function normalizeActorId(value: string | null | undefined) {
  const actorId = String(value ?? "").trim();

  return actorId || "all";
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

function hasAuditLogFilter(filters: AdminAuditLogFilters) {
  return (
    Boolean(filters.query) ||
    Boolean(filters.dateFrom) ||
    Boolean(filters.dateTo) ||
    filters.actorId !== "all" ||
    filters.status !== "all"
  );
}

function getAdminAuditActionLabel(log: AdminAuditLog) {
  return isGeneratedPdfAuditLog(log)
    ? generatedPdfAuditActionLabel
    : getAuditActionLabel(log.action);
}

function getAdminAuditActionBadgeClass(log: AdminAuditLog) {
  return isGeneratedPdfAuditLog(log)
    ? generatedPdfAuditBadgeClass
    : getAuditActionBadgeClass(log.action);
}

function getFallbackAuditMessage(log: AdminAuditLog) {
  return `${getAuditActionLabel(log.action)} 작업을 수행했습니다.`;
}

function AdminAuditChangeList({ log }: { log: AdminAuditLog }) {
  const changes = getAdminAuditChangeItems(log);

  if (changes.length === 0) {
    return null;
  }

  return (
    <dl className="mt-3 grid gap-2 sm:grid-cols-2">
      {changes.map((change) => (
        <div
          key={`${log.id}-${change.field}`}
          className="min-w-0 rounded-md border border-[#eef1f5] bg-[#fbfcfd] px-3 py-2"
        >
          <dt className="text-xs font-semibold text-[#697386]">
            {change.label}
          </dt>
          <dd className="mt-1 flex min-w-0 items-center gap-2 text-xs text-[#394150]">
            <span className="min-w-0 truncate">
              {formatAuditChangeValue(change.before)}
            </span>
            <span aria-hidden="true" className="text-[#9aa4b2]">
              -&gt;
            </span>
            <span className="min-w-0 truncate font-semibold text-[#16181d]">
              {formatAuditChangeValue(change.after)}
            </span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

function getAdminAuditChangeItems(log: AdminAuditLog) {
  if (
    !["User", "CompanyBusinessInfo"].includes(log.targetType) ||
    !isPlainObject(log.metadata)
  ) {
    return [];
  }

  const changes = log.metadata.changes;

  if (!Array.isArray(changes)) {
    return [];
  }

  return changes.flatMap((change) => {
    if (!isPlainObject(change)) {
      return [];
    }

    const field = typeof change.field === "string" ? change.field : "";
    const label = typeof change.label === "string" ? change.label : "";
    const before = getNullableAuditValue(change.before);
    const after = getNullableAuditValue(change.after);

    if (!field || !label) {
      return [];
    }

    return [
      {
        after,
        before,
        field,
        label,
      },
    ];
  });
}

function getNullableAuditValue(value: unknown) {
  if (value === null || typeof value === "undefined") {
    return null;
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return null;
}

function formatAuditChangeValue(value: string | null) {
  return value || "미등록";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getTargetLabel(targetType: string) {
  const labels: Record<string, string> = {
    User: "사용자",
    Department: "부서",
    Position: "직급",
    DocumentTemplate: "문서 양식",
    ApprovalDocument: "문서",
    AttachmentPolicy: "첨부 정책",
    CompanyBusinessInfo: "회사 정보",
  };

  return labels[targetType] ?? targetType;
}

function formatOptionalEmail(email: string | null) {
  return email || "이메일 미등록";
}

function formatAuditLogDate(date: Date) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  }).format(date);
}
