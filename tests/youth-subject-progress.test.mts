import assert from "node:assert/strict";
import { describe, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { YouthSubjectProgressBoard } from "../src/components/youth-subject-progress-board.tsx";
import {
  createYouthStudyConceptCheckKey,
  getYouthStudyCurriculum,
  getYouthStudySubjectLabel,
  getYouthStudySubunitLabel,
  getYouthStudySubunits,
  isYouthStudySubject,
  isYouthStudySubunitId,
  normalizeYouthStudyConceptContent,
  validateYouthStudyConceptContent,
  youthStudyConceptMaxLength,
  youthStudySubjects,
  type YouthStudyConcept,
  type YouthStudyConceptCheck,
} from "../src/lib/youth-subject-progress-core.ts";

const youths = [
  { id: "youth-001", name: "김하늘" },
  { id: "youth-002", name: "이바다" },
];

const concepts: YouthStudyConcept[] = [
  {
    id: "concept-001",
    subject: "math",
    subunitId: "1-1",
    content: "소수는 무엇인가?",
    createdAt: "2026-06-30T09:00:00.000Z",
  },
  {
    id: "concept-002",
    subject: "math",
    subunitId: "1-1",
    content: "합성수는 무엇인가?",
    createdAt: "2026-06-30T10:00:00.000Z",
  },
];

const checks: YouthStudyConceptCheck[] = [
  {
    conceptId: "concept-001",
    youthId: "youth-001",
  },
];

describe("youth study curriculum core", () => {
  test("includes the math subject", () => {
    assert.ok(youthStudySubjects.some((subject) => subject.value === "math"));
    assert.equal(isYouthStudySubject("math"), true);
    assert.equal(isYouthStudySubject("english"), false);
    assert.equal(getYouthStudySubjectLabel("math"), "수학");
  });

  test("splits the math curriculum into two semesters with eight units", () => {
    const curriculum = getYouthStudyCurriculum("math");

    assert.equal(curriculum.length, 2);
    assert.equal(curriculum[0].label, "1학기");
    assert.equal(curriculum[1].label, "2학기");
    assert.equal(
      curriculum.reduce((count, semester) => count + semester.units.length, 0),
      8,
    );
  });

  test("keeps subunit ids unique across the math curriculum", () => {
    const subunits = getYouthStudySubunits("math");
    const uniqueIds = new Set(subunits.map((subunit) => subunit.id));

    assert.equal(uniqueIds.size, subunits.length);
    assert.equal(subunits.length, 18);
  });

  test("validates subunit ids by subject", () => {
    assert.equal(isYouthStudySubunitId("math", "1-1"), true);
    assert.equal(isYouthStudySubunitId("math", "8-2"), true);
    assert.equal(isYouthStudySubunitId("math", "9-1"), false);
    assert.equal(isYouthStudySubunitId("english", "1-1"), false);
  });

  test("resolves subunit labels", () => {
    assert.equal(getYouthStudySubunitLabel("math", "1-1"), "1-1. 소인수분해");
    assert.equal(
      getYouthStudySubunitLabel("math", "5-3"),
      "5-3. 작도와 합동",
    );
  });

  test("normalizes concept content by trimming and stringifying", () => {
    assert.equal(normalizeYouthStudyConceptContent("  내용  "), "내용");
    assert.equal(normalizeYouthStudyConceptContent(null), "");
    assert.equal(normalizeYouthStudyConceptContent(undefined), "");
  });

  test("rejects empty concept content", () => {
    assert.equal(
      validateYouthStudyConceptContent(""),
      "개념 내용을 입력하세요.",
    );
  });

  test("rejects concept content over the max length", () => {
    const error = validateYouthStudyConceptContent(
      "가".repeat(youthStudyConceptMaxLength + 1),
    );

    assert.match(error, /이하로 입력하세요/);
  });

  test("accepts concept content within the max length", () => {
    assert.equal(
      validateYouthStudyConceptContent("가".repeat(youthStudyConceptMaxLength)),
      "",
    );
  });

  test("creates concept check keys", () => {
    assert.equal(
      createYouthStudyConceptCheckKey("concept-001", "youth-001"),
      "concept-001:youth-001",
    );
  });
});

describe("YouthSubjectProgressBoard", () => {
  test("renders subject tabs with semester, unit, and subunit structure", () => {
    const markup = renderToStaticMarkup(
      React.createElement(YouthSubjectProgressBoard, {
        youths,
        concepts,
        checks,
      }),
    );

    assert.match(markup, /수학/);
    assert.match(markup, /aria-selected="true"/);
    assert.match(markup, /1학기/);
    assert.match(markup, /2학기/);
    assert.match(markup, /1\. 소인수분해/);
    assert.match(markup, /1-2\. 최대공약수와 최소공배수/);
    assert.match(markup, /8-2\. 상대도수/);
  });

  test("renders concept rows with per-student check columns", () => {
    const markup = renderToStaticMarkup(
      React.createElement(YouthSubjectProgressBoard, {
        youths,
        concepts,
        checks,
      }),
    );

    assert.match(markup, /소수는 무엇인가\?/);
    assert.match(markup, /합성수는 무엇인가\?/);
    assert.match(markup, /김하늘/);
    assert.match(markup, /이바다/);
    assert.match(markup, /aria-label="김하늘 - 소수는 무엇인가\?"[^>]*checked/);
    assert.doesNotMatch(
      markup,
      /aria-label="이바다 - 소수는 무엇인가\?"[^>]*checked/,
    );
  });

  test("renders empty subunit states and concept add forms", () => {
    const markup = renderToStaticMarkup(
      React.createElement(YouthSubjectProgressBoard, {
        youths,
        concepts: [],
        checks: [],
      }),
    );

    assert.match(markup, /아직 등록된 개념이 없습니다/);
    assert.match(markup, /개념 추가/);
    assert.doesNotMatch(markup, /<table/);
  });

  test("renders an empty state without students", () => {
    const markup = renderToStaticMarkup(
      React.createElement(YouthSubjectProgressBoard, {
        youths: [],
        concepts: [],
        checks: [],
      }),
    );

    assert.match(markup, /등록된 학생이 없습니다/);
  });
});
