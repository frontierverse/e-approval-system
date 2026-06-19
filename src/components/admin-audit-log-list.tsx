import Link from "next/link";
import { adminListStyles } from "@/lib/admin-list-styles";
import {
  auditActionOptions,
  getAuditActionBadgeClass,
  getAuditActionLabel,
  type AuditActionValue,
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

type AdminAuditActor = {
  id: string;
  name: string;
  email: string | null;
};

type AdminAuditLogFilters = {
  query: string;
  status: "all" | AuditActionValue;
  actorId: string;
  dateFrom: string;
  dateTo: string;
};

type AdminAuditLogListProps = {
  logs: AdminAuditLog[];
  actors?: AdminAuditActor[];
  filters?: AdminAuditLogFilters;
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
  page = 1,
  pageSize = 12,
  total = logs.length,
  totalPages = 1,
}: AdminAuditLogListProps) {
  const hasActiveFilter = hasAuditLogFilter(filters);
  const firstItem = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastItem = Math.min(page * pageSize, total);

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
          총 {total}건
        </span>
      </div>

      <AuditLogFilters actors={actors} filters={filters} total={total} />

      {logs.length > 0 ? (
        <ol className="divide-y divide-[#eef1f5]">
          {logs.map((log) => (
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
                <p className="text-sm font-semibold text-[#16181d]">
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
        filters={filters}
        firstItem={firstItem}
        lastItem={lastItem}
        page={page}
        total={total}
        totalPages={totalPages}
      />
    </section>
  );
}

function AuditLogFilters({
  actors,
  filters,
  total,
}: {
  actors: AdminAuditActor[];
  filters: AdminAuditLogFilters;
  total: number;
}) {
  const selectedActorExists =
    filters.actorId === "all" ||
    actors.some((actor) => actor.id === filters.actorId);
  const hasActiveFilter = hasAuditLogFilter(filters);

  return (
    <div className="border-b border-[#eef1f5] bg-white p-4">
      <form
        action="/admin"
        className="grid gap-3 xl:grid-cols-[minmax(0,1.2fr)_10rem_10rem_13rem_11rem_auto_auto]"
      >
        <input type="hidden" name="tab" value="audit" />

        <div>
          <label htmlFor="q" className="text-xs font-semibold text-[#697386]">
            검색
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={filters.query}
            placeholder="메시지, 문서명, 문서번호, 사용자"
            className="mt-2 h-10 w-full rounded-md border border-[#cfd6e3] bg-white px-3 text-sm outline-none transition placeholder:text-[#9aa4b2] focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
          />
        </div>

        <div>
          <label
            htmlFor="dateFrom"
            className="text-xs font-semibold text-[#697386]"
          >
            시작일
          </label>
          <input
            id="dateFrom"
            name="dateFrom"
            type="date"
            defaultValue={filters.dateFrom}
            className="mt-2 h-10 w-full cursor-pointer rounded-md border border-[#cfd6e3] bg-white px-3 text-sm outline-none transition focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
          />
        </div>

        <div>
          <label
            htmlFor="dateTo"
            className="text-xs font-semibold text-[#697386]"
          >
            종료일
          </label>
          <input
            id="dateTo"
            name="dateTo"
            type="date"
            defaultValue={filters.dateTo}
            className="mt-2 h-10 w-full cursor-pointer rounded-md border border-[#cfd6e3] bg-white px-3 text-sm outline-none transition focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
          />
        </div>

        <div>
          <label
            htmlFor="user"
            className="text-xs font-semibold text-[#697386]"
          >
            사용자
          </label>
          <select
            id="user"
            name="user"
            defaultValue={filters.actorId}
            className="mt-2 h-10 w-full cursor-pointer rounded-md border border-[#cfd6e3] bg-white px-3 text-sm outline-none transition focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
          >
            <option value="all">전체 사용자</option>
            {!selectedActorExists ? (
              <option value={filters.actorId}>선택한 사용자</option>
            ) : null}
            {actors.map((actor) => (
              <option key={actor.id} value={actor.id}>
                {actor.name} · {formatOptionalEmail(actor.email)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="status"
            className="text-xs font-semibold text-[#697386]"
          >
            상태
          </label>
          <select
            id="status"
            name="status"
            defaultValue={filters.status}
            className="mt-2 h-10 w-full cursor-pointer rounded-md border border-[#cfd6e3] bg-white px-3 text-sm outline-none transition focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
          >
            {auditActionOptions.map((option) => (
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
              href="/admin?tab=audit"
              className={buttonClass(
                buttonStyles.base,
                buttonStyles.neutral,
                "h-10 w-full px-4 text-sm",
              )}
            >
              초기화
            </Link>
          ) : (
            <span className="hidden xl:block" />
          )}
        </div>
      </form>

      <p className="mt-3 text-xs text-[#697386]">
        {total > 0
          ? `${total}건의 감사 로그가 검색되었습니다.`
          : "검색 결과가 없습니다."}
      </p>
    </div>
  );
}

function AuditLogPagination({
  filters,
  firstItem,
  lastItem,
  page,
  total,
  totalPages,
}: {
  filters: AdminAuditLogFilters;
  firstItem: number;
  lastItem: number;
  page: number;
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
            disabled={page <= 1}
            href={getAuditLogHref(filters, 1)}
          >
            처음
          </PaginationLink>
          <PaginationLink
            disabled={page <= 1}
            href={getAuditLogHref(filters, page - 1)}
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
                page={item}
              />
            ),
          )}
          <PaginationLink
            disabled={page >= totalPages}
            href={getAuditLogHref(filters, page + 1)}
          >
            다음
          </PaginationLink>
          <PaginationLink
            disabled={page >= totalPages}
            href={getAuditLogHref(filters, totalPages)}
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

function PaginationPageLink({
  current,
  filters,
  page,
}: {
  current: boolean;
  filters: AdminAuditLogFilters;
  page: number;
}) {
  if (current) {
    return (
      <span
        aria-current="page"
        className="inline-flex size-10 items-center justify-center rounded-md border border-[#196b69] bg-[#196b69] text-sm font-semibold text-white"
      >
        {page}
      </span>
    );
  }

  return (
    <Link
      href={getAuditLogHref(filters, page)}
      className={buttonClass(
        buttonStyles.base,
        buttonStyles.neutral,
        "size-10 px-0 text-sm",
      )}
    >
      {page}
    </Link>
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
  if (log.targetType !== "User" || !isPlainObject(log.metadata)) {
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
