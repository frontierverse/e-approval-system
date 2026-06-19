import { PageTitle } from "@/components/page-title";
import { YouthRulesBoard } from "@/components/youth-rules-board";
import { requireUser } from "@/lib/auth";
import {
  getYouthRules,
  getYouthRuleTargets,
  type YouthRuleCategoryFilter,
} from "@/lib/youth-rules";
import { isYouthRuleCategory } from "@/lib/youth-management-core";
import {
  createYouthRuleAction,
  deleteYouthRuleAction,
} from "@/app/youth/rules/actions";

type YouthRulesPageProps = {
  searchParams: Promise<{
    category?: string | string[];
    page?: string | string[];
    ruleError?: string | string[];
  }>;
};

export default async function YouthRulesPage({
  searchParams,
}: YouthRulesPageProps) {
  await requireUser();
  const params = await searchParams;
  const selectedCategory = getSelectedRuleCategory(params.category);
  const selectedPage = getSelectedPage(params.page);
  const [ruleResult, targets] = await Promise.all([
    getYouthRules({
      category: selectedCategory,
      page: selectedPage,
    }),
    getYouthRuleTargets(),
  ]);

  return (
    <>
      <PageTitle
        title="규칙"
        description="청소년 생활과 학습에 필요한 규칙을 카테고리별로 기록합니다."
      />

      <YouthRulesBoard
        createRuleAction={createYouthRuleAction}
        deleteRuleAction={deleteYouthRuleAction}
        page={ruleResult.page}
        pageSize={ruleResult.pageSize}
        ruleError={getRuleError(params.ruleError)}
        rules={ruleResult.rules}
        selectedCategory={ruleResult.category}
        targets={targets}
        total={ruleResult.total}
        totalPages={ruleResult.totalPages}
      />
    </>
  );
}

function getSelectedRuleCategory(
  value: string | string[] | undefined,
): YouthRuleCategoryFilter {
  const category = Array.isArray(value) ? value[0] : value;

  return category && isYouthRuleCategory(category) ? category : "all";
}

function getSelectedPage(value: string | string[] | undefined) {
  const pageValue = Array.isArray(value) ? value[0] : value;
  const page = Number(pageValue);

  return Number.isInteger(page) && page > 0 ? page : 1;
}

function getRuleError(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
