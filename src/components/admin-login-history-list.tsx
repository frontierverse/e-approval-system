import Link from "next/link";
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

type AdminLoginHistoryUser = {
  id: string;
  name: string;
  email: string | null;
};

type AdminLoginHistoryFilters = {
  query: string;
  result: "all" | "success" | "failure";
  userId: string;
  dateFrom: string;
  dateTo: string;
};

type AdminLoginHistoryListProps = {
  histories: AdminLoginHistory[];
  users?: AdminLoginHistoryUser[];
  filters?: AdminLoginHistoryFilters;
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

const resultOptions = [
  { value: "all", label: "전체" },
  { value: "success", label: "성공" },
  { value: "failure", label: "실패" },
] as const;

export function AdminLoginHistoryList({
  histories,
  users = [],
  filters = defaultFilters,
  page = 1,
  pageSize = 12,
  total = histories.length,
  totalPages = 1,
}: AdminLoginHistoryListProps) {
  const firstItem = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastItem = Math.min(page * pageSize, total);
  const hasActiveFilter = hasLoginHistoryFilter(filters);

  return (
    <section className={adminListStyles.panel}>
      <div className={adminListStyles.header}>
        <div>
          <h2 className={adminListStyles.title}>로그인 이력</h2>
          <p className={adminListStyles.description}>
            모든 사용자의 로그인 성공/실패 기록과 접속 환경을 확인합니다.
          </p>
        </div>
        <span className={adminListStyles.count}>총 {total}건</span>
      </div>

      <LoginHistoryFilters filters={filters} total={total} users={users} />

      {histories.length > 0 ? (
        <ol className="divide-y divide-[#eef1f5]">
          {histories.map((history) => (
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

function LoginHistoryFilters({
  filters,
  total,
  users,
}: {
  filters: AdminLoginHistoryFilters;
  total: number;
  users: AdminLoginHistoryUser[];
}) {
  const selectedUserExists =
    filters.userId === "all" ||
    users.some((user) => user.id === filters.userId);
  const hasActiveFilter = hasLoginHistoryFilter(filters);

  return (
    <div className="border-b border-[#eef1f5] bg-white p-4">
      <form
        action="/admin"
        className="grid gap-3 xl:grid-cols-[minmax(0,1.2fr)_10rem_10rem_13rem_9rem_auto_auto]"
      >
        <input type="hidden" name="tab" value="login-history" />

        <div>
          <label htmlFor="q" className="text-xs font-semibold text-[#697386]">
            검색
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={filters.query}
            placeholder="이름, IP, 브라우저, 위치"
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
            defaultValue={filters.userId}
            className="mt-2 h-10 w-full cursor-pointer rounded-md border border-[#cfd6e3] bg-white px-3 text-sm outline-none transition focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
          >
            <option value="all">전체 사용자</option>
            {!selectedUserExists ? (
              <option value={filters.userId}>선택한 사용자</option>
            ) : null}
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name} · {formatOptionalEmail(user.email)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="result"
            className="text-xs font-semibold text-[#697386]"
          >
            결과
          </label>
          <select
            id="result"
            name="result"
            defaultValue={filters.result}
            className="mt-2 h-10 w-full cursor-pointer rounded-md border border-[#cfd6e3] bg-white px-3 text-sm outline-none transition focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
          >
            {resultOptions.map((option) => (
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
              href="/admin?tab=login-history"
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
          ? `${total}건의 로그인 이력이 검색되었습니다.`
          : "검색 결과가 없습니다."}
      </p>
    </div>
  );
}

function LoginHistoryPagination({
  filters,
  firstItem,
  lastItem,
  page,
  total,
  totalPages,
}: {
  filters: AdminLoginHistoryFilters;
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
          : "표시할 로그인 이력이 없습니다."}
      </p>
      {totalPages > 1 ? (
        <nav
          aria-label="로그인 이력 페이지"
          className="flex flex-wrap items-center gap-2"
        >
          <PaginationLink
            disabled={page <= 1}
            href={getLoginHistoryHref(filters, page - 1)}
          >
            이전
          </PaginationLink>
          <PaginationLink
            disabled={page >= totalPages}
            href={getLoginHistoryHref(filters, page + 1)}
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
