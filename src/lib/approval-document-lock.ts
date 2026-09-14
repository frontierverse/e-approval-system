import { Prisma } from "@/generated/prisma/client";

/** Acquire the document first, before reading decisions or changing its steps. */
export async function lockApprovalDocument(tx: Prisma.TransactionClient, documentId: string) {
  await tx.$queryRaw(Prisma.sql`
    SELECT "id" FROM "ApprovalDocument" WHERE "id" = ${documentId} FOR UPDATE
  `);
}
