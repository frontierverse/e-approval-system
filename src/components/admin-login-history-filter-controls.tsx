"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { FormEvent } from "react";
import { DatePickerInput } from "@/components/date-picker-input";
import { buttonClass, buttonStyles } from "@/lib/button-styles";

export type AdminLoginHistoryUser = {
  id: string;
  name: string;
  email: string | null;
};

export type AdminLoginHistoryFilters = {
  query: string;
  result: "all" | "success" | "failure";
  userId: string;
  dateFrom: string;
  dateTo: string;
};

type AdminLoginHistoryFilterControlsProps = {
  filters: AdminLoginHistoryFilters;
  total: number;
  users: AdminLoginHistoryUser[];
};

const loginHistoryResultOptions = [
  { value: "all", label: "전체" },
  { value: "success", label: "성공" },
  { value: "failure", label: "실패" },
] as const;

export function AdminLoginHistoryFilterControls(
  props: AdminLoginHistoryFilterControlsProps,
) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function navigate(href: string) {
    startTransition(() => {
      router.replace(href, { scroll: false });
    });
  }

  return (
    <AdminLoginHistoryFilterControlsContent
      {...props}
      isPending={isPending}
      navigate={navigate}
    />
  );
}

export function AdminLoginHistoryFilterControlsContent({
  filters,
  isPending = false,
  navigate,
  total,
  users,
}: AdminLoginHistoryFilterControlsProps & {
  isPending?: boolean;
  navigate: (href: string) => void;
}) {
  const selectedUserExists =
    filters.userId === "all" ||
    users.some((user) => user.id === filters.userId);
  const hasActiveFilter = hasLoginHistoryFilter(filters);
  const filterFormKey = [
    filters.query,
    filters.dateFrom,
    filters.dateTo,
    filters.userId,
    filters.result,
  ].join(":");

  function submitFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    navigate(
      createAdminLoginHistoryFilterHref({
        dateFrom: String(formData.get("dateFrom") ?? ""),
        dateTo: String(formData.get("dateTo") ?? ""),
        query: String(formData.get("q") ?? ""),
        result: String(formData.get("result") ?? "all"),
        userId: String(formData.get("user") ?? "all"),
      }),
    );
  }

  return (
    <div className="border-b border-[#eef1f5] bg-white p-4">
      <form
        key={filterFormKey}
        className="grid gap-3 xl:grid-cols-[minmax(0,1.2fr)_10rem_10rem_13rem_9rem_auto_auto]"
        onSubmit={submitFilters}
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
            disabled={isPending}
            placeholder="이름, IP, 브라우저, 위치"
            className="mt-2 h-10 w-full rounded-md border border-[#cfd6e3] bg-white px-3 text-sm outline-none transition placeholder:text-[#9aa4b2] focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb] disabled:cursor-not-allowed disabled:bg-[#f7f9fc] disabled:text-[#697386]"
          />
        </div>

        <div>
          <label
            htmlFor="dateFrom"
            className="text-xs font-semibold text-[#697386]"
          >
            시작일
          </label>
          <DatePickerInput
            id="dateFrom"
            name="dateFrom"
            defaultValue={filters.dateFrom}
            disabled={isPending}
            className="mt-2 h-10 w-full cursor-pointer rounded-md border border-[#cfd6e3] bg-white px-3 text-sm outline-none transition focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb] disabled:cursor-not-allowed disabled:bg-[#f7f9fc] disabled:text-[#697386]"
          />
        </div>

        <div>
          <label
            htmlFor="dateTo"
            className="text-xs font-semibold text-[#697386]"
          >
            종료일
          </label>
          <DatePickerInput
            id="dateTo"
            name="dateTo"
            defaultValue={filters.dateTo}
            disabled={isPending}
            className="mt-2 h-10 w-full cursor-pointer rounded-md border border-[#cfd6e3] bg-white px-3 text-sm outline-none transition focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb] disabled:cursor-not-allowed disabled:bg-[#f7f9fc] disabled:text-[#697386]"
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
            disabled={isPending}
            className="mt-2 h-10 w-full cursor-pointer rounded-md border border-[#cfd6e3] bg-white px-3 text-sm outline-none transition focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb] disabled:cursor-not-allowed disabled:bg-[#f7f9fc] disabled:text-[#697386]"
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
            disabled={isPending}
            className="mt-2 h-10 w-full cursor-pointer rounded-md border border-[#cfd6e3] bg-white px-3 text-sm outline-none transition focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb] disabled:cursor-not-allowed disabled:bg-[#f7f9fc] disabled:text-[#697386]"
          >
            {loginHistoryResultOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-end">
          <button
            type="submit"
            disabled={isPending}
            className={buttonClass(
              buttonStyles.base,
              buttonStyles.filter,
              "h-10 w-full px-4 text-sm",
            )}
          >
            {isPending ? "검색 중" : "검색"}
          </button>
        </div>

        <div className="flex items-end">
          {hasActiveFilter ? (
            <button
              type="button"
              disabled={isPending}
              onClick={() => navigate("/admin?tab=login-history")}
              className={buttonClass(
                buttonStyles.base,
                buttonStyles.neutral,
                "h-10 w-full px-4 text-sm",
              )}
            >
              초기화
            </button>
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

function createAdminLoginHistoryFilterHref({
  dateFrom,
  dateTo,
  query,
  result,
  userId,
}: {
  dateFrom: string;
  dateTo: string;
  query: string;
  result: string;
  userId: string;
}) {
  const params = new URLSearchParams({ tab: "login-history" });
  const normalizedQuery = query.trim();
  const normalizedDateFrom = normalizeDateFilter(dateFrom);
  const normalizedDateTo = normalizeDateFilter(dateTo);
  const normalizedUserId = userId.trim();
  const normalizedResult = normalizeResultFilter(result);

  if (normalizedQuery) {
    params.set("q", normalizedQuery);
  }

  if (normalizedDateFrom) {
    params.set("dateFrom", normalizedDateFrom);
  }

  if (normalizedDateTo) {
    params.set("dateTo", normalizedDateTo);
  }

  if (normalizedUserId && normalizedUserId !== "all") {
    params.set("user", normalizedUserId);
  }

  if (normalizedResult !== "all") {
    params.set("result", normalizedResult);
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

function normalizeDateFilter(value: string) {
  const date = value.trim();

  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
}

function normalizeResultFilter(
  value: string,
): AdminLoginHistoryFilters["result"] {
  return value === "success" || value === "failure" ? value : "all";
}

function formatOptionalEmail(email: string | null) {
  return email || "이메일 미등록";
}
