import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { AuditLogRequestData } from "@/lib/audit-log-request";
import { getEffectiveYouthPermissions, type YouthPermissionKey } from "@/lib/youth-permissions-core";
import { isRestrictedYouth } from "@/lib/youth-retention-core";
import { YouthError, youthId, type YouthPermissions, type YouthBasic, type YouthMutationOperation, type YouthMutationResult } from "@/lib/mobile-youth-core";

export type YouthContext = { actorId: string; db?: Pick<PrismaClient, "$transaction">; now?: () => Date; requestData?: AuditLogRequestData; client?: "mobile" | "web" };
const actorSelect = { id: true, name: true, status: true, role: true, canViewYouthDetails: true, canViewYouthContacts: true, canDownloadYouthDocuments: true, canManageYouth: true } satisfies Prisma.UserSelect;
export type YouthActor = Prisma.UserGetPayload<{ select: typeof actorSelect }>;
export const youthBasicSelect = { id: true, name: true, admissionDate: true, dischargeDate: true, updatedAt: true } satisfies Prisma.YouthSelect;
export const youthScopeSelect = { ...youthBasicSelect, actualDischargeDate: true, purgeStartedAt: true, purgedAt: true } satisfies Prisma.YouthSelect;
export type YouthScopeRecord = Prisma.YouthGetPayload<{ select: typeof youthScopeSelect }>;
export type YouthReceipt = Prisma.YouthMutationReceiptGetPayload<Record<string, never>>;
export function youthPermissions(actor: YouthActor): YouthPermissions { const permission = getEffectiveYouthPermissions(actor); if (!permission.canViewYouthBasic) throw new YouthError("인증이 필요합니다.", "UNAUTHORIZED", 401); return { ...permission, canViewYouthBasic: true, canDeleteYouth: false }; }
export function mapYouthBasic(record: YouthBasic | Prisma.YouthGetPayload<{ select: typeof youthBasicSelect }>): YouthBasic { return { id: record.id, name: record.name, admissionDate: record.admissionDate, dischargeDate: record.dischargeDate, updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : record.updatedAt.toISOString() }; }
export function youthToday(now: Date): string { return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(now); }
export async function lockYouthActor(tx: Prisma.TransactionClient, actorId: string): Promise<YouthActor> { await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${actorId} FOR SHARE`); const actor = await tx.user.findUnique({ where: { id: actorId }, select: actorSelect }); if (!actor || actor.status !== "ACTIVE") throw new YouthError("인증이 필요합니다.", "UNAUTHORIZED", 401); return actor; }
export function assertYouthPermission(actor: YouthActor, permission: YouthPermissionKey) { if (!youthPermissions(actor)[permission]) throw new YouthError("이 작업을 수행할 권한이 없습니다.", "FORBIDDEN", 403); }
export async function lockOperationalYouth(tx: Prisma.TransactionClient, id: string, today: string, options: { write?: boolean } = {}): Promise<YouthScopeRecord> { youthId(id); if (options.write) await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Youth" WHERE "id" = ${id} FOR UPDATE`); else await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Youth" WHERE "id" = ${id} FOR SHARE`); const row = await tx.youth.findUnique({ where: { id }, select: youthScopeSelect }); if (!row || isRestrictedYouth(row, today)) throw new YouthError("청소년을 찾을 수 없습니다.", "NOT_FOUND", 404); return row; }
export async function lockYouthRequest(tx: Prisma.TransactionClient, actorId: string, requestId: string, namespace = "youth-mutation") { await tx.$queryRaw(Prisma.sql`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${namespace}), hashtext(${actorId + ":" + requestId}))`); }
function object(value: unknown): Record<string, unknown> | null { return value && typeof value === "object" ? value as Record<string, unknown> : null; }
function adapterConflict(value: unknown) { const row = object(value); return row?.name === "DriverAdapterError" && object(row.cause)?.kind === "TransactionWriteConflict"; }
export function youthTransactionConflict(value: unknown) { const seen = new Set<Error>(); let error = value; for (let depth = 0; depth <= 4 && error instanceof Error && !seen.has(error); depth++) { seen.add(error); const row = object(error)!; if (error.name === "PrismaClientKnownRequestError" && (row.code === "P2034" || adapterConflict(object(row.meta)?.driverAdapterError)) || adapterConflict(error)) return true; error = row.cause; } return false; }
export function youthReceiptConflict(value: unknown, model: "YouthMutationReceipt" | "YouthViewRequest") { if (!(value instanceof Error) || value.name !== "PrismaClientKnownRequestError") return false; const row = object(value), meta = object(row?.meta); if (row?.code !== "P2002" || meta?.modelName !== model) return false; const constraint = object(object(object(meta.driverAdapterError)?.cause)?.constraint), target = meta.target ?? constraint?.fields, index = model + "_actorId_requestId_key"; return target === index || constraint?.index === index || Array.isArray(target) && target.length === 2 && target.includes("actorId") && target.includes("requestId"); }
export async function withYouthRead<T>(context: YouthContext, callback: (tx: Prisma.TransactionClient, actor: YouthActor, today: string, now: Date) => Promise<T>): Promise<T> { return youthTransaction(context, callback); }
export async function youthTransaction<T>(context: YouthContext, callback: (tx: Prisma.TransactionClient, actor: YouthActor, today: string, now: Date) => Promise<T>, options: { write?: boolean; receiptModel?: "YouthMutationReceipt" | "YouthViewRequest" } = {}): Promise<T> { const now = new Date((context.now?.() ?? new Date()).getTime()), today = youthToday(now); for (let attempt = 0; ; attempt++) try { return await (context.db ?? prisma).$transaction(async tx => callback(tx, await lockYouthActor(tx, context.actorId), today, now), { isolationLevel: options.write ? "Serializable" : "RepeatableRead", maxWait: 10000, timeout: 15000 }); } catch (error) { if (attempt >= 2 || !youthTransactionConflict(error) && !(options.receiptModel && youthReceiptConflict(error, options.receiptModel))) throw error; } }
function canonical(value: unknown): unknown { if (Array.isArray(value)) return value.map(canonical); if (value instanceof Date) return value.toISOString(); if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, canonical(entry)])); return value; }
export function youthPayloadHash(value: unknown) { return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex"); }
export type YouthMutationOptions<T> = { operation: YouthMutationOperation; requestId: string; payload: unknown; youthId?: string | null; targetType: string; targetId?: string | null; permission?: YouthPermissionKey; replay?: (tx: Prisma.TransactionClient, actor: YouthActor, today: string, now: Date, receipt: YouthReceipt) => Promise<T | null> };
export function youthMutationEnvelope<T>(receipt: YouthReceipt, result: T | null, replayed: boolean, unavailable = false): YouthMutationResult<T> { return { ok: true, replayed, requestId: receipt.requestId, operation: receipt.operation as YouthMutationOperation, targetType: receipt.targetType, targetId: receipt.targetId, youthId: receipt.youthId, outcome: unavailable ? "unavailable" : receipt.operation.endsWith(".delete") ? "deleted" : "present", committedAt: receipt.committedAt.toISOString(), committedUpdatedAt: unavailable ? null : receipt.committedUpdatedAt?.toISOString() ?? null, result }; }
function youthNameConflict(value: unknown) { if (!(value instanceof Error) || value.name !== "PrismaClientKnownRequestError") return false; const row = object(value), meta = object(row?.meta); if (row?.code !== "P2002" || meta?.modelName !== "Youth") return false; const constraint = object(object(object(meta.driverAdapterError)?.cause)?.constraint), target = meta.target ?? constraint?.fields; return target === "Youth_name_key" || constraint?.index === "Youth_name_key" || Array.isArray(target) && target.length === 1 && target[0] === "name"; }
export async function withYouthMutation<T>(context: YouthContext, options: YouthMutationOptions<T>, callback: (tx: Prisma.TransactionClient, actor: YouthActor, today: string, now: Date, receiptId: string) => Promise<{ targetId: string; committedUpdatedAt?: Date | null; committedTargets?: Prisma.InputJsonValue; result: T }>): Promise<YouthMutationResult<T>> {
  youthId(options.requestId, true);
  return youthTransaction(context, async (tx, actor, today, now) => {
    assertYouthPermission(actor, options.permission ?? "canManageYouth");
    if (options.youthId) await lockOperationalYouth(tx, options.youthId, today, { write: true });
    await lockYouthRequest(tx, actor.id, options.requestId);
    const hash = youthPayloadHash({ operation: options.operation, youthId: options.youthId ?? null, targetType: options.targetType, targetId: options.targetId ?? null, payload: options.payload });
    const existing = await tx.youthMutationReceipt.findUnique({ where: { actorId_requestId: { actorId: actor.id, requestId: options.requestId } } });
    if (existing) {
      if (existing.state !== "committed" || existing.payloadHash !== hash || existing.operation !== options.operation) throw new YouthError("같은 요청의 내용이 변경되었습니다. 결과를 확인한 후 새 작업을 시작하세요.", "REQUEST_CONFLICT", 409);
      let unavailable = false;
      if (existing.youthId && options.operation === "profile.create") { const parent = await tx.youth.findUnique({ where: { id: existing.youthId }, select: youthScopeSelect }); unavailable = !parent || isRestrictedYouth(parent, today); }
      const result = unavailable ? null : options.replay ? await options.replay(tx, actor, today, now, existing) : null;
      return youthMutationEnvelope(existing, result, true, unavailable || Boolean(options.replay && result === null && !existing.operation.endsWith(".delete")));
    }
    const receiptId = randomUUID(), effect = await callback(tx, actor, today, now, receiptId);
    const receipt = await tx.youthMutationReceipt.create({ data: { id: receiptId, actorId: actor.id, requestId: options.requestId, operation: options.operation, targetType: options.targetType, targetId: effect.targetId, youthId: options.operation === "profile.create" ? effect.targetId : options.youthId ?? null, payloadHash: hash, committedUpdatedAt: effect.committedUpdatedAt ?? null, ...(effect.committedTargets !== undefined ? { committedTargetsJson: effect.committedTargets } : {}), state: "committed", committedAt: now } });
    const unavailable = options.operation === "profile.create" && isRestrictedYouth(await tx.youth.findUniqueOrThrow({ where: { id: effect.targetId }, select: youthScopeSelect }), today);
    return youthMutationEnvelope(receipt, unavailable ? null : effect.result, false, unavailable);
  }, { write: true, receiptModel: "YouthMutationReceipt" }).catch(async error => {
    // A name uniqueness failure can precede the receipt insert in a stale SSI
    // snapshot. Recover only a proven same-owner/same-payload commit, never retry
    // arbitrary uniqueness or re-run its effects.
    if (options.operation !== "profile.create" || !youthNameConflict(error)) throw error;
    return withYouthRead(context, async (tx, actor, today, now) => {
      assertYouthPermission(actor, options.permission ?? "canManageYouth");
      const receipt = await tx.youthMutationReceipt.findUnique({ where: { actorId_requestId: { actorId: actor.id, requestId: options.requestId } } });
      const hash = youthPayloadHash({ operation: options.operation, youthId: options.youthId ?? null, targetType: options.targetType, targetId: options.targetId ?? null, payload: options.payload });
      if (!receipt) throw new YouthError("이미 등록된 청소년 이름입니다.", "VALIDATION_ERROR", 400, { name: "이미 등록된 이름입니다." });
      if (receipt.state !== "committed" || receipt.operation !== options.operation || receipt.payloadHash !== hash) throw new YouthError("같은 요청의 내용이 변경되었습니다.", "REQUEST_CONFLICT", 409);
      const parent = receipt.youthId ? await tx.youth.findUnique({ where: { id: receipt.youthId }, select: youthScopeSelect }) : null, unavailable = !parent || isRestrictedYouth(parent, today), result = unavailable ? null : options.replay ? await options.replay(tx, actor, today, now, receipt) : null;
      return youthMutationEnvelope(receipt, result, true, unavailable);
    });
  });
}
