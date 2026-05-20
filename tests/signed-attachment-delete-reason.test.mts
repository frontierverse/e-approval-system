import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  parseSignedAttachmentDeleteReason,
  signedAttachmentDeleteReasonMaxLength,
} from "../src/lib/signed-attachment-delete-reason.ts";

describe("signed attachment delete reason", () => {
  test("requires a non-empty reason", () => {
    assert.deepEqual(parseSignedAttachmentDeleteReason(null), {
      ok: false,
      message: "서명본 삭제 사유를 입력하세요.",
    });
    assert.deepEqual(parseSignedAttachmentDeleteReason("   \n  "), {
      ok: false,
      message: "서명본 삭제 사유를 입력하세요.",
    });
  });

  test("normalizes whitespace in valid reasons", () => {
    assert.deepEqual(
      parseSignedAttachmentDeleteReason("  위치가 잘못됨\n재생성 필요  "),
      {
        ok: true,
        reason: "위치가 잘못됨 재생성 필요",
      },
    );
  });

  test("limits reason length", () => {
    assert.deepEqual(
      parseSignedAttachmentDeleteReason(
        "가".repeat(signedAttachmentDeleteReasonMaxLength + 1),
      ),
      {
        ok: false,
        message: "서명본 삭제 사유는 200자 이내로 입력하세요.",
      },
    );
  });
});
