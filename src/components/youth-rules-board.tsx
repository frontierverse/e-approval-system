"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import type { MouseEvent } from "react";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { YouthRuleChangeLogFilterControls } from "@/components/youth-rule-change-log-filter-controls";
import { UserIdentity } from "@/components/user-identity";
import {
  YouthRuleFilterControls,
  YouthRuleListTransitionProvider,
  YouthRulePendingOverlay,
} from "@/components/youth-rule-filter-controls";
import { buttonClass, buttonStyles } from "@/lib/button-styles";
import {
  isYouthRuleCategory,
  youthRuleCategories,
  type YouthActionResult,
  youthRuleDetailMaxLength,
  type YouthRule,
  type YouthRuleChangeLogActor,
  type YouthRuleChangeLog,
  type YouthRuleChangeLogFilters,
  type YouthRuleCategoryFilter,
  type YouthRuleTarget,
  type YouthRuleTargetFilter,
} from "@/lib/youth-management-core";
import type {
  YouthRuleChangeLogsResult,
  YouthRulesResult,
} from "@/lib/youth-rules";

type YouthRulesBoardProps = {
  createRuleAction: (formData: FormData) => Promise<void>;
  deleteRuleAction: (ruleId: string) => Promise<void>;
  filterControls?: React.ReactNode;
  loadRules?: (filters: {
    category: YouthRuleCategoryFilter;
    page: number;
    target: YouthRuleTargetFilter;
  }) => Promise<YouthActionResult<{ ruleResult: YouthRulesResult }>>;
  page: number;
  pageSize: number;
  ruleError?: string;
  rules: YouthRule[];
  selectedCategory: YouthRuleCategoryFilter;
  selectedTarget: YouthRuleTargetFilter;
  targets: YouthRuleTarget[];
  total: number;
  totalPages: number;
};

export function YouthRulesBoard({
  createRuleAction,
  deleteRuleAction,
  filterControls,
  loadRules,
  page,
  pageSize,
  ruleError,
  rules,
  selectedCategory,
  selectedTarget,
  targets,
  total,
  totalPages,
}: YouthRulesBoardProps) {
  const RulesListWrapper = filterControls
    ? StaticRulesListWrapper
    : YouthRuleListTransitionProvider;
  const [ruleState, setRuleState] = useState({
    page,
    pageSize,
    rules,
    selectedCategory,
    selectedTarget,
    total,
    totalPages,
  });
  const [rulePageError, setRulePageError] = useState("");
  const [pendingRulePage, setPendingRulePage] = useState<number | null>(null);
  const [isRulePagePending, startRulePageTransition] = useTransition();
  const currentRules = ruleState.rules;

  const loadRulePage = useCallback(
    (
      nextPage: number,
      options?: {
        filters?: {
          category: YouthRuleCategoryFilter;
          page: number;
          target: YouthRuleTargetFilter;
        };
        updateHistory?: boolean;
      },
    ) => {
      if (!loadRules) {
        return;
      }

      const nextFilters = {
        category: options?.filters?.category ?? ruleState.selectedCategory,
        page: nextPage,
        target: options?.filters?.target ?? ruleState.selectedTarget,
      };
      const updateHistory = options?.updateHistory ?? true;

      setPendingRulePage(nextPage);
      startRulePageTransition(async () => {
        try {
          const result = await loadRules(nextFilters);

          if (!result.ok) {
            setRulePageError(result.error);
            return;
          }

          const { ruleResult } = result.data;

          setRuleState({
            page: ruleResult.page,
            pageSize: ruleResult.pageSize,
            rules: ruleResult.rules,
            selectedCategory: ruleResult.category,
            selectedTarget: ruleResult.target,
            total: ruleResult.total,
            totalPages: ruleResult.totalPages,
          });
          setRulePageError("");

          if (updateHistory) {
            window.history.pushState(
              { youthRulesPage: ruleResult.page },
              "",
              getYouthRulesPageHref({
                category: ruleResult.category,
                page: ruleResult.page,
                target: ruleResult.target,
              }),
            );
          }
        } finally {
          setPendingRulePage(null);
        }
      });
    },
    [
      loadRules,
      ruleState.selectedCategory,
      ruleState.selectedTarget,
    ],
  );

  useEffect(() => {
    if (!loadRules) {
      return;
    }

    function loadFromHistory() {
      const params = new URLSearchParams(window.location.search);

      if (params.get("tab") === "history") {
        return;
      }

      const filters = getYouthRulesFiltersFromLocation(params);

      loadRulePage(filters.page, {
        filters,
        updateHistory: false,
      });
    }

    window.addEventListener("popstate", loadFromHistory);

    return () => window.removeEventListener("popstate", loadFromHistory);
  }, [loadRulePage, loadRules]);

  return (
    <section
      aria-label="청소년 규칙 관리"
      className="grid gap-6 xl:grid-cols-[24rem_minmax(0,1fr)]"
    >
      <form
        action={createRuleAction}
        className="rounded-md border border-[#d9dee7] bg-white p-5"
      >
        <h2 className="text-base font-semibold text-[#16181d]">규칙 생성</h2>
        <div className="mt-4 grid gap-4">
          <label>
            <span className="text-sm font-semibold text-[#394150]">
              카테고리
            </span>
            <select
              name="category"
              defaultValue={youthRuleCategories[0]}
              className="mt-2 h-10 w-full rounded-md border border-[#cfd6e3] bg-white px-3 text-sm outline-none focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
            >
              {youthRuleCategories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="text-sm font-semibold text-[#394150]">
              적용 대상
            </span>
            <select
              name="targetYouthId"
              defaultValue=""
              className="mt-2 h-10 w-full rounded-md border border-[#cfd6e3] bg-white px-3 text-sm outline-none focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
            >
              <option value="">공통</option>
              {targets.map((target) => (
                <option key={target.id} value={target.id}>
                  {target.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="text-sm font-semibold text-[#394150]">
              세부사항
            </span>
            <textarea
              name="detail"
              rows={8}
              maxLength={youthRuleDetailMaxLength}
              className="mt-2 w-full resize-y rounded-md border border-[#cfd6e3] px-3 py-3 text-sm leading-6 outline-none focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
            />
          </label>

          {ruleError ? (
            <p className="rounded-md border border-[#f0c6c6] bg-[#fff1f1] px-3 py-2 text-sm text-[#8a1f1f]">
              {ruleError}
            </p>
          ) : null}

          <PendingSubmitButton
            type="submit"
            pendingLabel="규칙 저장 중"
            className={buttonClass(
              buttonStyles.base,
              buttonStyles.primary,
              "h-10 px-4 text-sm",
            )}
          >
            저장
          </PendingSubmitButton>
        </div>
      </form>

      <RulesListWrapper>
        <section className="relative overflow-hidden rounded-md border border-[#d9dee7] bg-white">
          <header className="flex flex-wrap items-end justify-between gap-3 border-b border-[#eef1f5] px-5 py-4">
            <div>
              <h2 className="text-base font-semibold text-[#16181d]">
                등록된 규칙
              </h2>
              <RuleListSummary
                page={ruleState.page}
                pageSize={ruleState.pageSize}
                total={ruleState.total}
              />
            </div>
            {filterControls ?? (
              <YouthRuleFilterControls
                selectedCategory={ruleState.selectedCategory}
                selectedTarget={ruleState.selectedTarget}
                targets={targets}
              />
            )}
          </header>

          {rulePageError ? (
            <p className="m-5 rounded-md border border-[#f4b5b5] bg-[#fff5f5] px-4 py-3 text-sm font-semibold text-[#b42318]">
              {rulePageError}
            </p>
          ) : null}

          {currentRules.length > 0 ? (
            <ul
              className={[
                "divide-y divide-[#eef1f5]",
                isRulePagePending ? "opacity-60" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {currentRules.map((rule) => (
                <li key={rule.id} className="grid gap-3 px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="inline-flex h-7 items-center rounded-full border border-[#b8d9d7] bg-[#eef7f6] px-2.5 text-xs font-semibold text-[#196b69]">
                        {rule.category}
                      </span>
                      <span className={getTargetBadgeClass(rule.targetYouthId)}>
                        {rule.targetYouthName ?? "공통"}
                      </span>
                      <time
                        dateTime={rule.createdAt}
                        className="text-xs font-medium text-[#697386]"
                      >
                        {formatDateTime(rule.createdAt)}
                      </time>
                    </div>
                    <form action={deleteRuleAction.bind(null, rule.id)}>
                      <ConfirmSubmitButton
                        message="이 규칙을 삭제하시겠습니까?"
                        type="submit"
                        className={buttonClass(
                          buttonStyles.base,
                          buttonStyles.dangerOutline,
                          "h-8 px-3 text-xs",
                        )}
                      >
                        삭제
                      </ConfirmSubmitButton>
                    </form>
                  </div>
                  <p className="whitespace-pre-wrap break-words text-sm leading-6 text-[#394150] [overflow-wrap:anywhere]">
                    {rule.detail}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-5 rounded-md border border-dashed border-[#cfd6e3] bg-[#fbfcfd] px-4 py-6 text-sm text-[#697386]">
              등록된 규칙이 없습니다.
            </p>
          )}

          <YouthRulesPagination
            isPending={isRulePagePending}
            onPageChange={loadRules ? loadRulePage : undefined}
            page={ruleState.page}
            pendingPage={pendingRulePage}
            selectedCategory={ruleState.selectedCategory}
            selectedTarget={ruleState.selectedTarget}
            totalPages={ruleState.totalPages}
          />
          <YouthRulePendingOverlay />
        </section>
      </RulesListWrapper>
    </section>
  );
}

function StaticRulesListWrapper({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function RuleListSummary({
  page,
  pageSize,
  total,
}: {
  page: number;
  pageSize: number;
  total: number;
}) {
  if (total === 0) {
    return <p className="mt-1 text-sm text-[#697386]">표시할 규칙이 없습니다.</p>;
  }

  const firstItem = (page - 1) * pageSize + 1;
  const lastItem = Math.min(page * pageSize, total);

  return (
    <p className="mt-1 text-sm text-[#697386]">
      {total}건 중 {firstItem}-{lastItem}건 표시
    </p>
  );
}

function YouthRulesPagination({
  isPending,
  onPageChange,
  page,
  pendingPage,
  selectedCategory,
  selectedTarget,
  totalPages,
}: {
  isPending: boolean;
  onPageChange?: (page: number) => void;
  page: number;
  pendingPage: number | null;
  selectedCategory: YouthRuleCategoryFilter;
  selectedTarget: YouthRuleTargetFilter;
  totalPages: number;
}) {
  if (totalPages <= 1) {
    return null;
  }

  return (
    <nav
      aria-label="규칙 페이지"
      className="flex flex-wrap items-center justify-between gap-3 border-t border-[#eef1f5] px-5 py-4"
    >
      <p className="text-sm text-[#697386]">
        {page} / {totalPages} 페이지
      </p>
      <div className="flex gap-2">
        <YouthRulesPaginationLink
          disabled={page <= 1 || isPending}
          href={getYouthRulesPageHref({
            category: selectedCategory,
            page: page - 1,
            target: selectedTarget,
          })}
          onPageChange={onPageChange}
          page={page - 1}
          pending={pendingPage === page - 1}
        >
          이전
        </YouthRulesPaginationLink>
        <YouthRulesPaginationLink
          disabled={page >= totalPages || isPending}
          href={getYouthRulesPageHref({
            category: selectedCategory,
            page: page + 1,
            target: selectedTarget,
          })}
          onPageChange={onPageChange}
          page={page + 1}
          pending={pendingPage === page + 1}
        >
          다음
        </YouthRulesPaginationLink>
      </div>
    </nav>
  );
}

function YouthRulesPaginationLink({
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

function getYouthRulesPageHref({
  category,
  page,
  target,
}: {
  category: YouthRuleCategoryFilter;
  page: number;
  target: YouthRuleTargetFilter;
}) {
  const params = new URLSearchParams();

  if (target !== "all") {
    params.set("target", target);
  }

  if (category !== "all") {
    params.set("category", category);
  }

  if (page > 1) {
    params.set("page", String(page));
  }

  const queryString = params.toString();

  return queryString ? `/youth/rules?${queryString}` : "/youth/rules";
}

function getYouthRulesFiltersFromLocation(params: URLSearchParams): {
  category: YouthRuleCategoryFilter;
  page: number;
  target: YouthRuleTargetFilter;
} {
  return {
    category: normalizeRuleCategoryFilter(params.get("category")),
    page: normalizePositivePage(params.get("page")),
    target: normalizeRuleTargetFilter(params.get("target")),
  };
}

export function YouthRuleChangeLogList({
  actors,
  filterControls,
  filters,
  loadChangeLogs,
  logs,
  targets,
}: {
  actors: YouthRuleChangeLogActor[];
  filterControls?: React.ReactNode;
  filters: YouthRuleChangeLogFilters;
  loadChangeLogs?: (filters: {
    actorId: string;
    category: YouthRuleCategoryFilter;
    page: number;
    target: YouthRuleTargetFilter;
  }) => Promise<YouthActionResult<{ changeLogResult: YouthRuleChangeLogsResult }>>;
  logs: YouthRuleChangeLog[];
  targets: YouthRuleTarget[];
}) {
  const [changeLogState, setChangeLogState] = useState({
    filters,
    logs,
  });
  const [changeLogError, setChangeLogError] = useState("");
  const [pendingChangeLogPage, setPendingChangeLogPage] = useState<
    number | null
  >(null);
  const [isChangeLogPending, startChangeLogTransition] = useTransition();
  const currentFilters = changeLogState.filters;
  const currentLogs = changeLogState.logs;

  const loadChangeLogPage = useCallback(
    (
      nextPage: number,
      options?: {
        filters?: {
          actorId: string;
          category: YouthRuleCategoryFilter;
          page: number;
          target: YouthRuleTargetFilter;
        };
        updateHistory?: boolean;
      },
    ) => {
      if (!loadChangeLogs) {
        return;
      }

      const nextFilters = {
        actorId: options?.filters?.actorId ?? changeLogState.filters.actorId,
        category: options?.filters?.category ?? changeLogState.filters.category,
        page: nextPage,
        target: options?.filters?.target ?? changeLogState.filters.target,
      };
      const updateHistory = options?.updateHistory ?? true;

      setPendingChangeLogPage(nextPage);
      startChangeLogTransition(async () => {
        try {
          const result = await loadChangeLogs(nextFilters);

          if (!result.ok) {
            setChangeLogError(result.error);
            return;
          }

          const { changeLogResult } = result.data;

          setChangeLogState({
            filters: {
              actorId: changeLogResult.actorId,
              category: changeLogResult.category,
              page: changeLogResult.page,
              pageSize: changeLogResult.pageSize,
              target: changeLogResult.target,
              total: changeLogResult.total,
              totalPages: changeLogResult.totalPages,
            },
            logs: changeLogResult.logs,
          });
          setChangeLogError("");

          if (updateHistory) {
            window.history.pushState(
              { youthRuleChangeLogPage: changeLogResult.page },
              "",
              getYouthRuleChangeLogPageHref(
                {
                  actorId: changeLogResult.actorId,
                  category: changeLogResult.category,
                  page: changeLogResult.page,
                  pageSize: changeLogResult.pageSize,
                  target: changeLogResult.target,
                  total: changeLogResult.total,
                  totalPages: changeLogResult.totalPages,
                },
                changeLogResult.page,
              ),
            );
          }
        } finally {
          setPendingChangeLogPage(null);
        }
      });
    },
    [
      changeLogState.filters.actorId,
      changeLogState.filters.category,
      changeLogState.filters.target,
      loadChangeLogs,
    ],
  );

  useEffect(() => {
    if (!loadChangeLogs) {
      return;
    }

    function loadFromHistory() {
      const params = new URLSearchParams(window.location.search);

      if (params.get("tab") !== "history") {
        return;
      }

      const nextFilters = getYouthRuleChangeLogFiltersFromLocation(params);

      loadChangeLogPage(nextFilters.page, {
        filters: nextFilters,
        updateHistory: false,
      });
    }

    window.addEventListener("popstate", loadFromHistory);

    return () => window.removeEventListener("popstate", loadFromHistory);
  }, [loadChangeLogPage, loadChangeLogs]);

  return (
    <section
      aria-label="규칙 변경 내역"
      className="overflow-hidden rounded-md border border-[#d9dee7] bg-white xl:col-span-2"
    >
      <header className="border-b border-[#eef1f5] px-5 py-4">
        <h2 className="text-base font-semibold text-[#16181d]">
          규칙 변경 내역
        </h2>
        <RuleChangeLogListSummary filters={currentFilters} />
      </header>

      {filterControls ?? (
        <YouthRuleChangeLogFilterControls
          actors={actors}
          filters={currentFilters}
          targets={targets}
        />
      )}

      {changeLogError ? (
        <p className="m-5 rounded-md border border-[#f4b5b5] bg-[#fff5f5] px-4 py-3 text-sm font-semibold text-[#b42318]">
          {changeLogError}
        </p>
      ) : null}

      {currentLogs.length > 0 ? (
        <ol
          className={[
            "divide-y divide-[#eef1f5]",
            isChangeLogPending ? "opacity-60" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {currentLogs.map((log) => {
            const detail = getRuleChangeLogDetail(log.metadata);

            return (
              <li
                key={log.id}
                className="grid gap-3 px-5 py-4 lg:grid-cols-[12rem_minmax(0,1fr)]"
              >
                <div className="min-w-0">
                  <time
                    dateTime={log.createdAt}
                    className="text-sm font-semibold text-[#394150]"
                  >
                    {formatDateTime(log.createdAt)}
                  </time>
                  <UserIdentity
                    user={log.actor}
                    size="xs"
                    meta={log.actor.email ?? "이메일 미등록"}
                    className="mt-2"
                    nameClassName="text-[#394150]"
                  />
                </div>
                <div className="min-w-0">
                  <div className="mb-2 flex min-w-0 flex-wrap items-center gap-2">
                    {detail?.category ? (
                      <span className="inline-flex h-7 items-center rounded-full border border-[#b8d9d7] bg-[#eef7f6] px-2.5 text-xs font-semibold text-[#196b69]">
                        {detail.category}
                      </span>
                    ) : null}
                    {detail?.targetLabel ? (
                      <span className={getTargetBadgeClass(detail.targetYouthId)}>
                        {detail.targetLabel}
                      </span>
                    ) : null}
                  </div>
                  <p className="break-words text-sm font-semibold leading-6 text-[#16181d] [overflow-wrap:anywhere]">
                    {log.message ?? "규칙 변경 내역이 기록되었습니다."}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="m-5 rounded-md border border-dashed border-[#cfd6e3] bg-[#fbfcfd] px-4 py-6 text-sm text-[#697386]">
          기록된 규칙 변경 내역이 없습니다.
        </p>
      )}

      <YouthRuleChangeLogPagination
        filters={currentFilters}
        isPending={isChangeLogPending}
        onPageChange={loadChangeLogs ? loadChangeLogPage : undefined}
        pendingPage={pendingChangeLogPage}
      />
    </section>
  );
}

function RuleChangeLogListSummary({
  filters,
}: {
  filters: YouthRuleChangeLogFilters;
}) {
  if (filters.total === 0) {
    return (
      <p className="mt-1 text-sm text-[#697386]">
        표시할 변경 내역이 없습니다.
      </p>
    );
  }

  const firstItem = (filters.page - 1) * filters.pageSize + 1;
  const lastItem = Math.min(filters.page * filters.pageSize, filters.total);

  return (
    <p className="mt-1 text-sm text-[#697386]">
      {filters.total}건 중 {firstItem}-{lastItem}건 표시
    </p>
  );
}

function YouthRuleChangeLogPagination({
  filters,
  isPending,
  onPageChange,
  pendingPage,
}: {
  filters: YouthRuleChangeLogFilters;
  isPending: boolean;
  onPageChange?: (page: number) => void;
  pendingPage: number | null;
}) {
  if (filters.totalPages <= 1) {
    return null;
  }

  return (
    <nav
      aria-label="규칙 변경 내역 페이지"
      className="flex flex-wrap items-center justify-between gap-3 border-t border-[#eef1f5] px-5 py-4"
    >
      <p className="text-sm text-[#697386]">
        {filters.page} / {filters.totalPages} 페이지
      </p>
      <div className="flex gap-2">
        <YouthRulesPaginationLink
          disabled={filters.page <= 1 || isPending}
          href={getYouthRuleChangeLogPageHref(filters, filters.page - 1)}
          onPageChange={onPageChange}
          page={filters.page - 1}
          pending={pendingPage === filters.page - 1}
        >
          이전
        </YouthRulesPaginationLink>
        <YouthRulesPaginationLink
          disabled={filters.page >= filters.totalPages || isPending}
          href={getYouthRuleChangeLogPageHref(filters, filters.page + 1)}
          onPageChange={onPageChange}
          page={filters.page + 1}
          pending={pendingPage === filters.page + 1}
        >
          다음
        </YouthRulesPaginationLink>
      </div>
    </nav>
  );
}

function getYouthRuleChangeLogPageHref(
  filters: YouthRuleChangeLogFilters,
  page: number,
) {
  const params = new URLSearchParams({
    tab: "history",
  });

  if (filters.target !== "all") {
    params.set("historyTarget", filters.target);
  }

  if (filters.category !== "all") {
    params.set("historyCategory", filters.category);
  }

  if (filters.actorId !== "all") {
    params.set("historyStaff", filters.actorId);
  }

  if (page > 1) {
    params.set("historyPage", String(page));
  }

  return `/youth/rules?${params.toString()}`;
}

function getYouthRuleChangeLogFiltersFromLocation(
  params: URLSearchParams,
): {
  actorId: string;
  category: YouthRuleCategoryFilter;
  page: number;
  target: YouthRuleTargetFilter;
} {
  return {
    actorId: normalizeRuleActorId(params.get("historyStaff")),
    category: normalizeRuleCategoryFilter(params.get("historyCategory")),
    page: normalizePositivePage(params.get("historyPage")),
    target: normalizeRuleTargetFilter(params.get("historyTarget")),
  };
}

function normalizeRuleCategoryFilter(
  value: string | null | undefined,
): YouthRuleCategoryFilter {
  return value && isYouthRuleCategory(value) ? value : "all";
}

function normalizeRuleTargetFilter(
  value: string | null | undefined,
): YouthRuleTargetFilter {
  const target = String(value ?? "").trim();

  return target || "all";
}

function normalizeRuleActorId(value: string | null | undefined) {
  const actorId = String(value ?? "").trim();

  return actorId || "all";
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

function getRuleChangeLogDetail(metadata: unknown) {
  if (!isPlainObject(metadata)) {
    return null;
  }

  const category =
    typeof metadata.category === "string" ? metadata.category : null;
  const targetYouthId =
    typeof metadata.targetYouthId === "string" ? metadata.targetYouthId : null;
  const targetYouthName =
    typeof metadata.targetYouthName === "string"
      ? metadata.targetYouthName
      : null;
  const hasTargetMetadata = "targetYouthId" in metadata;
  const targetLabel = targetYouthName ?? (hasTargetMetadata ? "공통" : null);

  if (!category && !targetLabel) {
    return null;
  }

  return {
    category,
    targetLabel,
    targetYouthId,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getTargetBadgeClass(targetYouthId: string | null) {
  return targetYouthId
    ? "inline-flex h-7 items-center rounded-full border border-[#ccd3f2] bg-[#f0f3ff] px-2.5 text-xs font-semibold text-[#2c4da5]"
    : "inline-flex h-7 items-center rounded-full border border-[#efd7a8] bg-[#fff8e6] px-2.5 text-xs font-semibold text-[#7a560d]";
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
