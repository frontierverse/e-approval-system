import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { meetingMinutesTemplateId } from "../src/lib/document-template-schema.ts";
import { parseMeetingMinutesPdfPreviewRequest } from "../src/lib/meeting-minutes-pdf-preview.ts";

describe("meeting minutes PDF preview request", () => {
  test("accepts the current meeting minutes form values", () => {
    const result = parseMeetingMinutesPdfPreviewRequest({
      approverIds: ["approver-1"],
      content: "  회의 내용  ",
      templateId: meetingMinutesTemplateId,
      title: "  주간 회의록  ",
    });

    assert.deepEqual(result, {
      ok: true,
      values: {
        approverIds: ["approver-1"],
        content: "회의 내용",
        templateId: meetingMinutesTemplateId,
        title: "주간 회의록",
      },
    });
  });

  test("rejects non-meeting templates and duplicate approvers", () => {
    assert.deepEqual(
      parseMeetingMinutesPdfPreviewRequest({
        approverIds: [],
        content: "내용",
        templateId: "template-general",
        title: "일반 기안",
      }),
      { ok: false, error: "회의록 양식만 미리볼 수 있습니다." },
    );

    assert.deepEqual(
      parseMeetingMinutesPdfPreviewRequest({
        approverIds: ["approver-1", "approver-1"],
        content: "내용",
        templateId: meetingMinutesTemplateId,
        title: "회의록",
      }),
      { ok: false, error: "결재선 정보를 확인해 주세요." },
    );
  });

  test("enforces the same title and content limits as draft submission", () => {
    assert.deepEqual(
      parseMeetingMinutesPdfPreviewRequest({
        approverIds: [],
        content: "내용",
        templateId: meetingMinutesTemplateId,
        title: "가".repeat(121),
      }),
      { ok: false, error: "제목은 120자 이내로 입력하세요." },
    );

    assert.deepEqual(
      parseMeetingMinutesPdfPreviewRequest({
        approverIds: [],
        content: "가".repeat(5001),
        templateId: meetingMinutesTemplateId,
        title: "회의록",
      }),
      { ok: false, error: "회의록 내용은 5000자 이내로 입력하세요." },
    );
  });
});
