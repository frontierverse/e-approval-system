"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { FormEvent } from "react";
import { DatePickerInput } from "@/components/date-picker-input";
import {
  auditActionOptions,
  isAuditActionValue,
  type AuditActionValue,
} from "@/lib/audit-log-display";
import { buttonClass, buttonStyles } from "@/lib/button-styles";

export type AdminAuditActor = {
  id: string;
  name: string;
  email: string | null;
};

export type AdminAuditLogFilters = {
  query: string;
  status: "all" | AuditActionValue;
  actorId: string;
  dateFrom: string;
  dateTo: string;
};

type AdminAuditLogFilterControlsProps = {
  actors: AdminAuditActor[];
  filters: AdminAuditLogFilters;
  total: number;
};

export function AdminAuditLogFilterControls(
  props: AdminAuditLogFilterControlsProps,
) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function navigate(href: string) {
    startTransition(() => {
      router.replace(href, { scroll: false });
    });
  }

  return (
    <AdminAuditLogFilterControlsContent
      {...props}
      isPending={isPending}
      navigate={navigate}
    />
  );
}

export function AdminAuditLogFilterControlsContent({
  actors,
  filters,
  isPending = false,
  navigate,
  total,
}: AdminAuditLogFilterControlsProps & {
  isPending?: boolean;
  navigate: (href: string) => void;
}) {
  const selectedActorExists =
    filters.actorId === "all" ||
    actors.some((actor) => actor.id === filters.actorId);
  const hasActiveFilter = hasAuditLogFilter(filters);
  const filterFormKey = [
    filters.query,
    filters.dateFrom,
    filters.dateTo,
    filters.actorId,
    filters.status,
  ].join(":");

  function submitFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    navigate(
      createAdminAuditLogFilterHref({
        actorId: String(formData.get("user") ?? "all"),
        dateFrom: String(formData.get("dateFrom") ?? ""),
        dateTo: String(formData.get("dateTo") ?? ""),
        query: String(formData.get("q") ?? ""),
        status: String(formData.get("status") ?? "all"),
      }),
    );
  }

  return (
    <div className="border-b border-[#eef1f5] bg-white p-4">
      <form
        key={filterFormKey}
        className="grid gap-3 xl:grid-cols-[minmax(0,1.2fr)_10rem_10rem_13rem_11rem_auto_auto]"
        onSubmit={submitFilters}
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
            disabled={isPending}
            placeholder="메시지, 문서명, 문서번호, 사용자"
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
            defaultValue={filters.actorId}
            disabled={isPending}
            className="mt-2 h-10 w-full cursor-pointer rounded-md border border-[#cfd6e3] bg-white px-3 text-sm outline-none transition focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb] disabled:cursor-not-allowed disabled:bg-[#f7f9fc] disabled:text-[#697386]"
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
            disabled={isPending}
            className="mt-2 h-10 w-full cursor-pointer rounded-md border border-[#cfd6e3] bg-white px-3 text-sm outline-none transition focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb] disabled:cursor-not-allowed disabled:bg-[#f7f9fc] disabled:text-[#697386]"
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
              onClick={() => navigate("/admin?tab=audit")}
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
          ? `${total}건의 감사 로그가 검색되었습니다.`
          : "검색 결과가 없습니다."}
      </p>
    </div>
  );
}

function createAdminAuditLogFilterHref({
  actorId,
  dateFrom,
  dateTo,
  query,
  status,
}: {
  actorId: string;
  dateFrom: string;
  dateTo: string;
  query: string;
  status: string;
}) {
  const params = new URLSearchParams({ tab: "audit" });
  const normalizedQuery = query.trim();
  const normalizedDateFrom = normalizeDateFilter(dateFrom);
  const normalizedDateTo = normalizeDateFilter(dateTo);
  const normalizedActorId = actorId.trim();
  const normalizedStatus = normalizeStatusFilter(status);

  if (normalizedQuery) {
    params.set("q", normalizedQuery);
  }

  if (normalizedDateFrom) {
    params.set("dateFrom", normalizedDateFrom);
  }

  if (normalizedDateTo) {
    params.set("dateTo", normalizedDateTo);
  }

  if (normalizedActorId && normalizedActorId !== "all") {
    params.set("user", normalizedActorId);
  }

  if (normalizedStatus !== "all") {
    params.set("status", normalizedStatus);
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

function normalizeDateFilter(value: string) {
  const date = value.trim();

  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
}

function normalizeStatusFilter(value: string): "all" | AuditActionValue {
  return isAuditActionValue(value) ? value : "all";
}

function formatOptionalEmail(email: string | null) {
  return email || "이메일 미등록";
}
