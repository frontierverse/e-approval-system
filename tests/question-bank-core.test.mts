import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  createWorksheetTitle,
  inferQuestionBankGradeNumber,
  inferQuestionBankSchoolLevel,
  inferQuestionBankSemester,
  normalizeQuestionBankDifficulty,
  normalizeQuestionBankDifficultyFilter,
  normalizeQuestionBankProblemType,
  normalizeQuestionBankProblemTypeFilter,
  normalizeQuestionBankQuestionCount,
  parseQuestionBankChoices,
  questionBankMaxQuestionCount,
  shuffleQuestionBankItems,
} from "../src/lib/question-bank-core.ts";

describe("question bank core", () => {
  test("normalizes problem type and difficulty filters", () => {
    assert.equal(
      normalizeQuestionBankProblemType("short-answer"),
      "short-answer",
    );
    assert.equal(
      normalizeQuestionBankProblemType("unknown"),
      "multiple-choice",
    );
    assert.equal(normalizeQuestionBankProblemTypeFilter("essay"), "essay");
    assert.equal(normalizeQuestionBankProblemTypeFilter("all"), "all");
    assert.equal(normalizeQuestionBankProblemTypeFilter("unknown"), "all");
    assert.equal(normalizeQuestionBankDifficulty("3"), 3);
    assert.equal(normalizeQuestionBankDifficulty("9"), 2);
    assert.equal(normalizeQuestionBankDifficultyFilter("4"), 4);
    assert.equal(normalizeQuestionBankDifficultyFilter("all"), "all");
    assert.equal(normalizeQuestionBankDifficultyFilter("bad"), "all");
  });

  test("normalizes question counts within the PDF limit", () => {
    assert.equal(normalizeQuestionBankQuestionCount("12"), 12);
    assert.equal(normalizeQuestionBankQuestionCount("0"), 1);
    assert.equal(
      normalizeQuestionBankQuestionCount("999"),
      questionBankMaxQuestionCount,
    );
    assert.equal(normalizeQuestionBankQuestionCount("bad", 7), 7);
  });

  test("parses choices and builds default worksheet titles", () => {
    assert.deepEqual(parseQuestionBankChoices(" 1 \n\n 2\r\n 3 "), [
      "1",
      "2",
      "3",
    ]);
    assert.equal(
      createWorksheetTitle({ title: "", unitName: "일차방정식" }),
      "일차방정식 문제지",
    );
    assert.equal(
      createWorksheetTitle({ title: "  형성평가  ", unitName: "함수" }),
      "형성평가",
    );
  });

  test("shuffles deterministically by seed without mutating input", () => {
    const items = ["a", "b", "c", "d", "e"];
    const first = shuffleQuestionBankItems(items, "seed-1");
    const second = shuffleQuestionBankItems(items, "seed-1");
    const third = shuffleQuestionBankItems(items, "seed-2");

    assert.deepEqual(first, second);
    assert.notDeepEqual(first, third);
    assert.deepEqual(items, ["a", "b", "c", "d", "e"]);
  });

  test("infers archive school, grade, and semester filters", () => {
    assert.equal(
      inferQuestionBankSchoolLevel({
        subject: "중학수학",
        gradeLevel: "1학년",
      }),
      "middle",
    );
    assert.equal(
      inferQuestionBankSchoolLevel({
        subject: "고등수학",
        gradeLevel: "2학년",
      }),
      "high",
    );
    assert.equal(inferQuestionBankGradeNumber("중2"), 2);
    assert.equal(inferQuestionBankGradeNumber("3학년"), 3);
    assert.equal(inferQuestionBankGradeNumber("공통"), null);
    assert.equal(
      inferQuestionBankSemester({ name: "IV. 좌표평면", sortOrder: 40 }),
      "1학기",
    );
    assert.equal(
      inferQuestionBankSemester({ name: "V. 기본 도형", sortOrder: 50 }),
      "2학기",
    );
    assert.equal(
      inferQuestionBankSemester({ name: "2학기 기말 범위", sortOrder: 0 }),
      "2학기",
    );
  });
});
