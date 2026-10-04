import "server-only";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { MobileDraftError } from "@/lib/mobile-draft-core";
export type MobileDraftDependencies = {
  db?: Pick<PrismaClient, "$transaction">;
  now?: () => Date;
  cache?: (path: string) => void | Promise<void>;
  generatePdf?: (documentId: string, actorId: string) => Promise<unknown>;
};
function object(value: unknown): Record<string, unknown> | null { return value !== null && typeof value === "object" ? value as Record<string, unknown> : null; }
export function mobileDraftTransactionConflict(value: unknown) {
  const seen = new Set<Error>(); let error = value;
  for (let depth = 0; depth <= 4 && error instanceof Error && !seen.has(error); depth++) {
    seen.add(error); const data = object(error)!;
    const adapter = (item: unknown) => object(item)?.name === "DriverAdapterError" && object(object(item)?.cause)?.kind === "TransactionWriteConflict";
    if (error.name === "PrismaClientKnownRequestError" && (data.code === "P2034" || adapter(object(data.meta)?.driverAdapterError)) || adapter(error)) return true;
    error = data.cause;
  }
  return false;
}
export async function mobileDraftTransaction<T>(actorId: string, dependencies: MobileDraftDependencies, callback: (tx: Prisma.TransactionClient, now: Date) => Promise<T>, mutation = false): Promise<T> {
  const now = new Date((dependencies.now?.() ?? new Date()).getTime());
  for (let attempt = 0; ; attempt++) try {
    return await (dependencies.db ?? prisma).$transaction(async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${actorId} FOR SHARE`);
      const actor = await tx.user.findUnique({ where: { id: actorId }, select: { status: true } });
      if (actor?.status !== "ACTIVE") throw new MobileDraftError("로그인이 필요합니다.", 401);
      return callback(tx, now);
    }, { isolationLevel: mutation ? "ReadCommitted" : "RepeatableRead", timeout: 20000, maxWait: 10000 });
  } catch (error) { if (attempt >= 2 || !mobileDraftTransactionConflict(error)) throw error; }
}
