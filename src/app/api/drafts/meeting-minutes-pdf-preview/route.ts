import { NextResponse } from "next/server";
import { UserStatus } from "@/generated/prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { createApprovalDocumentPdfBuffer } from "@/lib/generated-approval-pdf";
import { parseMeetingMinutesPdfPreviewRequest } from "@/lib/meeting-minutes-pdf-preview";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = parseMeetingMinutesPdfPreviewRequest(body);

  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  if (parsed.values.approverIds.includes(user.id)) {
    return NextResponse.json(
      { error: "작성자 본인은 결재자로 지정할 수 없습니다." },
      { status: 400 },
    );
  }

  const [template, approvers] = await Promise.all([
    prisma.documentTemplate.findFirst({
      where: {
        id: parsed.values.templateId,
        isActive: true,
      },
      select: {
        name: true,
        schema: true,
      },
    }),
    prisma.user.findMany({
      where: {
        id: { in: parsed.values.approverIds },
        status: UserStatus.ACTIVE,
      },
      select: {
        id: true,
        name: true,
        department: { select: { name: true } },
        position: { select: { name: true } },
      },
    }),
  ]);

  if (!template) {
    return NextResponse.json(
      { error: "사용 가능한 회의록 양식이 아닙니다." },
      { status: 404 },
    );
  }

  if (approvers.length !== parsed.values.approverIds.length) {
    return NextResponse.json(
      { error: "사용 가능한 결재자만 지정할 수 있습니다." },
      { status: 400 },
    );
  }

  const approverById = new Map(
    approvers.map((approver) => [approver.id, approver]),
  );
  const orderedApprovers = parsed.values.approverIds.flatMap((approverId) => {
    const approver = approverById.get(approverId);

    return approver
      ? [
          {
            name: approver.name,
            departmentName: approver.department.name,
            positionName: approver.position.name,
          },
        ]
      : [];
  });

  try {
    const buffer = await createApprovalDocumentPdfBuffer({
      documentNo: null,
      title: parsed.values.title || "제목 미입력",
      category: template.name,
      content: parsed.values.content,
      templateName: template.name,
      templateSchema: template.schema,
      drafter: {
        name: user.name,
        departmentName: user.department.name,
        positionName: user.position.name,
      },
      approvers: orderedApprovers,
      issuedAt: new Date(),
    });
    const fileName = sanitizePdfFileName(
      parsed.values.title || "회의록 미리보기",
    );

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(
          `${fileName}.pdf`,
        )}`,
        "Content-Type": "application/pdf",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Failed to create meeting minutes PDF preview", error);

    return NextResponse.json(
      { error: "회의록 PDF 미리보기를 생성하지 못했습니다." },
      { status: 500 },
    );
  }
}

function sanitizePdfFileName(value: string) {
  return (
    value.replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim() ||
    "회의록 미리보기"
  );
}
