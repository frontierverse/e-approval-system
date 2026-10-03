import "server-only";
import { prisma } from "@/lib/prisma";
import { mobileInboxOrderBy, mobileInboxPageSize, mobileInboxWhere, type MobileInboxFilters } from "@/lib/mobile-inbox-core";

export async function getMobileInboxPage(userId: string, filters: MobileInboxFilters) {
  const where = mobileInboxWhere(userId, filters);
  const total = await prisma.approvalDocument.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / mobileInboxPageSize));
  const page = Math.min(filters.page, totalPages);
  const documents = await prisma.approvalDocument.findMany({
    where, skip: (page - 1) * mobileInboxPageSize, take: mobileInboxPageSize,
    orderBy: mobileInboxOrderBy(filters),
    select: {
      id: true, documentNo: true, title: true, status: true, submittedAt: true,
      drafter: { select: { name: true } },
      approvalSteps: {
        where: { approverId: userId, status: "PENDING" },
        orderBy: { order: "asc" }, select: { order: true }, take: 1,
      },
      _count: { select: { attachments: true } },
    },
  });
  return { total, page, pageSize: mobileInboxPageSize, totalPages,
    documents: documents.map(document => ({
      id: document.id, documentNo: document.documentNo ?? "", title: document.title,
      status: document.status.toLowerCase(), submittedAt: document.submittedAt?.toISOString() ?? null,
      drafterName: document.drafter.name, stepOrder: document.approvalSteps[0]?.order ?? null,
      attachmentCount: document._count.attachments,
    })),
  };
}
