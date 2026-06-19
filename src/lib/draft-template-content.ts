import {
  getSafeDocumentTemplateSchema,
  type DocumentTemplateField,
  type DocumentTemplateFieldType,
  type DocumentTemplateSchemaV1,
} from "@/lib/document-template-schema";

export type TemplateFieldType = "date" | "number" | "text" | "textarea";

export type TemplateFieldDefinition = {
  id: string;
  label: string;
  placeholder?: string;
  type: TemplateFieldType;
  required?: boolean;
};

export type TemplateFormatDefinition = {
  title: string;
  fields: TemplateFieldDefinition[];
};

export type DocumentTemplateDisplayRow = {
  label: string;
  name: string;
  type: DocumentTemplateFieldType;
  value: string;
};

export const templateFieldFormNamePrefix = "templateField:";

export const draftTemplateFormats: Record<string, TemplateFormatDefinition> = {
  "template-general-draft": {
    title: "일반 기안서 입력",
    fields: [
      {
        id: "purpose",
        label: "기안 목적",
        placeholder: "예: 운영 일정 조정 승인 요청",
        type: "text",
      },
      {
        id: "details",
        label: "상세 내용",
        placeholder: "검토가 필요한 배경, 진행 내용, 요청 사항을 입력하세요.",
        type: "textarea",
      },
      {
        id: "expectedEffect",
        label: "기대 효과",
        placeholder: "승인 후 기대되는 효과를 입력하세요.",
        type: "textarea",
      },
    ],
  },
  "template-expense-report": {
    title: "지출결의서 입력",
    fields: [
      {
        id: "expenseType",
        label: "지출구분",
        placeholder: "예: 사후정산",
        type: "text",
      },
      {
        id: "expenseDate",
        label: "지출일자/구매예정일",
        type: "date",
      },
      {
        id: "budgetItem",
        label: "예산항목/사업명",
        placeholder: "예: 사업비, 의료비",
        type: "text",
      },
      {
        id: "vendor",
        label: "거래처",
        placeholder: "예: 청년약국",
        type: "text",
      },
      {
        id: "paymentMethod",
        label: "결제수단",
        placeholder: "예: 법인카드",
        type: "text",
      },
      {
        id: "amount",
        label: "지출 금액",
        placeholder: "예: 150000",
        type: "number",
      },
      {
        id: "purpose",
        label: "지출목적",
        placeholder: "구매 또는 지출이 필요한 이유를 입력하세요.",
        type: "textarea",
      },
      {
        id: "details",
        label: "세부내역",
        placeholder: "품명, 규격, 수량, 단가, 금액 등을 입력하세요.",
        type: "textarea",
      },
    ],
  },
  "template-vacation-request": {
    title: "휴가신청서 입력",
    fields: [
      {
        id: "vacationType",
        label: "휴가 구분",
        placeholder: "예: 연차, 반차, 병가",
        type: "text",
      },
      {
        id: "startDate",
        label: "시작일",
        type: "date",
      },
      {
        id: "endDate",
        label: "종료일",
        type: "date",
      },
      {
        id: "emergencyContact",
        label: "비상 연락처",
        placeholder: "예: 010-0000-0000",
        required: false,
        type: "text",
      },
      {
        id: "reason",
        label: "신청 사유",
        placeholder: "휴가 신청 사유를 입력하세요.",
        type: "textarea",
      },
    ],
  },
  "template-purchase-request": {
    title: "구매요청서 입력",
    fields: [
      {
        id: "itemName",
        label: "구매 품목",
        placeholder: "예: 업무용 노트북",
        type: "text",
      },
      {
        id: "quantity",
        label: "수량",
        placeholder: "예: 2",
        type: "number",
      },
      {
        id: "estimatedAmount",
        label: "예상 금액",
        placeholder: "예: 2500000",
        type: "number",
      },
      {
        id: "vendor",
        label: "구매처",
        placeholder: "예: ○○컴퓨터",
        type: "text",
      },
      {
        id: "reason",
        label: "구매 사유",
        placeholder: "구매 필요성과 활용 계획을 입력하세요.",
        type: "textarea",
      },
    ],
  },
};

const fallbackTextareaLabels = new Set([
  "기안 내용",
  ...Object.values(draftTemplateFormats).flatMap((template) =>
    template.fields
      .filter((field) => field.type === "textarea")
      .map((field) => field.label),
  ),
]);

const fallbackFieldLabels = [
  "제목",
  "첨부파일",
  ...Object.values(draftTemplateFormats).flatMap((template) =>
    template.fields.map((field) => field.label),
  ),
].sort((a, b) => b.length - a.length);

export function compileTemplateContent(
  template: TemplateFormatDefinition,
  values: Record<string, string>,
) {
  const textareaFields = template.fields.filter(
    (field) => field.type === "textarea",
  );

  if (textareaFields.length === 1) {
    return normalizeNewlines(values[textareaFields[0].id] ?? "").trim();
  }

  return textareaFields
    .map((field) => formatTemplateContentField(field, values[field.id] ?? ""))
    .join("\n\n");
}

export function getTemplateFieldInputName(fieldName: string) {
  return `${templateFieldFormNamePrefix}${fieldName}`;
}

export function getDocumentTemplateFieldValuesFromFormData(
  formData: FormData,
) {
  const values: Record<string, string> = {};

  for (const [name, value] of formData.entries()) {
    if (!name.startsWith(templateFieldFormNamePrefix)) {
      continue;
    }

    const fieldName = name.slice(templateFieldFormNamePrefix.length).trim();

    if (!fieldName) {
      continue;
    }

    values[fieldName] = String(value).trim();
  }

  return values;
}

export function getSafeRenderableDocumentTemplateFields(schema: unknown) {
  return getRenderableDocumentTemplateFields(
    getSafeDocumentTemplateSchema(schema).schema,
  );
}

export function getSafeVisibleRenderableDocumentTemplateFields(
  schema: unknown,
  values: Record<string, string> | undefined,
) {
  return getVisibleRenderableDocumentTemplateFields(
    getSafeDocumentTemplateSchema(schema).schema,
    values,
  );
}

export function getRenderableDocumentTemplateFields(
  schema: DocumentTemplateSchemaV1,
) {
  return schema.fields.filter((field) => !isDocumentTemplateShellField(field));
}

export function getVisibleRenderableDocumentTemplateFields(
  schema: DocumentTemplateSchemaV1,
  values: Record<string, string> | undefined,
) {
  const fieldValues = values ?? {};

  return getRenderableDocumentTemplateFields(schema).filter((field) =>
    isDocumentTemplateFieldVisible(field, fieldValues),
  );
}

export function getDocumentTemplateInitialFieldValues(
  schema: unknown,
  content: string,
) {
  const safeSchema = getSafeDocumentTemplateSchema(schema).schema;
  const values = extractDocumentTemplateFieldValuesFromContent(
    safeSchema,
    content,
  );

  return applyDocumentTemplateDefaultValues(safeSchema, values);
}

export function compileDocumentTemplateContentFromSchema(
  schema: unknown,
  values: Record<string, string> | undefined,
  fallbackContent = "",
) {
  const safeSchema = getSafeDocumentTemplateSchema(schema).schema;
  const fields = getRenderableDocumentTemplateFields(safeSchema);

  if (fields.length === 0) {
    return normalizeNewlines(fallbackContent).trim();
  }

  return compileDocumentTemplateContent(safeSchema, values ?? {});
}

export function compileDocumentTemplateContent(
  schema: DocumentTemplateSchemaV1,
  values: Record<string, string>,
) {
  const fields = getVisibleRenderableDocumentTemplateFields(schema, values);

  if (fields.length === 1 && isPlainContentField(fields[0])) {
    return normalizeNewlines(values[fields[0].name] ?? "").trim();
  }

  return fields
    .map((field) => formatDocumentTemplateContentField(field, values))
    .join("\n\n");
}

export function validateDocumentTemplateContentValues(
  schema: unknown,
  values: Record<string, string> | undefined,
) {
  const safeSchema = getSafeDocumentTemplateSchema(schema).schema;
  const fieldValues = values ?? {};
  const fields = getVisibleRenderableDocumentTemplateFields(
    safeSchema,
    fieldValues,
  );
  const errors: string[] = [];

  for (const field of fields) {
    const value = fieldValues[field.name]?.trim() ?? "";

    if (field.required && !isFilledTemplateFieldValue(field, value)) {
      errors.push(`${field.label}을(를) 입력하세요.`);
      continue;
    }

    if (!value || field.type === "checkbox") {
      continue;
    }

    if (field.type === "number" && !Number.isFinite(Number(value))) {
      errors.push(`${field.label}은(는) 숫자로 입력하세요.`);
    }

    if (field.type === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      errors.push(`${field.label}은(는) 날짜 형식으로 입력하세요.`);
    }

    if (
      field.type === "select" &&
      field.options &&
      !field.options.some((option) => option.value === value)
    ) {
      errors.push(`${field.label} 선택값이 올바르지 않습니다.`);
    }
  }

  const startDate = fieldValues.startDate?.trim() ?? "";
  const endDate = fieldValues.endDate?.trim() ?? "";
  const hasVisibleStartDate = fields.some((field) => field.name === "startDate");
  const hasVisibleEndDate = fields.some((field) => field.name === "endDate");

  if (
    hasVisibleStartDate &&
    hasVisibleEndDate &&
    isDateFieldValue(startDate) &&
    isDateFieldValue(endDate) &&
    startDate > endDate
  ) {
    errors.push("종료일은 시작일 이후 날짜로 선택하세요.");
  }

  return errors;
}

export function extractDocumentTemplateFieldValuesFromContent(
  schema: unknown,
  content: string,
) {
  const safeSchema = getSafeDocumentTemplateSchema(schema).schema;
  const fields = getRenderableDocumentTemplateFields(safeSchema);

  if (fields.length === 1 && isPlainContentField(fields[0])) {
    return {
      [fields[0].name]: content,
    };
  }

  const sections = parseCompiledTemplateContent(
    content,
    fields.map((field) => field.label).sort((a, b) => b.length - a.length),
  );
  const sectionByLabel = new Map(
    sections.map((section) => [section.label, section.value]),
  );
  const values: Record<string, string> = {};

  for (const field of fields) {
    const value = sectionByLabel.get(field.label);

    if (value === undefined || value === "-") {
      values[field.name] = "";
      continue;
    }

    values[field.name] = normalizeExtractedTemplateValue(field, value);
  }

  return values;
}

export function getDocumentTemplateDisplayRows(
  schema: unknown,
  content: string,
): DocumentTemplateDisplayRow[] {
  const safeSchema = getSafeDocumentTemplateSchema(schema).schema;
  const fields = getRenderableDocumentTemplateFields(safeSchema);

  if (
    fields.length > 0 &&
    !(fields.length === 1 && isPlainContentField(fields[0])) &&
    parseCompiledTemplateContent(
      content,
      fields.map((field) => field.label).sort((a, b) => b.length - a.length),
    ).length === 0
  ) {
    return [];
  }

  const values = extractDocumentTemplateFieldValuesFromContent(
    safeSchema,
    content,
  );
  const visibleFields = getVisibleRenderableDocumentTemplateFields(
    safeSchema,
    values,
  );

  return visibleFields.map((field) => ({
    label: field.label,
    name: field.name,
    type: field.type,
    value: getDocumentTemplateDisplayValue(field, values[field.name] ?? ""),
  }));
}

export function extractDisplayContentFromTemplate(
  content: string,
  templateId?: string,
  schema?: unknown,
) {
  if (schema !== undefined) {
    const safeSchema = getSafeDocumentTemplateSchema(schema).schema;
    const fields = getRenderableDocumentTemplateFields(safeSchema);

    if (fields.length === 1 && isPlainContentField(fields[0])) {
      return extractTextareaContentFromCompiledTemplate(content, templateId);
    }

    const sections = parseCompiledTemplateContent(
      content,
      fields.map((field) => field.label).sort((a, b) => b.length - a.length),
    );

    if (sections.length > 0) {
      return content;
    }
  }

  return extractTextareaContentFromCompiledTemplate(content, templateId);
}

export function extractTextareaContentFromCompiledTemplate(
  content: string,
  templateId?: string,
) {
  const template = templateId ? draftTemplateFormats[templateId] : undefined;
  const fieldLabels =
    template?.fields.map((field) => field.label).sort((a, b) => b.length - a.length) ??
    fallbackFieldLabels;
  const textareaLabels = new Set(
    template
      ? template.fields
          .filter((field) => field.type === "textarea")
          .map((field) => field.label)
      : fallbackTextareaLabels,
  );
  const sections = parseCompiledTemplateContent(content, fieldLabels).filter(
    (section) => textareaLabels.has(section.label),
  );

  if (sections.length === 0) {
    return content;
  }

  if (sections.length === 1) {
    return sections[0].value || "-";
  }

  return sections
    .map((section) => `${section.label}\n${section.value || "-"}`)
    .join("\n\n");
}

function formatDocumentTemplateContentField(
  field: DocumentTemplateField,
  values: Record<string, string>,
) {
  const value = normalizeNewlines(values[field.name] ?? "").trim();
  const displayValue = getDocumentTemplateDisplayValue(field, value);

  if (!displayValue) {
    return `${field.label}: -`;
  }

  if (field.type === "textarea" && displayValue.includes("\n")) {
    return `${field.label}:\n${displayValue}`;
  }

  return `${field.label}: ${displayValue}`;
}

function getDocumentTemplateDisplayValue(
  field: DocumentTemplateField,
  value: string,
) {
  if (field.type === "checkbox") {
    return value === "true" ? "예" : "아니오";
  }

  if (field.type === "select") {
    return (
      field.options?.find((option) => option.value === value)?.label ??
      value
    );
  }

  return value;
}

function normalizeExtractedTemplateValue(
  field: DocumentTemplateField,
  value: string,
) {
  if (field.type === "checkbox") {
    return value === "예" || value === "true" ? "true" : "false";
  }

  if (field.type === "select") {
    return (
      field.options?.find((option) => option.label === value)?.value ?? value
    );
  }

  return value;
}

function applyDocumentTemplateDefaultValues(
  schema: DocumentTemplateSchemaV1,
  values: Record<string, string>,
) {
  const nextValues = { ...values };

  for (const field of getRenderableDocumentTemplateFields(schema)) {
    if (nextValues[field.name]) {
      continue;
    }

    const defaultValue = getDocumentTemplateFieldDefaultValue(field);

    if (defaultValue) {
      nextValues[field.name] = defaultValue;
    }
  }

  return nextValues;
}

function getDocumentTemplateFieldDefaultValue(field: DocumentTemplateField) {
  if (field.defaultValue === undefined) {
    return "";
  }

  return typeof field.defaultValue === "boolean"
    ? String(field.defaultValue)
    : field.defaultValue;
}

function isDocumentTemplateFieldVisible(
  field: DocumentTemplateField,
  values: Record<string, string>,
) {
  if (!field.visibleWhen) {
    return true;
  }

  const value = values[field.visibleWhen.field]?.trim() ?? "";

  return field.visibleWhen.values.includes(value);
}

function isFilledTemplateFieldValue(
  field: DocumentTemplateField,
  value: string,
) {
  if (field.type === "checkbox") {
    return value === "true";
  }

  return Boolean(value.trim());
}

function isPlainContentField(field: DocumentTemplateField) {
  return field.name === "content" && field.type === "textarea";
}

function isDateFieldValue(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isDocumentTemplateShellField(field: DocumentTemplateField) {
  return field.name === "title" || field.name === "attachments" || field.type === "attachments";
}

function formatTemplateContentField(
  field: TemplateFieldDefinition,
  rawValue: string,
) {
  const value = normalizeNewlines(rawValue).trim();

  if (!value) {
    return `${field.label}: -`;
  }

  if (field.type === "textarea" && value.includes("\n")) {
    return `${field.label}:\n${value}`;
  }

  return `${field.label}: ${value}`;
}

function parseCompiledTemplateContent(content: string, fieldLabels: string[]) {
  const sections: { label: string; value: string }[] = [];
  let current: { label: string; lines: string[] } | null = null;

  for (const line of normalizeNewlines(content).split("\n")) {
    const match = getFieldLabelMatch(line, fieldLabels);

    if (match) {
      if (current) {
        sections.push({
          label: current.label,
          value: trimOuterBlankLines(current.lines).join("\n"),
        });
      }

      current = {
        label: match.label,
        lines: match.value ? [match.value] : [],
      };
      continue;
    }

    if (current) {
      current.lines.push(line);
    }
  }

  if (current) {
    sections.push({
      label: current.label,
      value: trimOuterBlankLines(current.lines).join("\n"),
    });
  }

  return sections;
}

function getFieldLabelMatch(line: string, fieldLabels: string[]) {
  for (const label of fieldLabels) {
    const prefix = `${label}:`;

    if (line.startsWith(prefix)) {
      return {
        label,
        value: line.slice(prefix.length).trimStart(),
      };
    }
  }

  return null;
}

function trimOuterBlankLines(lines: string[]) {
  let start = 0;
  let end = lines.length;

  while (start < end && lines[start].trim() === "") {
    start += 1;
  }

  while (end > start && lines[end - 1].trim() === "") {
    end -= 1;
  }

  return lines.slice(start, end);
}

function normalizeNewlines(value: string) {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}
