import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  getDraftFormValues,
  validateDraftFormValues,
} from "../src/lib/draft-form-state.ts";

describe("draft form state", () => {
  test("derives document type outside of user-entered category fields", () => {
    const formData = new FormData();

    formData.set("title", "휴가 신청");
    formData.set("category", "사용자가 보낸 임의 분류");
    formData.set("templateId", "template-vacation-request");
    formData.set("content", "휴가 신청 내용을 충분히 입력합니다.");
    formData.append("approverIds", "user-001");

    const values = getDraftFormValues(formData);

    assert.equal(values.category, "");
    assert.equal(values.templateId, "template-vacation-request");
  });

  test("does not validate user-entered document category", () => {
    const errors = validateDraftFormValues(
      {
        title: "구매 요청",
        category: "가".repeat(200),
        templateId: "template-purchase-request",
        content: "구매 요청 내용을 충분히 입력합니다.",
        approverIds: ["user-001"],
      },
      {
        currentUserId: "user-002",
      },
    );

    assert.equal("category" in errors, false);
  });

  test("allows incomplete content and approval lines for temporary drafts", () => {
    const errors = validateDraftFormValues(
      {
        title: "",
        category: "",
        templateId: "template-general-draft",
        content: "",
        approverIds: [],
      },
      {
        currentUserId: "user-002",
        intent: "draft",
      },
    );

    assert.deepEqual(errors, {});
  });

  test("requires complete content and an approver for approval requests", () => {
    const errors = validateDraftFormValues(
      {
        title: "",
        category: "",
        templateId: "template-general-draft",
        content: "",
        approverIds: [],
      },
      {
        currentUserId: "user-002",
        intent: "submit",
      },
    );

    assert.equal(errors.title, "제목은 2자 이상 입력하세요.");
    assert.equal(errors.content, "기안 내용은 10자 이상 입력하세요.");
    assert.equal(errors.approvers, "결재자를 1명 이상 지정하세요.");
  });
});
