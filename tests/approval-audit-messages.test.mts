import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  createApprovalApprovedAuditMessage,
  createApprovalRejectedAuditMessage,
  createProxyApprovedAuditMessage,
  createProxyRejectedAuditMessage,
} from "../src/lib/approval-audit-messages.ts";

const drafter = {
  id: "user-001",
  name: "김민준",
  position: {
    name: "주임",
  },
};

const director = {
  id: "user-002",
  name: "박재숙",
  position: {
    name: "이사",
  },
};

const facilityHead = {
  id: "user-003",
  name: "안윤숙",
  position: {
    name: "시설장",
  },
};

describe("approval audit messages", () => {
  test("includes actor and requester positions for normal approvals", () => {
    assert.equal(
      createApprovalApprovedAuditMessage({
        approver: facilityHead,
        drafter,
      }),
      "안윤숙 시설장이 김민준 주임의 결재 요청을 승인했습니다.",
    );
  });

  test("includes actor and requester positions for normal rejections", () => {
    assert.equal(
      createApprovalRejectedAuditMessage({
        approver: director,
        drafter,
        comment: "첨부 확인 필요",
      }),
      "박재숙 이사가 김민준 주임의 결재 요청을 반려했습니다. 사유: 첨부 확인 필요",
    );
  });

  test("states whose approval was proxy-approved", () => {
    assert.equal(
      createProxyApprovedAuditMessage({
        actor: drafter,
        approver: facilityHead,
      }),
      "김민준 주임이 안윤숙 시설장의 결재를 대리 승인했습니다.",
    );
  });

  test("marks proxy actor self-rejection as proxy rejection", () => {
    assert.equal(
      createProxyRejectedAuditMessage({
        actor: drafter,
        actorId: drafter.id,
        step: {
          approverId: facilityHead.id,
          proxyApprovedById: drafter.id,
          approver: facilityHead,
          proxyApprovedBy: drafter,
        },
      }),
      "김민준 주임이 안윤숙 시설장의 대리 결재를 대리 반려했습니다.",
    );
  });

  test("distinguishes original approver rejection of proxy approval", () => {
    assert.equal(
      createProxyRejectedAuditMessage({
        actor: facilityHead,
        actorId: facilityHead.id,
        step: {
          approverId: facilityHead.id,
          proxyApprovedById: drafter.id,
          approver: facilityHead,
          proxyApprovedBy: drafter,
        },
      }),
      "안윤숙 시설장이 김민준 주임의 대리 결재를 반려했습니다.",
    );
  });
});
