export type TemplateFieldType = "date" | "number" | "text" | "textarea";

export type TemplateFieldDefinition = {
  id: string;
  label: string;
  placeholder?: string;
  type: TemplateFieldType;
};

export type TemplateFormatDefinition = {
  title: string;
  fields: TemplateFieldDefinition[];
};

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
        id: "expenseDate",
        label: "지출일",
        type: "date",
      },
      {
        id: "vendor",
        label: "거래처",
        placeholder: "예: ○○문구",
        type: "text",
      },
      {
        id: "amount",
        label: "지출 금액",
        placeholder: "예: 150000",
        type: "number",
      },
      {
        id: "accountTitle",
        label: "계정과목",
        placeholder: "예: 사무용품비",
        type: "text",
      },
      {
        id: "reason",
        label: "지출 사유",
        placeholder: "지출 목적과 산출 근거를 입력하세요.",
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
