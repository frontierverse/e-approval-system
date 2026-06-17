export const documentTemplateFieldTypes = [
  "text",
  "textarea",
  "number",
  "date",
  "select",
  "checkbox",
  "attachments",
] as const;

export type DocumentTemplateFieldType =
  (typeof documentTemplateFieldTypes)[number];

export type DocumentTemplateFieldOption = {
  label: string;
  value: string;
};

export type DocumentTemplateFieldCondition = {
  field: string;
  values: string[];
};

export type DocumentTemplateField = {
  name: string;
  label: string;
  type: DocumentTemplateFieldType;
  required: boolean;
  placeholder?: string;
  helpText?: string;
  defaultValue?: string | boolean;
  options?: DocumentTemplateFieldOption[];
  visibleWhen?: DocumentTemplateFieldCondition;
};

export type DocumentTemplateSchemaV1 = {
  version: 1;
  fields: DocumentTemplateField[];
};

export type DocumentTemplateSchemaValidationResult =
  | {
      ok: true;
      schema: DocumentTemplateSchemaV1;
    }
  | {
      ok: false;
      errors: string[];
    };

const documentTemplateFieldTypeSet = new Set<string>(
  documentTemplateFieldTypes,
);
const fieldNamePattern = /^[A-Za-z][A-Za-z0-9_]*$/;
const maxFieldCount = 50;
const maxOptionCount = 50;
const maxConditionValueCount = 50;

export const vacationRequestTemplateId = "template-vacation-request";

export function getDefaultDocumentTemplateSchema(): DocumentTemplateSchemaV1 {
  return {
    version: 1,
    fields: [
      { name: "title", label: "제목", type: "text", required: true },
      {
        name: "content",
        label: "기안 내용",
        type: "textarea",
        required: true,
      },
      {
        name: "attachments",
        label: "첨부파일",
        type: "attachments",
        required: false,
      },
    ],
  };
}

export function getVacationRequestDocumentTemplateSchema(): DocumentTemplateSchemaV1 {
  return {
    version: 1,
    fields: [
      { name: "title", label: "제목", type: "text", required: true },
      {
        name: "vacationType",
        label: "휴가 종류",
        type: "select",
        required: true,
        defaultValue: "annual",
        options: [
          { label: "연차", value: "annual" },
          { label: "반차", value: "half_day" },
          { label: "병가", value: "sick" },
          { label: "경조휴가", value: "family_event" },
          { label: "공가", value: "official" },
          { label: "대체휴무", value: "substitute" },
          { label: "기타", value: "other" },
        ],
      },
      {
        name: "startDate",
        label: "시작일",
        type: "date",
        required: true,
        visibleWhen: {
          field: "vacationType",
          values: [
            "annual",
            "sick",
            "family_event",
            "official",
            "substitute",
            "other",
          ],
        },
      },
      {
        name: "endDate",
        label: "종료일",
        type: "date",
        required: true,
        visibleWhen: {
          field: "vacationType",
          values: [
            "annual",
            "sick",
            "family_event",
            "official",
            "substitute",
            "other",
          ],
        },
      },
      {
        name: "halfDayDate",
        label: "반차 사용일",
        type: "date",
        required: true,
        visibleWhen: { field: "vacationType", values: ["half_day"] },
      },
      {
        name: "halfDayPeriod",
        label: "반차 구분",
        type: "select",
        required: true,
        options: [
          { label: "오전 (09:00~14:00)", value: "morning" },
          { label: "오후 (14:00~18:00)", value: "afternoon" },
        ],
        visibleWhen: { field: "vacationType", values: ["half_day"] },
      },
      {
        name: "familyEventType",
        label: "경조 구분",
        type: "select",
        required: true,
        options: [
          { label: "결혼", value: "marriage" },
          { label: "출산", value: "birth" },
          { label: "장례", value: "bereavement" },
          { label: "기타", value: "other" },
        ],
        visibleWhen: { field: "vacationType", values: ["family_event"] },
      },
      {
        name: "eventDate",
        label: "경조 발생일",
        type: "date",
        required: true,
        visibleWhen: { field: "vacationType", values: ["family_event"] },
      },
      {
        name: "emergencyContact",
        label: "비상 연락처",
        type: "text",
        required: false,
        placeholder: "010-0000-0000",
        visibleWhen: {
          field: "vacationType",
          values: [
            "annual",
            "sick",
            "family_event",
            "official",
            "substitute",
            "other",
          ],
        },
      },
      {
        name: "reason",
        label: "신청 사유",
        type: "textarea",
        required: true,
        placeholder: "휴가 신청 사유를 입력하세요.",
      },
      {
        name: "attachments",
        label: "첨부파일",
        type: "attachments",
        required: false,
      },
    ],
  };
}

export function getSafeDocumentTemplateSchema(input: unknown) {
  const validation = validateDocumentTemplateSchema(input);

  if (validation.ok) {
    return {
      schema: validation.schema,
      errors: [],
      usedFallback: false,
    };
  }

  return {
    schema: getDefaultDocumentTemplateSchema(),
    errors: validation.errors,
    usedFallback: true,
  };
}

export function validateDocumentTemplateSchema(
  input: unknown,
): DocumentTemplateSchemaValidationResult {
  const errors: string[] = [];

  if (!isPlainRecord(input)) {
    return {
      ok: false,
      errors: ["schema는 객체여야 합니다."],
    };
  }

  const rawVersion = input.version;

  if (rawVersion !== undefined && rawVersion !== 1) {
    errors.push("schema.version은 1이어야 합니다.");
  }

  const rawFields = input.fields;

  if (!Array.isArray(rawFields)) {
    return {
      ok: false,
      errors: [...errors, "schema.fields는 배열이어야 합니다."],
    };
  }

  if (rawFields.length === 0) {
    errors.push("schema.fields는 1개 이상이어야 합니다.");
  }

  if (rawFields.length > maxFieldCount) {
    errors.push(`schema.fields는 ${maxFieldCount}개 이하여야 합니다.`);
  }

  const fieldNames = new Set<string>();
  const fields: DocumentTemplateField[] = [];

  rawFields.forEach((rawField, index) => {
    const field = validateDocumentTemplateField(
      rawField,
      index,
      fieldNames,
      errors,
    );

    if (field) {
      fields.push(field);
    }
  });

  if (errors.length > 0) {
    return {
      ok: false,
      errors,
    };
  }

  return {
    ok: true,
    schema: {
      version: 1,
      fields,
    },
  };
}

export function isDocumentTemplateFieldType(
  value: unknown,
): value is DocumentTemplateFieldType {
  return typeof value === "string" && documentTemplateFieldTypeSet.has(value);
}

function validateDocumentTemplateField(
  input: unknown,
  index: number,
  fieldNames: Set<string>,
  errors: string[],
) {
  const path = `fields[${index}]`;
  const errorCount = errors.length;

  if (!isPlainRecord(input)) {
    errors.push(`${path}는 객체여야 합니다.`);
    return null;
  }

  const name = readRequiredString(input.name, `${path}.name`, 64, errors);
  const label = readRequiredString(input.label, `${path}.label`, 80, errors);
  const type = readFieldType(input.type, `${path}.type`, errors);
  const placeholder = readOptionalString(
    input.placeholder,
    `${path}.placeholder`,
    120,
    errors,
  );
  const helpText = readOptionalString(
    input.helpText,
    `${path}.helpText`,
    200,
    errors,
  );

  if (name) {
    if (!fieldNamePattern.test(name)) {
      errors.push(
        `${path}.name은 영문자로 시작하고 영문, 숫자, 밑줄만 사용할 수 있습니다.`,
      );
    }

    const normalizedName = name.toLocaleLowerCase("en-US");

    if (fieldNames.has(normalizedName)) {
      errors.push(`${path}.name은 중복될 수 없습니다.`);
    } else {
      fieldNames.add(normalizedName);
    }
  }

  if (!type || !name || !label) {
    return null;
  }

  const required = readRequiredFlag(input, `${path}.required`, errors);
  const options = readOptions(input, type, path, errors);
  const defaultValue = readDefaultValue(input, type, options, path, errors);
  const visibleWhen = readFieldCondition(
    input.visibleWhen,
    `${path}.visibleWhen`,
    errors,
  );

  if (errors.length > errorCount) {
    return null;
  }

  return {
    name,
    label,
    type,
    required,
    ...(placeholder ? { placeholder } : {}),
    ...(helpText ? { helpText } : {}),
    ...(defaultValue !== undefined ? { defaultValue } : {}),
    ...(options ? { options } : {}),
    ...(visibleWhen ? { visibleWhen } : {}),
  } satisfies DocumentTemplateField;
}

function readFieldType(
  value: unknown,
  path: string,
  errors: string[],
): DocumentTemplateFieldType | null {
  if (!isDocumentTemplateFieldType(value)) {
    errors.push(
      `${path}은 ${documentTemplateFieldTypes.join(", ")} 중 하나여야 합니다.`,
    );
    return null;
  }

  return value;
}

function readRequiredFlag(
  input: Record<string, unknown>,
  path: string,
  errors: string[],
) {
  if (!hasOwn(input, "required") || input.required === undefined) {
    return true;
  }

  if (typeof input.required !== "boolean") {
    errors.push(`${path}는 true 또는 false여야 합니다.`);
    return true;
  }

  return input.required;
}

function readOptions(
  input: Record<string, unknown>,
  type: DocumentTemplateFieldType,
  path: string,
  errors: string[],
) {
  if (type !== "select") {
    if (hasOwn(input, "options") && input.options !== undefined) {
      errors.push(`${path}.options는 select 필드에서만 사용할 수 있습니다.`);
    }

    return undefined;
  }

  if (!Array.isArray(input.options)) {
    errors.push(`${path}.options는 선택 옵션 배열이어야 합니다.`);
    return undefined;
  }

  if (input.options.length === 0) {
    errors.push(`${path}.options는 1개 이상이어야 합니다.`);
    return undefined;
  }

  if (input.options.length > maxOptionCount) {
    errors.push(`${path}.options는 ${maxOptionCount}개 이하여야 합니다.`);
    return undefined;
  }

  const optionValues = new Set<string>();
  const options: DocumentTemplateFieldOption[] = [];

  input.options.forEach((rawOption, optionIndex) => {
    const optionPath = `${path}.options[${optionIndex}]`;

    if (!isPlainRecord(rawOption)) {
      errors.push(`${optionPath}는 객체여야 합니다.`);
      return;
    }

    const label = readRequiredString(
      rawOption.label,
      `${optionPath}.label`,
      80,
      errors,
    );
    const value = readRequiredString(
      rawOption.value,
      `${optionPath}.value`,
      80,
      errors,
    );

    if (!label || !value) {
      return;
    }

    if (optionValues.has(value)) {
      errors.push(`${optionPath}.value는 중복될 수 없습니다.`);
      return;
    }

    optionValues.add(value);
    options.push({ label, value });
  });

  return options;
}

function readDefaultValue(
  input: Record<string, unknown>,
  type: DocumentTemplateFieldType,
  options: DocumentTemplateFieldOption[] | undefined,
  path: string,
  errors: string[],
) {
  if (!hasOwn(input, "defaultValue") || input.defaultValue === undefined) {
    return undefined;
  }

  if (input.defaultValue === null) {
    return undefined;
  }

  if (type === "attachments") {
    errors.push(`${path}.defaultValue는 첨부파일 필드에서 사용할 수 없습니다.`);
    return undefined;
  }

  if (type === "checkbox") {
    if (typeof input.defaultValue === "boolean") {
      return input.defaultValue;
    }

    if (input.defaultValue === "true") {
      return true;
    }

    if (input.defaultValue === "false") {
      return false;
    }

    errors.push(`${path}.defaultValue는 체크박스에서 true 또는 false여야 합니다.`);
    return undefined;
  }

  if (typeof input.defaultValue !== "string") {
    errors.push(`${path}.defaultValue는 문자열이어야 합니다.`);
    return undefined;
  }

  const defaultValue = input.defaultValue.trim();

  if (!defaultValue) {
    return undefined;
  }

  if (defaultValue.length > 1000) {
    errors.push(`${path}.defaultValue는 1000자 이하여야 합니다.`);
    return undefined;
  }

  if (type === "number" && !Number.isFinite(Number(defaultValue))) {
    errors.push(`${path}.defaultValue는 숫자여야 합니다.`);
    return undefined;
  }

  if (type === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(defaultValue)) {
    errors.push(`${path}.defaultValue는 YYYY-MM-DD 형식이어야 합니다.`);
    return undefined;
  }

  if (
    type === "select" &&
    options &&
    !options.some((option) => option.value === defaultValue)
  ) {
    errors.push(`${path}.defaultValue는 options에 있는 value여야 합니다.`);
    return undefined;
  }

  return defaultValue;
}

function readFieldCondition(
  value: unknown,
  path: string,
  errors: string[],
): DocumentTemplateFieldCondition | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (!isPlainRecord(value)) {
    errors.push(`${path}는 객체여야 합니다.`);
    return undefined;
  }

  const field = readRequiredString(value.field, `${path}.field`, 64, errors);
  const rawValues = value.values;

  if (!field) {
    return undefined;
  }

  if (!fieldNamePattern.test(field)) {
    errors.push(`${path}.field는 올바른 필드 이름이어야 합니다.`);
  }

  if (!Array.isArray(rawValues)) {
    errors.push(`${path}.values는 배열이어야 합니다.`);
    return undefined;
  }

  if (rawValues.length === 0) {
    errors.push(`${path}.values는 1개 이상이어야 합니다.`);
    return undefined;
  }

  if (rawValues.length > maxConditionValueCount) {
    errors.push(`${path}.values는 ${maxConditionValueCount}개 이하여야 합니다.`);
    return undefined;
  }

  const conditionValues: string[] = [];
  const valueSet = new Set<string>();

  rawValues.forEach((rawValue, index) => {
    const conditionValue = readRequiredString(
      rawValue,
      `${path}.values[${index}]`,
      80,
      errors,
    );

    if (!conditionValue || valueSet.has(conditionValue)) {
      return;
    }

    valueSet.add(conditionValue);
    conditionValues.push(conditionValue);
  });

  return {
    field,
    values: conditionValues,
  };
}

function readRequiredString(
  value: unknown,
  path: string,
  maxLength: number,
  errors: string[],
) {
  if (typeof value !== "string") {
    errors.push(`${path}은 문자열이어야 합니다.`);
    return null;
  }

  const trimmedValue = value.trim();

  if (!trimmedValue) {
    errors.push(`${path}은 비워둘 수 없습니다.`);
    return null;
  }

  if (trimmedValue.length > maxLength) {
    errors.push(`${path}은 ${maxLength}자 이하여야 합니다.`);
    return null;
  }

  return trimmedValue;
}

function readOptionalString(
  value: unknown,
  path: string,
  maxLength: number,
  errors: string[],
) {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "string") {
    errors.push(`${path}은 문자열이어야 합니다.`);
    return undefined;
  }

  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return undefined;
  }

  if (trimmedValue.length > maxLength) {
    errors.push(`${path}은 ${maxLength}자 이하여야 합니다.`);
    return undefined;
  }

  return trimmedValue;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(input: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(input, key);
}
