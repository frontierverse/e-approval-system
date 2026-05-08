import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  canReadApprovalDocument,
  getReadableDocumentWhere,
  type ReadableDocumentShape,
} from "../src/lib/approval-permissions-core.ts";

const document: ReadableDocumentShape = {
  drafterId: "drafter-001",
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
          approvalSteps: {
            some: {
              approverId: "user-001",
            },
          },
        },
      ],
    });
  });
});
