"use server";
import { requireYouthPermission } from "@/lib/youth-permissions";
import { getYouthMutationStatus } from "@/lib/youth-mobile-mutations";
import { assertYouthWebActor, youthActivityFailure } from "@/lib/youth-activity-web-core";
export async function getYouthActivityReceiptAction(requestId: string, expectedActorId: string) {
  try { const actor = await requireYouthPermission("canManageYouth"); assertYouthWebActor(actor.id, expectedActorId); return { ok: true as const, data: await getYouthMutationStatus({ actorId: actor.id, client: "web" }, requestId) }; } catch (error) { return youthActivityFailure(error); }
}
export async function getYouthPersonalBaselineAction(id: string, expectedActorId: string) {
  try { const actor = await requireYouthPermission("canManageYouth"); assertYouthWebActor(actor.id, expectedActorId); const { getMobilePersonalSchedule } = await import("@/lib/youth-mobile-schedules"); return { ok: true as const, data: await getMobilePersonalSchedule({ actorId: actor.id, client: "web" }, id) }; } catch (error) { return youthActivityFailure(error); }
}
export async function getYouthCommonBaselineAction(expectedActorId: string) {
  try { const actor = await requireYouthPermission("canManageYouth"); assertYouthWebActor(actor.id, expectedActorId); const { withYouthRead, youthPermissions } = await import("@/lib/youth-mobile-context"); return { ok: true as const, data: await withYouthRead({ actorId: actor.id, client: "web" }, async (tx, fresh, today) => ({ today, permissions: youthPermissions(fresh), items: (await tx.youthCommonSchedule.findMany({ orderBy: [{ weekday: "asc" }, { startMinute: "asc" }] })).map(row => ({ ...row, updatedAt: row.updatedAt.toISOString(), createdAt: row.createdAt.toISOString() })) })) }; } catch (error) { return youthActivityFailure(error); }
}
export async function getYouthConceptCheckBaselineAction(youthId: string, conceptId: string, expectedActorId: string) {
  try { const actor = await requireYouthPermission("canManageYouth"); assertYouthWebActor(actor.id, expectedActorId); const { withYouthRead, lockOperationalYouth } = await import("@/lib/youth-mobile-context"); return { ok: true as const, data: await withYouthRead({ actorId: actor.id, client: "web" }, async (tx, _fresh, today) => { const youth = await lockOperationalYouth(tx, youthId, today), concept = await tx.studyConcept.findUnique({ where: { id: conceptId }, select: { id: true, updatedAt: true } }); if (!concept) { const { YouthError } = await import("@/lib/mobile-youth-core"); throw new YouthError("개념을 찾을 수 없습니다.", "NOT_FOUND", 404); } const check = await tx.studyConceptCheck.findUnique({ where: { conceptId_youthId: { conceptId, youthId } }, select: { id: true } }); return { checked: Boolean(check), youthUpdatedAt: youth.updatedAt.toISOString(), conceptUpdatedAt: concept.updatedAt.toISOString() }; }) }; } catch (error) { return youthActivityFailure(error); }
}
