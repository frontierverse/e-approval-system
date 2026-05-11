import Link from "next/link";
import { adminListStyles } from "@/lib/admin-list-styles";
import {
  auditActionOptions,
  getAuditActionBadgeClass,
  getAuditActionLabel,
  type AuditActionValue,
} from "@/lib/audit-log-display";
import { buttonClass, buttonStyles } from "@/lib/button-styles";
import { UserIdentity } from "@/components/user-identity";

type AdminAuditLog = {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  message: string | null;
  createdAt: Date;
  actor: {
    id: string;
    name: string;
    email: string;
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
  email: string;
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
                    getAuditActionBadgeClass(log.action),
                  ].join(" ")}
                >
                  {getAuditActionLabel(log.action)}
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
                  <span className="min-w-0 truncate">{log.actor.email}</span>
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
                {actor.name} · {actor.email}
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

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#eef1f5] px-5 py-4">
      <p className="text-sm text-[#697386]">
        {total > 0
          ? `${total}건 중 ${firstItem}-${lastItem}건 표시`
          : "표시할 감사 로그가 없습니다."}
      </p>
      {totalPages > 1 ? (
        <nav aria-label="감사 로그 페이지" className="flex gap-2">
          <PaginationLink
            disabled={page <= 1}
            href={getAuditLogHref(filters, page - 1)}
          >
            이전
          </PaginationLink>
          <span className="inline-flex h-10 items-center justify-center rounded-md border border-[#d9dee7] bg-[#f7f9fc] px-3 text-sm font-semibold text-[#394150]">
            {page} / {totalPages}
          </span>
          <PaginationLink
            disabled={page >= totalPages}
            href={getAuditLogHref(filters, page + 1)}
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

function getFallbackAuditMessage(log: AdminAuditLog) {
  return `${getAuditActionLabel(log.action)} 작업을 수행했습니다.`;
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

function formatAuditLogDate(date: Date) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}
