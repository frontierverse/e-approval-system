import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  canStartApprovalLine,
  getApprovalLinePolicyError,
} from "../src/lib/approval-line-policy.ts";

describe("approval line policy", () => {
  test("allows any position to start an approval line", () => {
    assert.equal(
      canStartApprovalLine({
        name: "정하린",
        positionName: "시설장",
        positionLevel: 5,
      }),
      true,
    );
  });

  test("allows approval lines from lower positions to higher positions", () => {
    assert.equal(
      getApprovalLinePolicyError([
        {
          name: "김민준",
          positionName: "팀장",
          positionLevel: 3,
        },
        {
          name: "박서연",
          positionName: "이사",
          positionLevel: 4,
        },
        {
          name: "정하린",
          positionName: "시설장",
          positionLevel: 5,
        },
      ]),
      null,
    );
  });

  test("blocks approval lines that move from higher positions to lower positions", () => {
    const error = getApprovalLinePolicyError([
      {
        name: "정하린",
        positionName: "시설장",
        positionLevel: 5,
      },
      {
        name: "박서연",
        positionName: "이사",
        positionLevel: 4,
      },
    ]);

    assert.equal(
      error,
      "결재선 순서가 올바르지 않습니다. 시설장 직급 다음에 이사 직급은 올 수 없습니다. 결재선은 낮은 직급에서 높은 직급 순서로 지정하세요.",
    );
  });

  test("allows same-level positions and unknown levels", () => {
    assert.equal(
      getApprovalLinePolicyError([
        {
          name: "김민준",
          positionName: "팀장",
          positionLevel: 3,
        },
        {
          name: "이도윤",
          positionName: "팀장",
          positionLevel: 3,
        },
        {
          name: "서지우",
          positionName: "직급 미지정",
          positionLevel: null,
        },
      ]),
      null,
    );
  });
});
