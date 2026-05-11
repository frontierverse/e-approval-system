import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  canStartApprovalLine,
  getApprovalLinePolicyError,
} from "../src/lib/approval-line-policy.ts";

describe("approval line policy", () => {
  test("allows team lead or lower positions to start an approval line", () => {
    assert.equal(
      canStartApprovalLine({
        name: "김민준",
        positionName: "팀장",
        positionLevel: 3,
      }),
      true,
    );
  });

  test("blocks facility head level positions from starting an approval line", () => {
    const error = getApprovalLinePolicyError([
      {
        name: "정하린",
        positionName: "시설장",
        positionLevel: 4,
      },
    ]);

    assert.equal(
      error,
      "시설장 직급은 첫 결재자로 지정할 수 없습니다. 팀장급 이하 결재자를 먼저 추가한 뒤 상위 결재자로 배치하세요.",
    );
  });

  test("allows facility head positions after a lower first approver", () => {
    assert.equal(
      getApprovalLinePolicyError([
        {
          name: "김민준",
          positionName: "팀장",
          positionLevel: 3,
        },
        {
          name: "정하린",
          positionName: "시설장",
          positionLevel: 4,
        },
      ]),
      null,
    );
  });
});
