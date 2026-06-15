import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  getDefaultDocumentTemplateSchema,
  getSafeDocumentTemplateSchema,
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
