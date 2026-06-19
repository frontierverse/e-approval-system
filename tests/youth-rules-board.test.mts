import assert from "node:assert/strict";
import { describe, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { YouthRuleChangeLogFilterControlsContent } from "../src/components/youth-rule-change-log-filter-controls.tsx";
import { YouthRuleFilterControlsContent } from "../src/components/youth-rule-filter-controls.tsx";
import {
  YouthRuleChangeLogList,
  YouthRulesBoard,
} from "../src/components/youth-rules-board.tsx";
import type {
  YouthRule,
  YouthRuleChangeLogActor,
  YouthRuleChangeLog,
  YouthRuleChangeLogFilters,
  YouthRuleCategoryFilter,
  YouthRuleTarget,
  YouthRuleTargetFilter,
} from "../src/lib/youth-management-core.ts";

const rules: YouthRule[] = [
  {
    id: "rule-test-001",
    category: "학습",
    detail: "저녁 학습 시간에는 휴대폰을 보관하고 과제 완료 후 확인합니다.",
    targetYouthId: "youth-test-001",
    targetYouthName: "김하늘",
    createdAt: "2026-06-19T03:00:00.000Z",
  },
  {
    id: "rule-test-002",
    category: "생활",
    detail: "공통 생활 규칙입니다.",
    targetYouthId: null,
    targetYouthName: null,
    createdAt: "2026-06-19T02:00:00.000Z",
  },
];

const targets: YouthRuleTarget[] = [
  {
    id: "youth-test-001",
    name: "김하늘",
  },
  {
    id: "youth-test-002",
    name: "이도현",
  },
];

const changeLogs: YouthRuleChangeLog[] = [
  {
    id: "rule-change-log-001",
    message: "김하늘 대상 학습 규칙을 생성했습니다.",
    metadata: {
      category: "학습",
      source: "youth-rules",
      targetYouthId: "youth-test-001",
      targetYouthName: "김하늘",
    },
    createdAt: "2026-06-19T04:00:00.000Z",
    actor: {
      id: "user-test-001",
      name: "최윤서",
      email: "staff@example.com",
      profileImageStorageKey: null,
      profileImageUpdatedAt: null,
    },
  },
];

const changeLogActors: YouthRuleChangeLogActor[] = [
  {
    id: "user-test-001",
    name: "최윤서",
    email: "staff@example.com",
  },
  {
    id: "user-test-002",
    name: "정하리",
    email: "teacher@example.com",
  },
];

const changeLogFilters: YouthRuleChangeLogFilters = {
  actorId: "all",
  category: "all",
  page: 1,
  pageSize: 10,
  target: "all",
  total: 16,
  totalPages: 2,
};

describe("YouthRulesBoard", () => {
  test("renders dropdowns and detail textarea for rule creation", () => {
    const html = renderToStaticMarkup(
      React.createElement(YouthRulesBoard, {
        createRuleAction: async () => {},
        deleteRuleAction: async () => {},
        filterControls: createRuleFilterControls(),
        page: 1,
        pageSize: 10,
        ruleError: "세부사항을 입력하세요.",
        rules,
        selectedCategory: "all",
        selectedTarget: "all",
        targets,
        total: 12,
        totalPages: 2,
      }),
    );

    assert.match(html, /규칙 생성/);
    assert.match(html, /name="category"/);
    assert.match(html, /<option[^>]*value="생활"/);
    assert.match(html, /<option[^>]*value="학습"/);
    assert.match(html, /name="targetYouthId"/);
    assert.match(html, /<option[^>]*value=""[^>]*>공통<\/option>/);
    assert.match(html, /<option[^>]*value="youth-test-001">김하늘<\/option>/);
    assert.match(html, /<option[^>]*value="youth-test-002">이도현<\/option>/);
    assert.match(html, /name="detail"/);
    assert.match(html, /textarea/);
    assert.match(html, /세부사항을 입력하세요\./);
    assert.match(html, /등록된 규칙/);
    assert.match(html, /aria-label="규칙 필터"/);
    assert.match(html, /aria-label="규칙 대상 필터"/);
    assert.match(html, /aria-label="규칙 카테고리 필터"/);
    assert.match(html, /<option[^>]*value="all"[^>]*>전체 대상<\/option>/);
    assert.match(html, /<option[^>]*value="all"[^>]*>전체<\/option>/);
    assert.doesNotMatch(html, />보기</);
    assert.ok(
      html.indexOf('aria-label="규칙 대상 필터"') <
        html.indexOf('aria-label="규칙 카테고리 필터"'),
    );
    assert.match(html, /12건 중 1-10건 표시/);
    assert.match(html, /1 \/ 2 페이지/);
    assert.match(html, /href="\/youth\/rules\?page=2"/);
    assert.match(html, /김하늘/);
    assert.match(html, /공통/);
    assert.match(html, /저녁 학습 시간에는 휴대폰을 보관/);
    assert.match(html, />삭제</);
    assert.doesNotMatch(html, /규칙 변경 내역/);
  });

  test("renders an empty state when no youth rules exist", () => {
    const html = renderToStaticMarkup(
      React.createElement(YouthRulesBoard, {
        createRuleAction: async () => {},
        deleteRuleAction: async () => {},
        filterControls: createRuleFilterControls({
          targets: [],
        }),
        page: 1,
        pageSize: 10,
        rules: [],
        selectedCategory: "all",
        selectedTarget: "all",
        targets: [],
        total: 0,
        totalPages: 1,
      }),
    );

    assert.match(html, /등록된 규칙이 없습니다/);
    assert.match(html, /표시할 규칙이 없습니다/);
  });

  test("keeps target and category filters on pagination links", () => {
    const html = renderToStaticMarkup(
      React.createElement(YouthRulesBoard, {
        createRuleAction: async () => {},
        deleteRuleAction: async () => {},
        filterControls: createRuleFilterControls({
          selectedCategory: "학습",
          selectedTarget: "common",
          targets: [],
        }),
        page: 1,
        pageSize: 10,
        rules,
        selectedCategory: "학습",
        selectedTarget: "common",
        targets: [],
        total: 12,
        totalPages: 2,
      }),
    );

    assert.match(
      html,
      /href="\/youth\/rules\?target=common&amp;category=%ED%95%99%EC%8A%B5&amp;page=2"/,
    );
  });

  test("does not add inline filter content while filters are changing", () => {
    const html = renderToStaticMarkup(
      createRuleFilterControls({
        isPending: true,
      }),
    );

    assert.match(html, /disabled=""/);
    assert.doesNotMatch(html, /role="status"/);
    assert.doesNotMatch(html, /목록 갱신 중/);
  });
});

describe("YouthRuleChangeLogList", () => {
  test("renders change logs with ten items per page pagination", () => {
    const html = renderToStaticMarkup(
      React.createElement(YouthRuleChangeLogList, {
        actors: changeLogActors,
        filterControls: createChangeLogFilterControls(),
        filters: changeLogFilters,
        logs: changeLogs,
        targets,
      }),
    );

    assert.match(html, /규칙 변경 내역/);
    assert.match(html, /16건 중 1-10건 표시/);
    assert.match(html, /name="historyTarget"/);
    assert.match(html, /name="historyCategory"/);
    assert.match(html, /name="historyStaff"/);
    assert.doesNotMatch(html, /action="\/youth\/rules"/);
    assert.doesNotMatch(html, /method="get"/);
    assert.match(html, /<option[^>]*value="all"[^>]*>전체 대상<\/option>/);
    assert.match(html, /<option[^>]*value="common"[^>]*>공통<\/option>/);
    assert.match(html, /<option[^>]*value="youth-test-001">김하늘<\/option>/);
    assert.match(html, /<option[^>]*value="all"[^>]*>전체<\/option>/);
    assert.match(html, /<option[^>]*value="학습"/);
    assert.match(html, /<option[^>]*value="all"[^>]*>전체 직원<\/option>/);
    assert.match(html, /<option[^>]*value="user-test-001">최윤서<\/option>/);
    assert.match(html, /김하늘 대상 학습 규칙을 생성했습니다/);
    assert.match(html, /최윤서/);
    assert.match(html, /staff@example\.com/);
    assert.match(
      html,
      /href="\/youth\/rules\?tab=history&amp;historyPage=2"/,
    );
  });

  test("renders an empty state when no rule change logs exist", () => {
    const html = renderToStaticMarkup(
      React.createElement(YouthRuleChangeLogList, {
        actors: [],
        filterControls: createChangeLogFilterControls({
          actors: [],
          filters: {
            actorId: "all",
            category: "all",
            page: 1,
            pageSize: 10,
            target: "all",
            total: 0,
            totalPages: 1,
          },
          targets: [],
        }),
        filters: {
          actorId: "all",
          category: "all",
          page: 1,
          pageSize: 10,
          target: "all",
          total: 0,
          totalPages: 1,
        },
        logs: [],
        targets: [],
      }),
    );

    assert.match(html, /기록된 규칙 변경 내역이 없습니다/);
    assert.match(html, /표시할 변경 내역이 없습니다/);
  });

  test("uses the history tab URL on change history pagination links", () => {
    const html = renderToStaticMarkup(
      React.createElement(YouthRuleChangeLogList, {
        actors: changeLogActors,
        filterControls: createChangeLogFilterControls({
          filters: {
            actorId: "user-test-001",
            category: "학습",
            page: 2,
            pageSize: 10,
            target: "common",
            total: 21,
            totalPages: 3,
          },
        }),
        filters: {
          actorId: "user-test-001",
          category: "학습",
          page: 2,
          pageSize: 10,
          target: "common",
          total: 21,
          totalPages: 3,
        },
        logs: changeLogs,
        targets,
      }),
    );

    assert.match(html, /21건 중 11-20건 표시/);
    assert.match(html, /초기화/);
    assert.match(
      html,
      /href="\/youth\/rules\?tab=history&amp;historyTarget=common&amp;historyCategory=%ED%95%99%EC%8A%B5&amp;historyStaff=user-test-001&amp;historyPage=3"/,
    );
  });
});

function createChangeLogFilterControls({
  actors = changeLogActors,
  filters = changeLogFilters,
  isPending = false,
  targets: ruleTargets = targets,
}: {
  actors?: YouthRuleChangeLogActor[];
  filters?: YouthRuleChangeLogFilters;
  isPending?: boolean;
  targets?: YouthRuleTarget[];
} = {}) {
  return React.createElement(YouthRuleChangeLogFilterControlsContent, {
    actors,
    filters,
    isPending,
    navigate: () => {},
    targets: ruleTargets,
  });
}

function createRuleFilterControls({
  isPending = false,
  selectedCategory = "all",
  selectedTarget = "all",
  targets: ruleTargets = targets,
}: {
  isPending?: boolean;
  selectedCategory?: YouthRuleCategoryFilter;
  selectedTarget?: YouthRuleTargetFilter;
  targets?: YouthRuleTarget[];
} = {}) {
  return React.createElement(YouthRuleFilterControlsContent, {
    isPending,
    navigate: () => {},
    selectedCategory,
    selectedTarget,
    targets: ruleTargets,
  });
}
