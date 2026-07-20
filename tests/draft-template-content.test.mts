import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  compileMeetingAgendaFieldValues,
  compileDocumentTemplateContent,
  compileTemplateContent,
  draftTemplateFormats,
  extractDocumentTemplateFieldValuesFromContent,
  extractDisplayContentFromTemplate,
  getMeetingAgendaItems,
  extractTextareaContentFromCompiledTemplate,
  getDocumentTemplateInitialFieldValues,
  getDocumentTemplateDisplayRows,
  validateDocumentTemplateContentValues,
} from "../src/lib/draft-template-content.ts";
import {
  getExpenseReportDocumentTemplateSchema,
  getMeetingMinutesDocumentTemplateSchema,
  getVacationRequestDocumentTemplateSchema,
} from "../src/lib/document-template-schema.ts";

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

  test("keeps legacy freeform expense content out of structured display rows", () => {
    const rows = getDocumentTemplateDisplayRows(
      getExpenseReportDocumentTemplateSchema(),
      "기관 내 상비의약품 및 응급처치용품 비치를 위하여 구입하고자 합니다.",
    );

    assert.deepEqual(rows, []);
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

  test("applies vacation defaults and hides fields that do not match the selected type", () => {
    const schema = getVacationRequestDocumentTemplateSchema();
    const initialValues = getDocumentTemplateInitialFieldValues(schema, "");
    const content = compileDocumentTemplateContent(schema, {
      vacationType: "half_day",
      halfDayDate: "2026-06-20",
      halfDayPeriod: "morning",
      emergencyContact: "010-0000-0000",
      reason: "오전 반차를 신청합니다.",
    });

    const annualContent = compileDocumentTemplateContent(schema, {
      vacationType: "annual",
      startDate: "2026-06-20",
      endDate: "2026-06-20",
      emergencyContact: "010-0000-0000",
      reason: "?곗감瑜??좎껌?⑸땲??",
    });

    assert.equal(initialValues.vacationType, "annual");
    assert.match(content, /휴가 종류: 반차/);
    assert.match(content, /반차 사용일: 2026-06-20/);
    assert.match(content, /반차 구분: 오전 \(09:00~14:00\)/);
    assert.doesNotMatch(content, /시작일/);
    assert.doesNotMatch(content, /종료일/);
    assert.doesNotMatch(content, /010-0000-0000/);
    assert.match(annualContent, /010-0000-0000/);
  });

  test("validates vacation fields by selected type", () => {
    const schema = getVacationRequestDocumentTemplateSchema();
    const halfDayErrors = validateDocumentTemplateContentValues(schema, {
      vacationType: "half_day",
      startDate: "2026-06-20",
      endDate: "2026-06-20",
      reason: "오전 반차를 신청합니다.",
    });
    const rangeErrors = validateDocumentTemplateContentValues(schema, {
      vacationType: "annual",
      startDate: "2026-06-21",
      endDate: "2026-06-20",
      reason: "연차를 신청합니다.",
    });

    assert.match(halfDayErrors.join("\n"), /반차 사용일/);
    assert.match(halfDayErrors.join("\n"), /반차 구분/);
    assert.deepEqual(rangeErrors, ["종료일은 시작일 이후 날짜로 선택하세요."]);
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

  test("compiles, restores, and validates separate meeting agenda titles and content", () => {
    const agendaValues = compileMeetingAgendaFieldValues([
      {
        title: "시설 주간 일정 및 업무 운영 계획 공유",
        content: "7월 16일부터 아동돌봄도시락 사업 운영을 시작합니다.",
      },
      {
        title: "입소 청소년 프로그램 운영",
        content: "프로그램 운영 일정을 확정합니다.",
      },
    ]);

    assert.deepEqual(getMeetingAgendaItems(agendaValues), [
      {
        title: "시설 주간 일정 및 업무 운영 계획 공유",
        content: "7월 16일부터 아동돌봄도시락 사업 운영을 시작합니다.",
      },
      {
        title: "입소 청소년 프로그램 운영",
        content: "프로그램 운영 일정을 확정합니다.",
      },
    ]);
    assert.match(agendaValues.discussion, /안건 1\. 시설 주간 일정/);

    const schema = getMeetingMinutesDocumentTemplateSchema();
    const errors = validateDocumentTemplateContentValues(schema, {
      meetingTitle: "주간 운영회의",
      meetingDate: "2026-07-20",
      location: "회의실",
      attendees: "최윤서 외 3명",
      host: "안윤숙 시설장",
      ...agendaValues,
    });

    assert.deepEqual(errors, []);

    const incompleteErrors = validateDocumentTemplateContentValues(schema, {
      meetingTitle: "주간 운영회의",
      meetingDate: "2026-07-20",
      location: "회의실",
      attendees: "최윤서 외 3명",
      host: "안윤숙 시설장",
      ...compileMeetingAgendaFieldValues([
        { title: "시설 운영", content: "" },
      ]),
    });

    assert.deepEqual(incompleteErrors, ["안건 1의 내용을 입력하세요."]);
  });
});
