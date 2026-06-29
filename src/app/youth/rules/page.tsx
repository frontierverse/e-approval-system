import Link from "next/link";
import { PageTitle } from "@/components/page-title";
import {
  YouthRuleChangeLogList,
  YouthRulesBoard,
} from "@/components/youth-rules-board";
import { requireUser } from "@/lib/auth";
import {
  getYouthRuleChangeLogActors,
  getYouthRuleChangeLogs,
  getYouthRules,
  getYouthRuleTargets,
  type YouthRuleCategoryFilter,
  type YouthRuleTargetFilter,
} from "@/lib/youth-rules";
import { isYouthRuleCategory } from "@/lib/youth-management-core";
import {
  createYouthRuleAction,
  deleteYouthRuleAction,
  getYouthRuleChangeLogsAction,
  getYouthRulesAction,
} from "@/app/youth/rules/actions";

type SearchParamValue = string | string[] | undefined;
type YouthRulesTab = "rules" | "history";

type YouthRulesPageProps = {
  searchParams: Promise<{
    category?: SearchParamValue;
    historyCategory?: SearchParamValue;
    historyPage?: SearchParamValue;
    historyStaff?: SearchParamValue;
    historyTarget?: SearchParamValue;
    page?: SearchParamValue;
    ruleError?: SearchParamValue;
    tab?: SearchParamValue;
    target?: SearchParamValue;
  }>;
};

export default async function YouthRulesPage({
  searchParams,
}: YouthRulesPageProps) {
  await requireUser();
  const params = await searchParams;
  const activeTab = getSelectedRulesTab(params.tab);

  return (
    <>
      <PageTitle
        title="규칙"
        description="청소년 생활과 학습에 필요한 규칙을 카테고리별로 기록합니다."
      />

      <YouthRulesTabs activeTab={activeTab} />

      <div className="mt-6">
        {activeTab === "history" ? (
          <YouthRuleChangeLogPanel params={params} />
        ) : (
          <YouthRulePanel params={params} />
        )}
      </div>
    </>
  );
}

async function YouthRulePanel({
  params,
}: {
  params: Awaited<YouthRulesPageProps["searchParams"]>;
}) {
  const selectedCategory = getSelectedRuleCategory(params.category);
  const selectedPage = getSelectedPage(params.page);
  const targets = await getYouthRuleTargets();
  const selectedTarget = getSelectedRuleTarget(params.target, targets);
  const ruleResult = await getYouthRules({
    category: selectedCategory,
    page: selectedPage,
    target: selectedTarget,
  });

  return (
    <YouthRulesBoard
      key={[
        ruleResult.category,
        ruleResult.target,
        ruleResult.page,
        getRuleError(params.ruleError),
      ].join(":")}
      createRuleAction={createYouthRuleAction}
      deleteRuleAction={deleteYouthRuleAction}
      loadRules={getYouthRulesAction}
      page={ruleResult.page}
      pageSize={ruleResult.pageSize}
      ruleError={getRuleError(params.ruleError)}
      rules={ruleResult.rules}
      selectedCategory={ruleResult.category}
      selectedTarget={ruleResult.target}
      targets={targets}
      total={ruleResult.total}
      totalPages={ruleResult.totalPages}
    />
  );
}

async function YouthRuleChangeLogPanel({
  params,
}: {
  params: Awaited<YouthRulesPageProps["searchParams"]>;
}) {
  const [targets, actors] = await Promise.all([
    getYouthRuleTargets(),
    getYouthRuleChangeLogActors(),
  ]);
  const selectedCategory = getSelectedRuleCategory(params.historyCategory);
  const selectedTarget = getSelectedRuleTarget(params.historyTarget, targets);
  const selectedActorId = getSelectedActorId(params.historyStaff, actors);
  const changeLogResult = await getYouthRuleChangeLogs({
    actorId: selectedActorId,
    category: selectedCategory,
    page: getSelectedPage(params.historyPage),
    target: selectedTarget,
  });

  return (
    <YouthRuleChangeLogList
      key={[
        changeLogResult.actorId,
        changeLogResult.category,
        changeLogResult.target,
        changeLogResult.page,
      ].join(":")}
      actors={actors}
      filters={{
        actorId: changeLogResult.actorId,
        category: changeLogResult.category,
        page: changeLogResult.page,
        pageSize: changeLogResult.pageSize,
        target: changeLogResult.target,
        total: changeLogResult.total,
        totalPages: changeLogResult.totalPages,
      }}
      loadChangeLogs={getYouthRuleChangeLogsAction}
      logs={changeLogResult.logs}
      targets={targets}
    />
  );
}

function YouthRulesTabs({ activeTab }: { activeTab: YouthRulesTab }) {
  return (
    <nav aria-label="규칙 항목" className="border-b border-[#d9dee7]">
      <div className="flex gap-2 overflow-x-auto">
        <YouthRulesTabLink
          active={activeTab === "rules"}
          href="/youth/rules"
          label="규칙"
        />
        <YouthRulesTabLink
          active={activeTab === "history"}
          href="/youth/rules?tab=history"
          label="변경내역"
        />
      </div>
    </nav>
  );
}

function YouthRulesTabLink({
  active,
  href,
  label,
}: {
  active: boolean;
  href: string;
  label: string;
}) {
  return (
    <Link
      aria-current={active ? "page" : undefined}
      href={href}
      className={[
        "relative flex h-12 min-w-28 items-center justify-center rounded-t-md border border-transparent px-4 text-sm font-semibold transition-colors",
        active
          ? "border-[#c9dddb] border-b-white bg-white text-[#0f5553]"
          : "text-[#394150] hover:border-[#c7dfdc] hover:bg-[#e7f5f3] hover:text-[#12343b]",
      ].join(" ")}
    >
      {label}
      <span
        aria-hidden="true"
        className={[
          "absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-[#196b69] transition-opacity",
          active ? "opacity-100" : "opacity-0",
        ].join(" ")}
      />
    </Link>
  );
}

function getSelectedRulesTab(value: SearchParamValue): YouthRulesTab {
  return getSingleParam(value) === "history" ? "history" : "rules";
}

function getSelectedRuleCategory(
  value: SearchParamValue,
): YouthRuleCategoryFilter {
  const category = getSingleParam(value);

  return category && isYouthRuleCategory(category) ? category : "all";
}

function getSelectedPage(value: SearchParamValue) {
  const page = Number(getSingleParam(value));

  return Number.isInteger(page) && page > 0 ? page : 1;
}

function getSelectedRuleTarget(
  value: SearchParamValue,
  targets: Array<{ id: string }>,
): YouthRuleTargetFilter {
  const target = getSingleParam(value);

  if (target === "common") {
    return "common";
  }

  return target && targets.some((item) => item.id === target) ? target : "all";
}

function getSelectedActorId(
  value: SearchParamValue,
  actors: Array<{ id: string }>,
) {
  const actorId = getSingleParam(value);

  return actorId && actors.some((actor) => actor.id === actorId)
    ? actorId
    : "all";
}

function getRuleError(value: SearchParamValue) {
  return getSingleParam(value);
}

function getSingleParam(value: SearchParamValue) {
  return Array.isArray(value) ? value[0] : value;
}
