import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  canDeleteDraftDocumentByPolicy,
  canReadApprovalDocument,
  canRecallDocumentByPolicy,
  getReadableDocumentWhere,
  type ReadableDocumentShape,
} from "../src/lib/approval-permissions-core.ts";

const document: ReadableDocumentShape = {
  drafterId: "drafter-001",
  status: "SUBMITTED",
  approvalSteps: [
    {
      approverId: "approver-001",
    },
    {
      approverId: "approver-002",
    },
  ],
};

describe("approval document read permission", () => {
  test("allows the drafter to read their own document", () => {
    assert.equal(
      canReadApprovalDocument("drafter-001", "USER", document),
      true,
    );
  });

  test("allows assigned approvers to read the document", () => {
    assert.equal(
      canReadApprovalDocument("approver-002", "USER", document),
      true,
    );
  });

  test("allows admins to read any document", () => {
    assert.equal(
      canReadApprovalDocument("unrelated-user", "ADMIN", document),
      true,
    );
  });

  test("blocks unrelated users", () => {
    assert.equal(
      canReadApprovalDocument("unrelated-user", "USER", document),
      false,
    );
  });

  test("blocks assigned approvers from reading draft documents", () => {
    assert.equal(
      canReadApprovalDocument("approver-001", "USER", {
        ...document,
        status: "DRAFT",
      }),
      false,
    );
  });

  test("allows the drafter to read draft documents", () => {
    assert.equal(
      canReadApprovalDocument("drafter-001", "USER", {
        ...document,
        status: "DRAFT",
      }),
      true,
    );
  });
});

describe("readable document query filter", () => {
  test("does not restrict admins", () => {
    assert.deepEqual(getReadableDocumentWhere("admin-001", "ADMIN"), {});
  });

  test("restricts users to drafted or assigned documents", () => {
    assert.deepEqual(getReadableDocumentWhere("user-001", "USER"), {
      OR: [
        {
          drafterId: "user-001",
        },
        {
          AND: [
            {
              status: {
                notIn: ["DRAFT", "RECALLED"],
              },
            },
            {
              approvalSteps: {
                some: {
                  approverId: "user-001",
                },
              },
            },
          ],
        },
      ],
    });
  });
});

describe("document action policy", () => {
  test("allows only the drafter to delete draft documents", () => {
    assert.equal(
      canDeleteDraftDocumentByPolicy("drafter-001", {
        drafterId: "drafter-001",
        status: "DRAFT",
      }),
      true,
    );
    assert.equal(
      canDeleteDraftDocumentByPolicy("drafter-001", {
        drafterId: "drafter-001",
        status: "RECALLED",
      }),
      false,
    );
    assert.equal(
      canDeleteDraftDocumentByPolicy("approver-001", {
        drafterId: "drafter-001",
        status: "DRAFT",
      }),
      false,
    );
  });

  test("allows the drafter to recall submitted or in-progress documents", () => {
    assert.equal(
      canRecallDocumentByPolicy("drafter-001", {
        drafterId: "drafter-001",
        status: "SUBMITTED",
      }),
      true,
    );
    assert.equal(
      canRecallDocumentByPolicy("drafter-001", {
        drafterId: "drafter-001",
        status: "in_progress",
      }),
      true,
    );
    assert.equal(
      canRecallDocumentByPolicy("drafter-001", {
        drafterId: "drafter-001",
        status: "APPROVED",
      }),
      false,
    );
    assert.equal(
      canRecallDocumentByPolicy("approver-001", {
        drafterId: "drafter-001",
        status: "SUBMITTED",
      }),
      false,
    );
  });
});
