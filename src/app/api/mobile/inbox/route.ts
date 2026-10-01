import { ApprovalStepStatus, DocumentStatus } from "@/generated/prisma/client";
import { getMobileSession, mobileJson } from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getMobileSession(request);
  if (!session) return mobileJson({ error: "로그인이 필요합니다." }, 401);

  const where = {
    status: { in: [DocumentStatus.SUBMITTED, DocumentStatus.IN_PROGRESS] },
    approvalSteps: { some: { approverId: session.userId, status: ApprovalStepStatus.PENDING } },
  };
  const [total, documents] = await Promise.all([
    prisma.approvalDocument.count({ where }),
    prisma.approvalDocument.findMany({
      where,
      take: 30,
      orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        documentNo: true,
        title: true,
        status: true,
        submittedAt: true,
        drafter: { select: { name: true } },
        approvalSteps: {
          where: { approverId: session.userId, status: ApprovalStepStatus.PENDING },
          select: { order: true },
          take: 1,
        },
        _count: { select: { attachments: true } },
      },
    }),
  ]);

  return mobileJson({
    total,
    documents: documents.map((document) => ({
      id: document.id,
      documentNo: document.documentNo ?? "",
      title: document.title,
      status: document.status.toLowerCase(),
      submittedAt: document.submittedAt?.toISOString() ?? null,
      drafterName: document.drafter.name,
      stepOrder: document.approvalSteps[0]?.order ?? null,
      attachmentCount: document._count.attachments,
    })),
  });
}
