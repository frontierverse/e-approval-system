import "server-only";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getKoreanDateValue } from "@/lib/document-archive-policy";
import type { AuditLogRequestData } from "@/lib/audit-log-request";
import { CafeError } from "@/lib/mobile-cafe-core";
export type CafeContext = { actorId: string; db?: Pick<PrismaClient, "$transaction">; now?: () => Date; requestData?: AuditLogRequestData };
export const cafeNow = (context: CafeContext) => new Date((context.now?.() ?? new Date()).getTime());
export const cafeToday = (now: Date) => getKoreanDateValue(now).replace(/^(\d{1,4})-/, (_, year: string) => year.padStart(4, "0") + "-");
export async function lockCafeActor(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${id} FOR SHARE`);
  const actor = await tx.user.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!actor || actor.status !== "ACTIVE") throw new CafeError("인증이 필요합니다.", "UNAUTHORIZED", 401);
  return actor;
}
function record(value: unknown): Record<string, unknown> | null { return value !== null && typeof value === "object" ? value as Record<string, unknown> : null; }
function adapterConflict(value: unknown) { return record(value)?.name === "DriverAdapterError" && record(record(value)?.cause)?.kind === "TransactionWriteConflict"; }
export function cafeTransactionConflict(value: unknown) {
  const seen = new Set<Error>(); let error = value;
  for (let depth = 0; depth <= 4 && error instanceof Error && !seen.has(error); depth++) {
    seen.add(error); const item = record(error)!;
    if (error.name === "PrismaClientKnownRequestError" && (item.code === "P2034" || adapterConflict(record(item.meta)?.driverAdapterError))) return true;
    if (adapterConflict(error)) return true;
    error = item.cause;
  }
  return false;
}
export function cafeReceiptConflict(error: unknown) {
  if (!(error instanceof Error) || error.name !== "PrismaClientKnownRequestError") return false;
  const value = record(error), meta = record(value?.meta);
  if (value?.code !== "P2002" || meta?.modelName !== "CafeMutationReceipt") return false;
  const constraint = record(record(record(meta.driverAdapterError)?.cause)?.constraint), fields = meta.target ?? constraint?.fields;
  return fields === "CafeMutationReceipt_actorId_requestId_key" || constraint?.index === "CafeMutationReceipt_actorId_requestId_key" || Array.isArray(fields) && fields.length === 2 && fields.includes("actorId") && fields.includes("requestId");
}
export async function cafeTransaction<T>(context: CafeContext, operation: (tx: Prisma.TransactionClient, today: string, now: Date) => Promise<T>, mutation = false): Promise<T> {
  const now = cafeNow(context), today = cafeToday(now);
  for (let attempt = 0; ; attempt++) try {
    return await (context.db ?? prisma).$transaction(async tx => { await lockCafeActor(tx, context.actorId); return operation(tx, today, now); }, { isolationLevel: mutation ? "Serializable" : "RepeatableRead", timeout: 15000, maxWait: 10000 });
  } catch (error) { if (attempt >= 2 || !cafeTransactionConflict(error) && !(mutation && cafeReceiptConflict(error))) throw error; }
}
export async function lockCafeRequest(tx: Prisma.TransactionClient, actorId: string, requestId: string) { await tx.$queryRaw(Prisma.sql`SELECT 1 FROM pg_advisory_xact_lock(hashtext('cafe-mutation'), hashtext(${actorId + ":" + requestId}))`); }
