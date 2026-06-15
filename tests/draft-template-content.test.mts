import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  compileDocumentTemplateContent,
  compileTemplateContent,
  draftTemplateFormats,
  extractDocumentTemplateFieldValuesFromContent,
  extractDisplayContentFromTemplate,
  extractTextareaContentFromCompiledTemplate,
  getDocumentTemplateDisplayRows,
  validateDocumentTemplateContentValues,
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

  test("makes emergencyContact optional in the vacation template", () => {
    const vacationTemplate = draftTemplateFormats["template-vacation-request"];
    const field = vacationTemplate.fields.find(
      (field) => field.id === "emergencyContact",
    );

    assert.equal(field?.required, false);
  });

  test("compiles schema template fields into labeled document content", () => {
    const content = compileDocumentTemplateContent(
      {
        version: 1,
        fields: [
          { name: "title", label: "제목", type: "text", required: true },
          {
            name: "vendor",
            label: "거래처",
            type: "text",
            required: true,
          },
          {
            name: "reason",
            label: "지출 사유",
            type: "textarea",
            required: true,
          },
          {
            name: "urgent",
            label: "긴급 여부",
            type: "checkbox",
            required: false,
          },
        ],
      },
      {
        vendor: "○○문구",
        reason: "첫 번째 사유\n두 번째 사유",
        urgent: "true",
      },
    );

    assert.equal(
      content,
      [
        "거래처: ○○문구",
        "",
        "지출 사유:",
        "첫 번째 사유",
        "두 번째 사유",
        "",
        "긴급 여부: 예",
      ].join("\n"),
    );
  });

  test("extracts schema template values from labeled document content", () => {
    const schema = {
      version: 1,
      fields: [
        {
          name: "vendor",
          label: "거래처",
          type: "text",
          required: true,
        },
        {
          name: "approvalType",
          label: "결재 구분",
          type: "select",
          required: true,
          options: [
            { label: "일반", value: "normal" },
            { label: "긴급", value: "urgent" },
          ],
        },
      ],
    } as const;

    const values = extractDocumentTemplateFieldValuesFromContent(
      schema,
      ["거래처: ○○문구", "", "결재 구분: 긴급"].join("\n"),
    );

    assert.deepEqual(values, {
      vendor: "○○문구",
      approvalType: "urgent",
    });
  });

  test("creates schema display rows with readable values", () => {
    const schema = {
      version: 1,
      fields: [
        { name: "title", label: "제목", type: "text", required: true },
        {
          name: "approvalType",
          label: "결재 구분",
          type: "select",
          required: true,
          options: [
            { label: "일반", value: "normal" },
            { label: "긴급", value: "urgent" },
          ],
        },
        {
          name: "reason",
          label: "신청 사유",
          type: "textarea",
          required: true,
        },
        {
          name: "confirmed",
          label: "확인 여부",
          type: "checkbox",
          required: false,
        },
        {
          name: "attachments",
          label: "첨부파일",
          type: "attachments",
          required: false,
        },
      ],
    } as const;
    const rows = getDocumentTemplateDisplayRows(
      schema,
      [
        "결재 구분: 긴급",
        "",
        "신청 사유:",
        "첫 번째 사유",
        "두 번째 사유",
        "",
        "확인 여부: 예",
      ].join("\n"),
    );

    assert.deepEqual(rows, [
      {
        label: "결재 구분",
        name: "approvalType",
        type: "select",
        value: "긴급",
      },
      {
        label: "신청 사유",
        name: "reason",
        type: "textarea",
        value: "첫 번째 사유\n두 번째 사유",
      },
      {
        label: "확인 여부",
        name: "confirmed",
        type: "checkbox",
        value: "예",
      },
    ]);
  });

  test("keeps schema-based display content instead of legacy textarea extraction", () => {
    const content = ["상세 내용: 검토 배경", "", "금액: 10000"].join("\n");

    assert.equal(
      extractDisplayContentFromTemplate(
        content,
        "template-general-draft",
        {
          version: 1,
          fields: [
            {
              name: "details",
              label: "상세 내용",
              type: "textarea",
              required: true,
            },
            {
              name: "amount",
              label: "금액",
              type: "number",
              required: true,
            },
          ],
        },
      ),
      content,
    );
  });

  test("validates required schema template field values", () => {
    const errors = validateDocumentTemplateContentValues(
      {
        version: 1,
        fields: [
          {
            name: "reason",
            label: "신청 사유",
            type: "textarea",
            required: true,
          },
        ],
      },
      {
        reason: "",
      },
    );

    assert.deepEqual(errors, ["신청 사유을(를) 입력하세요."]);
  });
});
