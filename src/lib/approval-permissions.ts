import "server-only";

import type { Prisma, UserRole } from "@/generated/prisma/client";
import {
  canReadApprovalDocument as canReadApprovalDocumentCore,
  getReadableDocumentWhere as getReadableDocumentWhereCore,
  type ReadableDocumentShape,
} from "@/lib/approval-permissions-core";

export function canReadApprovalDocument(
  userId: string,
  role: UserRole,
  document: ReadableDocumentShape,
) {
  return canReadApprovalDocumentCore(userId, role, document);
}

export function getReadableDocumentWhere(
  userId: string,
  role: UserRole,
): Prisma.ApprovalDocumentWhereInput {
  return getReadableDocumentWhereCore(
    userId,
    role,
  ) as Prisma.ApprovalDocumentWhereInput;
}
