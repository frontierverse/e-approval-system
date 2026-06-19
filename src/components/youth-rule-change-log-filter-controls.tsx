"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { FormEvent } from "react";
import { buttonClass, buttonStyles } from "@/lib/button-styles";
import {
  youthRuleCategories,
  type YouthRuleChangeLogActor,
  type YouthRuleChangeLogFilters,
  type YouthRuleCategoryFilter,
  type YouthRuleTarget,
  type YouthRuleTargetFilter,
} from "@/lib/youth-management-core";

type YouthRuleChangeLogFilterControlsProps = {
  actors: YouthRuleChangeLogActor[];
  filters: YouthRuleChangeLogFilters;
  targets: YouthRuleTarget[];
};

export function YouthRuleChangeLogFilterControls(
  props: YouthRuleChangeLogFilterControlsProps,
) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function navigate(href: string) {
    startTransition(() => {
      router.replace(href, { scroll: false });
    });
  }

  return (
    <YouthRuleChangeLogFilterControlsContent
      {...props}
      isPending={isPending}
      navigate={navigate}
    />
  );
}

export function YouthRuleChangeLogFilterControlsContent({
  actors,
  filters,
  isPending = false,
  navigate,
  targets,
}: YouthRuleChangeLogFilterControlsProps & {
  isPending?: boolean;
  navigate: (href: string) => void;
}) {
  const hasFilters =
    filters.actorId !== "all" ||
    filters.category !== "all" ||
    filters.target !== "all";

  function submitFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    navigate(
      createYouthRuleChangeLogFilterHref({
        actorId: String(formData.get("historyStaff") ?? "all"),
        category: String(formData.get("historyCategory") ?? "all"),
        target: String(formData.get("historyTarget") ?? "all"),
      }),
    );
  }

  return (
    <div className="border-b border-[#eef1f5] bg-white p-4">
      <form
        className="flex min-w-0 flex-wrap items-end gap-2"
        onSubmit={submitFilters}
      >
        <label>
          <span className="block text-xs font-semibold text-[#697386]">
            대상
          </span>
          <select
            aria-label="변경내역 대상 필터"
            disabled={isPending}
            name="historyTarget"
            defaultValue={filters.target}
            className="mt-2 block h-10 w-40 rounded-md border border-[#cfd6e3] bg-white px-3 text-sm outline-none focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
          >
            <option value="all">전체 대상</option>
            <option value="common">공통</option>
            {targets.map((target) => (
              <option key={target.id} value={target.id}>
                {target.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="block text-xs font-semibold text-[#697386]">
            카테고리
          </span>
          <select
            aria-label="변경내역 카테고리 필터"
            disabled={isPending}
            name="historyCategory"
            defaultValue={filters.category}
            className="mt-2 block h-10 w-36 rounded-md border border-[#cfd6e3] bg-white px-3 text-sm outline-none focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
          >
            <option value="all">전체</option>
            {youthRuleCategories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="block text-xs font-semibold text-[#697386]">
            직원
          </span>
          <select
            aria-label="변경내역 직원 필터"
            disabled={isPending}
            name="historyStaff"
            defaultValue={filters.actorId}
            className="mt-2 block h-10 w-44 rounded-md border border-[#cfd6e3] bg-white px-3 text-sm outline-none focus:border-[#196b69] focus:ring-2 focus:ring-[#d7eceb]"
          >
            <option value="all">전체 직원</option>
            {actors.map((actor) => (
              <option key={actor.id} value={actor.id}>
                {actor.name}
              </option>
            ))}
          </select>
        </label>

        <button
          type="submit"
          disabled={isPending}
          className={buttonClass(
            buttonStyles.base,
            buttonStyles.filter,
            "h-10 px-4 text-sm",
          )}
        >
          {isPending ? "적용 중" : "적용"}
        </button>
        {hasFilters ? (
          <button
            type="button"
            disabled={isPending}
            onClick={() => navigate("/youth/rules?tab=history")}
            className={buttonClass(
              buttonStyles.base,
              buttonStyles.neutral,
              "h-10 px-4 text-sm",
            )}
          >
            초기화
          </button>
        ) : null}
      </form>
    </div>
  );
}

function createYouthRuleChangeLogFilterHref({
  actorId,
  category,
  target,
}: {
  actorId: string;
  category: string;
  target: string;
}) {
  const params = new URLSearchParams({
    tab: "history",
  });
  const normalizedTarget = normalizeTargetFilter(target);
  const normalizedCategory = normalizeCategoryFilter(category);
  const normalizedActorId = actorId.trim();

  if (normalizedTarget !== "all") {
    params.set("historyTarget", normalizedTarget);
  }

  if (normalizedCategory !== "all") {
    params.set("historyCategory", normalizedCategory);
  }

  if (normalizedActorId && normalizedActorId !== "all") {
    params.set("historyStaff", normalizedActorId);
  }

  return `/youth/rules?${params.toString()}`;
}

function normalizeTargetFilter(value: string): YouthRuleTargetFilter {
  const normalizedValue = value.trim();

  return normalizedValue ? normalizedValue : "all";
}

function normalizeCategoryFilter(value: string): YouthRuleCategoryFilter {
  return youthRuleCategories.some((category) => category === value)
    ? (value as YouthRuleCategoryFilter)
    : "all";
}
