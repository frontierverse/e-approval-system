import "server-only";
import { prisma } from "@/lib/prisma";
import { mobileDocumentOrderBy, mobileDocumentPageSize, mobileDocumentWhere, type MobileDocumentFilters } from "@/lib/mobile-document-library-core";

export async function getMobileDocumentPage(userId: string, filters: MobileDocumentFilters) {
  const where = mobileDocumentWhere(userId, filters);
  const total = await prisma.approvalDocument.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / mobileDocumentPageSize));
  const page = Math.min(filters.page, totalPages);
  const documents = await prisma.approvalDocument.findMany({
    where, orderBy: mobileDocumentOrderBy(filters),
    skip: (page - 1) * mobileDocumentPageSize, take: mobileDocumentPageSize,
    select: {
      id: true, title: true, documentNo: true, category: true, status: true,
      createdAt: true, updatedAt: true, submittedAt: true, completedAt: true,
      drafter: { select: { name: true } },
      _count: { select: { attachments: true } },
      approvalSteps: { where: { status: "PENDING" }, orderBy: { order: "asc" }, take: 1,
        select: { approver: { select: { name: true } } } },
    },
  });
  return { folder: filters.folder, total, page, pageSize: mobileDocumentPageSize, totalPages,
    documents: documents.map(document => ({
      id: document.id, title: document.title, documentNo: document.documentNo ?? "",
      category: document.category, status: document.status.toLowerCase(), drafterName: document.drafter.name,
      createdAt: document.createdAt.toISOString(), updatedAt: document.updatedAt.toISOString(),
      submittedAt: document.submittedAt?.toISOString() ?? null, completedAt: document.completedAt?.toISOString() ?? null,
      attachmentCount: document._count.attachments,
      currentApproverName: document.status === "SUBMITTED" || document.status === "IN_PROGRESS" ?
        document.approvalSteps[0]?.approver.name ?? null : null,
    })),
  };
}
