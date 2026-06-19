import assert from "node:assert/strict";
import { describe, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { YouthRulesBoard } from "../src/components/youth-rules-board.tsx";
import type { YouthRule } from "../src/lib/youth-management-core.ts";

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

describe("YouthRulesBoard", () => {
  test("renders dropdowns and detail textarea for rule creation", () => {
    const html = renderToStaticMarkup(
      React.createElement(YouthRulesBoard, {
        createRuleAction: async () => {},
        deleteRuleAction: async () => {},
        page: 1,
        pageSize: 10,
        ruleError: "세부사항을 입력하세요.",
        rules,
        selectedCategory: "all",
        targets: [
          {
            id: "youth-test-001",
            name: "김하늘",
          },
          {
            id: "youth-test-002",
            name: "이도현",
          },
        ],
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
    assert.match(html, /aria-label="규칙 카테고리 필터"/);
    assert.match(html, /<option[^>]*value="all"[^>]*>전체<\/option>/);
    assert.match(html, /12건 중 1-10건 표시/);
    assert.match(html, /1 \/ 2 페이지/);
    assert.match(html, /href="\/youth\/rules\?page=2"/);
    assert.match(html, /김하늘/);
    assert.match(html, /공통/);
    assert.match(html, /저녁 학습 시간에는 휴대폰을 보관/);
    assert.match(html, />삭제</);
  });

  test("renders an empty state when no youth rules exist", () => {
    const html = renderToStaticMarkup(
      React.createElement(YouthRulesBoard, {
        createRuleAction: async () => {},
        deleteRuleAction: async () => {},
        page: 1,
        pageSize: 10,
        rules: [],
        selectedCategory: "all",
        targets: [],
        total: 0,
        totalPages: 1,
      }),
    );

    assert.match(html, /등록된 규칙이 없습니다/);
    assert.match(html, /표시할 규칙이 없습니다/);
  });
});
