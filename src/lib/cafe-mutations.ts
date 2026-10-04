import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { AuditAction, Prisma, type CafeMutationReceipt } from "@/generated/prisma/client";
import { cafeTransaction, lockCafeRequest, type CafeContext } from "@/lib/cafe-context";
import { CafeError, cafeId } from "@/lib/mobile-cafe-core";
import { normalizeCafeCommand, type CafeCommand, type CafeOperation, type CafeMutationResult } from "@/lib/cafe-mutations-core";
import { cafeItemSelect, cafeNoteSelect, mapCafeDetail, mapCafeNote, type CafeItemRecord } from "@/lib/cafe-queries";
import { formatCafeItemDateValue, getCafeItemCategoryLabel, getCafeItemUsageDday } from "@/lib/cafe-items-core";
import { parseGregorianDate } from "@/lib/gregorian-date";
const messages: Record<CafeOperation, string> = { "item.create": "물품을 등록했습니다.", "item.update": "물품 정보를 수정했습니다.", "item.delete": "물품을 삭제했습니다.", "item.hold": "유통기한 경과 물품을 보류했습니다.", "note.create": "준수사항을 등록했습니다.", "note.delete": "준수사항을 삭제했습니다." };
function snapshot(item: CafeItemRecord) { return { category: item.category, categoryLabel: getCafeItemCategoryLabel(item.category), expirationDate: item.expirationDate ? formatCafeItemDateValue(item.expirationDate) : null, expirationHoldReason: item.expirationHoldReason, name: item.name, priceWon: item.priceWon, purchaseReason: item.purchaseReason, purchasedAt: formatCafeItemDateValue(item.purchasedAt) }; }
function itemData(input: Extract<CafeCommand, { operation: "item.create" }>['input']) { return { ...input, purchaseReason: input.purchaseReason || null, purchasedAt: parseGregorianDate(input.purchasedAt), expirationDate: input.expirationDate ? parseGregorianDate(input.expirationDate) : null }; }
async function project(tx: Prisma.TransactionClient, today: string, receipt: CafeMutationReceipt, replayed: boolean, message?: string): Promise<CafeMutationResult> {
  const operation = receipt.operation as CafeOperation;
  if (!Object.hasOwn(messages, operation) || receipt.targetType !== (operation.startsWith("item.") ? "CafeItem" : "CafeComplianceNote")) throw new CafeError("요청 결과를 확인하지 못했습니다.", "INTERNAL_ERROR", 500);
  let result: CafeMutationResult['result'] = null;
  if (!operation.endsWith(".delete")) {
    if (receipt.targetType === "CafeItem") { const row = await tx.cafeItem.findUnique({ where: { id: receipt.targetId }, select: cafeItemSelect }); if (row) result = mapCafeDetail(row, today); }
    else { const row = await tx.cafeComplianceNote.findUnique({ where: { id: receipt.targetId }, select: cafeNoteSelect }); if (row) result = mapCafeNote(row); }
  }
  return { ok: true, message: message ?? messages[operation], replayed, requestId: receipt.requestId, operation, targetType: receipt.targetType as CafeMutationResult['targetType'], targetId: receipt.targetId, outcome: result ? "present" : "deleted", committedAt: receipt.committedAt.toISOString(), committedUpdatedAt: receipt.committedUpdatedAt?.toISOString() ?? null, result };
}
export async function getCafeMutationStatus(context: CafeContext, requestId: string): Promise<CafeMutationResult> {
  return cafeTransaction(context, async (tx, today) => { const receipt = await tx.cafeMutationReceipt.findUnique({ where: { actorId_requestId: { actorId: context.actorId, requestId: cafeId(requestId, true) } } }); if (!receipt) throw new CafeError("기록된 요청을 찾을 수 없습니다.", "NOT_FOUND", 404); return project(tx, today, receipt, true); });
}
export async function mutateCafe(context: CafeContext, rawCommand: CafeCommand): Promise<CafeMutationResult> {
  const command = normalizeCafeCommand(rawCommand), { requestId, ...canonical } = command, hash = createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
  const outcome = await cafeTransaction(context, async (tx, today, now) => {
    await lockCafeRequest(tx, context.actorId, requestId);
    const existing = await tx.cafeMutationReceipt.findUnique({ where: { actorId_requestId: { actorId: context.actorId, requestId } } });
    if (existing) {
      if (existing.payloadHash !== hash || existing.operation !== command.operation || "targetId" in command && existing.targetId !== command.targetId) throw new CafeError("같은 요청 번호로 다른 변경을 보낼 수 없습니다. 기존 요청 결과를 확인해 주세요.", "REQUEST_CONFLICT", 409);
      return project(tx, today, existing, true);
    }
    const targetType = command.operation.startsWith("item.") ? "CafeItem" : "CafeComplianceNote";
    let targetId = "targetId" in command ? command.targetId : randomUUID(), committedUpdatedAt: Date | null = null, message = messages[command.operation];
    if (command.operation === "note.create") {
      const row = await tx.cafeComplianceNote.create({ data: { id: targetId, content: command.content, createdById: context.actorId, createdAt: now, updatedAt: now }, select: cafeNoteSelect }); committedUpdatedAt = row.updatedAt;
    } else if (command.operation === "note.delete") {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "CafeComplianceNote" WHERE "id" = ${targetId} FOR UPDATE`);
      const row = await tx.cafeComplianceNote.findUnique({ where: { id: targetId }, select: { id: true, updatedAt: true } });
      if (row) { if (row.updatedAt.toISOString() !== command.expectedUpdatedAt) throw new CafeError("준수사항이 변경되었습니다. 최신 내용을 확인한 뒤 다시 삭제해 주세요.", "NOTE_CONFLICT", 409); const deleted = await tx.cafeComplianceNote.deleteMany({ where: { id: targetId, updatedAt: row.updatedAt } }); if (deleted.count !== 1) throw new CafeError("준수사항이 변경되었습니다.", "NOTE_CONFLICT", 409); }
    } else {
      let previous: CafeItemRecord | null = null, next: CafeItemRecord | null = null;
      if (command.operation !== "item.create") {
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "CafeItem" WHERE "id" = ${targetId} FOR UPDATE`);
        previous = await tx.cafeItem.findUnique({ where: { id: targetId }, select: cafeItemSelect });
        if (!previous && command.operation !== "item.delete") throw new CafeError(command.operation === "item.hold" ? "보류 처리할 물품을 찾을 수 없습니다." : "수정할 물품을 찾을 수 없습니다.", "NOT_FOUND", 404);
        if (previous && previous.updatedAt.toISOString() !== command.expectedUpdatedAt) throw new CafeError("물품이 변경되었습니다. 입력을 보관하고 최신 내용을 확인해 주세요.", "ITEM_CONFLICT", 409);
      }
      if (command.operation === "item.create") next = await tx.cafeItem.create({ data: { id: targetId, ...itemData(command.input), createdAt: now, updatedAt: now }, select: cafeItemSelect });
      else if (command.operation === "item.delete") { if (previous) { const removed = await tx.cafeItem.deleteMany({ where: { id: targetId, updatedAt: previous.updatedAt } }); if (removed.count !== 1) throw new CafeError("물품이 변경되었습니다.", "ITEM_CONFLICT", 409); } }
      else {
        const item = previous!, timestamp = new Date(Math.max(now.getTime(), item.updatedAt.getTime() + 1));
        let data: Prisma.CafeItemUpdateManyMutationInput;
        if (command.operation === "item.hold") {
          if (item.category !== "food" || !item.expirationDate || formatCafeItemDateValue(item.expirationDate) >= today) throw new CafeError("유통기한이 지난 식품만 보류 처리할 수 있습니다.", "VALIDATION_ERROR", 400, { reason: "유통기한이 지난 식품만 보류 처리할 수 있습니다." });
          message = item.expirationHoldReason ? "보류 사유를 수정했습니다." : messages[command.operation];
          data = { expirationHoldReason: command.reason, updatedAt: timestamp };
        } else {
          const input = command.input, keepHold = input.category === "food" && input.expirationDate !== null && getCafeItemUsageDday({ category: input.category, expirationDate: input.expirationDate, purchasedAt: input.purchasedAt }, today).status === "expired";
          data = { ...itemData(input), expirationHoldReason: keepHold ? item.expirationHoldReason : null, updatedAt: timestamp };
        }
        const changed = await tx.cafeItem.updateMany({ where: { id: targetId, updatedAt: item.updatedAt }, data });
        if (changed.count !== 1) throw new CafeError("물품이 변경되었습니다.", "ITEM_CONFLICT", 409);
        next = await tx.cafeItem.findUnique({ where: { id: targetId }, select: cafeItemSelect }); if (!next) throw new CafeError("변경 결과를 확인하지 못했습니다.", "INTERNAL_ERROR", 500);
      }
      const item = next ?? previous;
      if (item) {
        targetId = item.id; committedUpdatedAt = next?.updatedAt ?? null;
        const changeType = command.operation.slice(5), auditMessage = command.operation === "item.create" ? `${item.name} 물품을 등록했습니다.` : command.operation === "item.update" ? `${item.name} 물품 정보를 수정했습니다.` : command.operation === "item.delete" ? `${item.name} 물품을 삭제했습니다.` : previous?.expirationHoldReason ? `${item.name} 물품의 보류 사유를 수정했습니다. 사유: ${command.operation === "item.hold" ? command.reason : ""}` : `${item.name} 유통기한 경과 물품을 보류했습니다. 사유: ${command.operation === "item.hold" ? command.reason : ""}`;
        await tx.auditLog.create({ data: { actorId: context.actorId, ...context.requestData, action: AuditAction.UPDATE_CAFE_ITEM, targetType: "CafeItem", targetId: item.id, message: auditMessage, metadata: { changeType: `cafeItem.${changeType}`, itemId: item.id, itemName: item.name, next: next ? snapshot(next) : null, nextName: next?.name ?? null, previous: previous ? snapshot(previous) : null, previousName: previous?.name ?? null, source: "cafe-item" } } });
      }
    }
    const receipt = await tx.cafeMutationReceipt.create({ data: { id: randomUUID(), actorId: context.actorId, requestId, operation: command.operation, targetType, targetId, payloadHash: hash, committedUpdatedAt, committedAt: now } });
    return project(tx, today, receipt, false, message);
  }, true);
  // Cache refresh is outside the committed transaction and cannot reverse its evidence.
  try { revalidatePath("/work-schedule/cafe"); } catch { /* A later fresh query resolves the committed result. */ }
  return outcome;
}
