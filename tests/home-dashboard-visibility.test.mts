import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { canViewHomeApprovalQueue } from "../src/lib/home-dashboard-visibility.ts";

describe("home dashboard visibility", () => {
  test("shows the approval queue only to the facility head", () => {
    assert.equal(canViewHomeApprovalQueue("시설장"), true);
    assert.equal(canViewHomeApprovalQueue(" 시설장 "), true);
    assert.equal(canViewHomeApprovalQueue("팀장"), false);
    assert.equal(canViewHomeApprovalQueue("주임"), false);
    assert.equal(canViewHomeApprovalQueue(null), false);
  });
});
