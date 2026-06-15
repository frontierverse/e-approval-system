import { NextResponse } from "next/server";
import { UserRole } from "@/generated/prisma/client";
import { getCurrentUser } from "@/lib/auth";
import {
  compileDocumentTemplateContent,
  getRenderableDocumentTemplateFields,
} from "@/lib/draft-template-content";
import { createApprovalDocumentPdfBuffer } from "@/lib/generated-approval-pdf";
import {
  validateDocumentTemplateSchema,
  type DocumentTemplateField,
  type DocumentTemplateSchemaV1,
} from "@/lib/document-template-schema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type TemplatePdfPreviewRequest = {
  schema?: unknown;
  templateName?: unknown;
};

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  if (user.role !== UserRole.ADMIN) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | TemplatePdfPreviewRequest
    | null;
  const templateName = readPreviewText(body?.templateName, "문서 양식", 80);
  const validation = validateDocumentTemplateSchema(body?.schema);

  if (!validation.ok) {
    return NextResponse.json(
      { error: validation.errors[0] ?? "schema가 올바르지 않습니다." },
      { status: 400 },
    );
  }

  const previewContent = compileDocumentTemplateContent(
    validation.schema,
    getTemplatePdfPreviewValues(validation.schema),
  );
  const buffer = await createApprovalDocumentPdfBuffer({
    documentNo: null,
    title: getTemplatePdfPreviewTitle(validation.schema, templateName),
    category: templateName,
    content: previewContent,
    templateName,
    templateSchema: validation.schema,
    drafter: {
      name: user.name,
      departmentName: user.department.name,
      positionName: user.position.name,
    },
    approvers: [
      {
        name: "1차 결재자",
        departmentName: user.department.name,
        positionName: user.position.name,
      },
      {
        name: "2차 결재자",
        departmentName: user.department.name,
        positionName: "승인권자",
      },
    ],
    issuedAt: new Date(),
  });

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(
        `${sanitizePdfFileName(templateName)}_preview.pdf`,
      )}`,
      "Content-Type": "application/pdf",
    },
  });
}

function getTemplatePdfPreviewTitle(
  schema: DocumentTemplateSchemaV1,
  templateName: string,
) {
  const titleField = schema.fields.find((field) => field.name === "title");

  return titleField?.placeholder?.trim() || `${templateName} 미리보기`;
}

function getTemplatePdfPreviewValues(schema: DocumentTemplateSchemaV1) {
  const values: Record<string, string> = {};

  for (const field of getRenderableDocumentTemplateFields(schema)) {
    values[field.name] = getTemplatePdfPreviewValue(field);
  }

  return values;
}

function getTemplatePdfPreviewValue(field: DocumentTemplateField) {
  if (typeof field.defaultValue === "boolean") {
    return field.defaultValue ? "true" : "false";
  }

  if (typeof field.defaultValue === "string" && field.defaultValue.trim()) {
    return field.defaultValue.trim();
  }

  if (field.type === "select") {
    return field.options?.[0]?.value ?? "";
  }

  if (field.type === "checkbox") {
    return "true";
  }

  if (field.type === "number") {
    return "100000";
  }

  if (field.type === "date") {
    return new Date().toISOString().slice(0, 10);
  }

  if (field.placeholder?.trim()) {
    return field.placeholder.trim();
  }

  if (field.type === "textarea") {
    return `${field.label} 예시 내용입니다.\n문서 작성자가 입력한 상세 내용이 실제 PDF에서 이 영역에 표시됩니다.`;
  }

  return `${field.label} 입력값`;
}

function readPreviewText(
  value: unknown,
  fallback: string,
  maxLength: number,
) {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return fallback;
  }

  return trimmedValue.slice(0, maxLength);
}

function sanitizePdfFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim();
}
