import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  compileTemplateContent,
  draftTemplateFormats,
  extractTextareaContentFromCompiledTemplate,
} from "../src/lib/draft-template-content.ts";

describe("draft template content", () => {
  test("compiles template content from textarea fields only", () => {
    const content = compileTemplateContent(
      draftTemplateFormats["template-purchase-request"],
      {
        itemName: "업무용 노트북",
        quantity: "1",
        estimatedAmount: "1000000",
        vendor: "삼성전자",
        reason: "첫 번째 사유\n두 번째 사유",
      },
    );

    assert.equal(
      content,
      ["첫 번째 사유", "두 번째 사유"].join("\n"),
    );
  });

  test("labels multiple textarea fields when compiling template content", () => {
    const content = compileTemplateContent(
      draftTemplateFormats["template-general-draft"],
      {
        purpose: "운영 일정 조정 승인 요청",
        details: "상세한 검토 배경입니다.",
        expectedEffect: "승인 후 기대 효과입니다.",
      },
    );

    assert.equal(
      content,
      [
        "상세 내용: 상세한 검토 배경입니다.",
        "",
        "기대 효과: 승인 후 기대 효과입니다.",
      ].join("\n"),
    );
  });

  test("extracts only textarea body content from compiled template content", () => {
    const content = [
      "구매 품목: 업무용 노트북",
      "수량: 1",
      "예상 금액: 1000000",
      "구매처: 삼성전자",
      "구매 사유:",
      "첫 번째 사유",
      "두 번째 사유",
    ].join("\n");

    assert.equal(
      extractTextareaContentFromCompiledTemplate(
        content,
        "template-purchase-request",
      ),
      "첫 번째 사유\n두 번째 사유",
    );
  });

  test("extracts textarea content from older single-line label formatting", () => {
    const content = [
      "구매 품목: 업무용 노트북",
      "수량: 1",
      "예상 금액: 1000000",
      "구매처: 삼성전자",
      "구매 사유: 첫 번째 사유",
      "두 번째 사유",
    ].join("\n");

    assert.equal(
      extractTextareaContentFromCompiledTemplate(content),
      "첫 번째 사유\n두 번째 사유",
    );
  });
});
