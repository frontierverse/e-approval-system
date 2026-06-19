import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  getDefaultDocumentTemplateSchema,
  getExpenseReportDocumentTemplateSchema,
  getSafeDocumentTemplateSchema,
  getVacationRequestDocumentTemplateSchema,
  validateDocumentTemplateSchema,
} from "../src/lib/document-template-schema.ts";

describe("document template schema", () => {
  test("validates and normalizes the default schema as v1", () => {
    const validation = validateDocumentTemplateSchema(
      getDefaultDocumentTemplateSchema(),
    );

    assert.equal(validation.ok, true);

    if (validation.ok) {
      assert.equal(validation.schema.version, 1);
      assert.deepEqual(
        validation.schema.fields.map((field) => field.name),
        ["title", "content", "attachments"],
      );
    }
  });

  test("keeps existing versionless seed schemas compatible", () => {
    const validation = validateDocumentTemplateSchema({
      fields: [
        { name: "title", label: "제목", type: "text", required: true },
        {
          name: "content",
          label: "기안 내용",
          type: "textarea",
          required: true,
        },
      ],
    });

    assert.equal(validation.ok, true);

    if (validation.ok) {
      assert.equal(validation.schema.version, 1);
    }
  });

  test("supports select options and checkbox defaults", () => {
    const validation = validateDocumentTemplateSchema({
      version: 1,
      fields: [
        {
          name: "vacationType",
          label: "휴가 구분",
          type: "select",
          required: true,
          defaultValue: "annual",
          options: [
            { label: "연차", value: "annual" },
            { label: "반차", value: "half" },
          ],
        },
        {
          name: "urgent",
          label: "긴급 여부",
          type: "checkbox",
          required: false,
          defaultValue: "false",
        },
      ],
    });

    assert.equal(validation.ok, true);

    if (validation.ok) {
      assert.equal(validation.schema.fields[1].defaultValue, false);
    }
  });

  test("validates conditional vacation request fields", () => {
    const validation = validateDocumentTemplateSchema(
      getVacationRequestDocumentTemplateSchema(),
    );

    assert.equal(validation.ok, true);

    if (validation.ok) {
      const halfDayDate = validation.schema.fields.find(
        (field) => field.name === "halfDayDate",
      );
      const halfDayPeriod = validation.schema.fields.find(
        (field) => field.name === "halfDayPeriod",
      );
      const startDate = validation.schema.fields.find(
        (field) => field.name === "startDate",
      );
      const emergencyContact = validation.schema.fields.find(
        (field) => field.name === "emergencyContact",
      );
      const familyEventType = validation.schema.fields.find(
        (field) => field.name === "familyEventType",
      );

      assert.deepEqual(halfDayDate?.visibleWhen, {
        field: "vacationType",
        values: ["half_day"],
      });
      assert.deepEqual(halfDayPeriod?.options, [
        { label: "오전 (09:00~14:00)", value: "morning" },
        { label: "오후 (14:00~18:00)", value: "afternoon" },
      ]);
      assert.deepEqual(startDate?.visibleWhen?.values, [
        "annual",
        "sick",
        "family_event",
        "official",
        "substitute",
        "other",
      ]);
      assert.deepEqual(emergencyContact?.visibleWhen?.values, [
        "annual",
        "sick",
        "family_event",
        "official",
        "substitute",
        "other",
      ]);
      assert.deepEqual(familyEventType?.options, [
        { label: "결혼", value: "marriage" },
        { label: "출산", value: "birth" },
        { label: "장례", value: "bereavement" },
        { label: "기타", value: "other" },
      ]);
    }
  });

  test("validates the expanded expense report schema", () => {
    const validation = validateDocumentTemplateSchema(
      getExpenseReportDocumentTemplateSchema(),
    );

    assert.equal(validation.ok, true);

    if (validation.ok) {
      assert.deepEqual(
        validation.schema.fields.map((field) => field.name),
        [
          "title",
          "expenseType",
          "expenseDate",
          "budgetItem",
          "vendor",
          "paymentMethod",
          "amount",
          "purpose",
          "details",
          "attachments",
        ],
      );
      assert.equal(
        validation.schema.fields.some((field) => field.name === "evidence"),
        false,
      );
      assert.deepEqual(
        validation.schema.fields.find((field) => field.name === "expenseType")
          ?.options,
        [
          { label: "사전구매요청", value: "advance_purchase" },
          { label: "사후정산", value: "post_settlement" },
          { label: "지급요청", value: "payment_request" },
        ],
      );
      assert.equal(
        validation.schema.fields.find((field) => field.name === "attachments")
          ?.type,
        "attachments",
      );
    }
  });

  test("rejects duplicate field names and unsupported field types", () => {
    const validation = validateDocumentTemplateSchema({
      version: 1,
      fields: [
        { name: "content", label: "내용", type: "textarea" },
        { name: "CONTENT", label: "내용2", type: "textarea" },
        { name: "file", label: "파일", type: "upload" },
      ],
    });

    assert.equal(validation.ok, false);

    if (!validation.ok) {
      assert.match(validation.errors.join("\n"), /중복/);
      assert.match(validation.errors.join("\n"), /text, textarea/);
    }
  });

  test("rejects select fields without valid options", () => {
    const validation = validateDocumentTemplateSchema({
      version: 1,
      fields: [
        {
          name: "approvalType",
          label: "결재 구분",
          type: "select",
          options: [],
        },
      ],
    });

    assert.equal(validation.ok, false);

    if (!validation.ok) {
      assert.match(validation.errors.join("\n"), /options/);
    }
  });

  test("falls back to the default schema when runtime schema is invalid", () => {
    const safeSchema = getSafeDocumentTemplateSchema({
      version: 2,
      fields: [],
    });

    assert.equal(safeSchema.usedFallback, true);
    assert.deepEqual(
      safeSchema.schema.fields.map((field) => field.name),
      ["title", "content", "attachments"],
    );
  });
});
