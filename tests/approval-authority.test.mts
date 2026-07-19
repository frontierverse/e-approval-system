import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  APPROVAL_AUTHORITY_POSITION_NAME,
  getApprovalAuthorityLineError,
  isApprovalAuthorityPosition,
} from "../src/lib/approval-authority.ts";

describe("approval authority policy", () => {
  test("recognizes only the facility-head position", () => {
    assert.equal(APPROVAL_AUTHORITY_POSITION_NAME, "시설장");
    assert.equal(isApprovalAuthorityPosition(" 시설장 "), true);
    assert.equal(isApprovalAuthorityPosition("팀장"), false);
    assert.equal(isApprovalAuthorityPosition(null), false);
  });

  test("requires exactly one facility head in an approval line", () => {
    assert.equal(
      getApprovalAuthorityLineError([{ positionName: "시설장" }]),
      null,
    );
    assert.equal(getApprovalAuthorityLineError([]), "시설장 1명을 결재자로 지정하세요.");
    assert.equal(
      getApprovalAuthorityLineError([{ positionName: "팀장" }]),
      "시설장 1명을 결재자로 지정하세요.",
    );
    assert.equal(
      getApprovalAuthorityLineError([
        { positionName: "시설장" },
        { positionName: "시설장" },
      ]),
      "시설장 1명을 결재자로 지정하세요.",
    );
  });
});
