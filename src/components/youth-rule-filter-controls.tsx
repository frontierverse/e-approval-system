"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useTransition,
} from "react";
import type { ChangeEvent } from "react";
import {
  youthRuleCategories,
  type YouthRuleCategoryFilter,
  type YouthRuleTarget,
  type YouthRuleTargetFilter,
} from "@/lib/youth-management-core";

type YouthRuleFilterControlsProps = {
  selectedCategory: YouthRuleCategoryFilter;
  selectedTarget: YouthRuleTargetFilter;
  targets: YouthRuleTarget[];
};

type YouthRuleListTransitionContextValue = {
  isPending: boolean;
  navigate: (href: string) => void;
};

const YouthRuleListTransitionContext =
  createContext<YouthRuleListTransitionContextValue | null>(null);

export function YouthRuleListTransitionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const navigate = useCallback(
    (href: string) => {
      startTransition(() => {
        router.replace(href, { scroll: false });
      });
    },
    [router],
  );
  const contextValue = useMemo(
    () => ({
      isPending,
      navigate,
    }),
    [isPending, navigate],
  );

  return (
    <YouthRuleListTransitionContext.Provider value={contextValue}>
      {children}
    </YouthRuleListTransitionContext.Provider>
  );
}

export function YouthRulePendingOverlay() {
  const transition = useContext(YouthRuleListTransitionContext);

  if (!transition?.isPending) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center">
      <div
        aria-live="polite"
        className="inline-flex h-11 items-center gap-2 rounded-md border border-[#cfd6e3] bg-white px-4 text-sm font-semibold text-[#394150] shadow-sm"
        role="status"
      >
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#cfd6e3] border-t-[#196b69]" />
        목록 갱신 중
      </div>
    </div>
  );
}

export function YouthRuleFilterControls({
  selectedCategory,
  selectedTarget,
  targets,
}: YouthRuleFilterControlsProps) {
  const transition = useContext(YouthRuleListTransitionContext);

  if (transition) {
    return (
      <YouthRuleFilterControlsContent
        isPending={transition.isPending}
        navigate={transition.navigate}
        selectedCategory={selectedCategory}
        selectedTarget={selectedTarget}
        targets={targets}
      />
    );
  }

  return (
    <YouthRuleFilterControlsWithRouter
      selectedCategory={selectedCategory}
      selectedTarget={selectedTarget}
      targets={targets}
    />
  );
}

function YouthRuleFilterControlsWithRouter({
  selectedCategory,
  selectedTarget,
  targets,
}: YouthRuleFilterControlsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function navigate(href: string) {
    startTransition(() => {
      router.replace(href, { scroll: false });
    });
  }

  return (
    <YouthRuleFilterControlsContent
      isPending={isPending}
      navigate={navigate}
      selectedCategory={selectedCategory}
      selectedTarget={selectedTarget}
      targets={targets}
    />
  );
}

export function YouthRuleFilterControlsContent({
  isPending = false,
  navigate,
  selectedCategory,
  selectedTarget,
  targets,
}: YouthRuleFilterControlsProps & {
  isPending?: boolean;
  navigate: (href: string) => void;
}) {
  function navigateToFilters({
    category = selectedCategory,
    target = selectedTarget,
  }: {
    category?: YouthRuleCategoryFilter;
    target?: YouthRuleTargetFilter;
  }) {
    navigate(createYouthRulesFilterHref({ category, target }));
  }

  function handleTargetChange(event: ChangeEvent<HTMLSelectElement>) {
    const target = event.currentTarget.value as YouthRuleTargetFilter;
    navigateToFilters({ target });
  }

  function handleCategoryChange(event: ChangeEvent<HTMLSelectElement>) {
    const category = event.currentTarget.value as YouthRuleCategoryFilter;
    navigateToFilters({ category });
  }

  return (
    <div
      aria-label="규칙 필터"
      className="flex min-w-0 flex-wrap items-end gap-2"
      key={`${selectedTarget}:${selectedCategory}`}
      role="group"
    >
      <label>
        <span className="block text-xs font-semibold text-[#697386]">대상</span>
        <select
          aria-label="규칙 대상 필터"
          disabled={isPending}
          name="target"
          defaultValue={selectedTarget}
          onChange={handleTargetChange}
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
          aria-label="규칙 카테고리 필터"
          disabled={isPending}
          name="category"
          defaultValue={selectedCategory}
          onChange={handleCategoryChange}
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
    </div>
  );
}

function createYouthRulesFilterHref({
  category,
  target,
}: {
  category: YouthRuleCategoryFilter;
  target: YouthRuleTargetFilter;
}) {
  const params = new URLSearchParams();

  if (target !== "all") {
    params.set("target", target);
  }

  if (category !== "all") {
    params.set("category", category);
  }

  const queryString = params.toString();

  return queryString ? `/youth/rules?${queryString}` : "/youth/rules";
}
