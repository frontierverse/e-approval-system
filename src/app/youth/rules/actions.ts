"use server";
import { assertYouthWebActor, youthActivityFailure, type YouthActivityResult } from "@/lib/youth-activity-web-core";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentAuditLogRequestData } from "@/lib/audit-log-request";
import {
  requireYouthBasicAccess,
  requireYouthPermission,
} from "@/lib/youth-permissions";
import {
  getYouthRuleChangeLogs,
  getYouthRules,
  type YouthRuleChangeLogsResult,
  type YouthRulesResult,
} from "@/lib/youth-rules";
import {
  type YouthRuleCategoryFilter,
  type YouthRuleTargetFilter,
} from "@/lib/youth-management-core";

import { YouthError } from "@/lib/mobile-youth-core";
import { createMobileYouthRule, deleteMobileYouthRule } from "@/lib/youth-mobile-rules";
import { withYouthRead } from "@/lib/youth-mobile-context";
const youthRulesPath = "/youth/rules";

export async function getYouthRulesAction({
  category,
  page,
  target,
}: {
  category: YouthRuleCategoryFilter;
  page: number;
  target: YouthRuleTargetFilter;
}): Promise<YouthActivityResult<{ ruleResult: YouthRulesResult }>> {
  await requireYouthBasicAccess();
  const ruleResult = await getYouthRules({
    category,
    page,
    target,
  });

  return {
    ok: true,
    data: {
      ruleResult,
    },
  };
}

export async function getYouthRuleChangeLogsAction({
  actorId,
  category,
  page,
  target,
}: {
  actorId: string;
  category: YouthRuleCategoryFilter;
  page: number;
  target: YouthRuleTargetFilter;
}): Promise<YouthActivityResult<{ changeLogResult: YouthRuleChangeLogsResult }>> {
  await requireYouthBasicAccess();
  const changeLogResult = await getYouthRuleChangeLogs({
    actorId,
    category,
    page,
    target,
  });

  return {
    ok: true,
    data: {
      changeLogResult,
    },
  };
}

export async function createYouthRuleAction(formData: FormData) {
  const user = await requireYouthPermission("canManageYouth");
  try {
    assertYouthWebActor(user.id, typeof formData.get("expectedActorId") === "string" ? String(formData.get("expectedActorId")) : undefined);
    await createMobileYouthRule({ actorId: user.id, requestData: await getCurrentAuditLogRequestData(), client: "web" }, { requestId: typeof formData.get("requestId") === "string" && formData.get("requestId") ? formData.get("requestId") : randomUUID(), category: String(formData.get("category") ?? "").trim(), detail: String(formData.get("detail") ?? "").trim(), targetYouthId: String(formData.get("targetYouthId") ?? "").trim() || null });
  } catch (error) { redirectWithRuleError(error instanceof YouthError ? error.message : "규칙을 저장하지 못했습니다."); }
  revalidatePath(youthRulesPath); redirect(youthRulesPath);
}
export async function deleteYouthRuleAction(ruleId: string, baseline?: { requestId?: string; expectedActorId?: string; targetYouthId: string | null; expectedUpdatedAt: string }) {
  const user = await requireYouthPermission("canManageYouth"), ctx = { actorId: user.id, requestData: await getCurrentAuditLogRequestData(), client: "web" as const };
  try {
    assertYouthWebActor(user.id, baseline?.expectedActorId);
    const targetYouthId = baseline ? baseline.targetYouthId : await withYouthRead(ctx, async tx => { const row = await tx.youthRule.findUnique({ where: { id: ruleId }, select: { targetYouthId: true } }); if (!row) throw new YouthError("삭제할 규칙을 찾을 수 없습니다.", "NOT_FOUND", 404); return row.targetYouthId; });
    await deleteMobileYouthRule(ctx, ruleId, { requestId: baseline?.requestId ?? randomUUID(), targetYouthId, ...(baseline ? { expectedUpdatedAt: baseline.expectedUpdatedAt } : {}) }, !baseline);
  } catch (error) { redirectWithRuleError(error instanceof YouthError ? error.message : "규칙을 삭제하지 못했습니다."); }
  revalidatePath(youthRulesPath); redirect(youthRulesPath);
}
function redirectWithRuleError(message: string): never { redirect(`${youthRulesPath}?ruleError=${encodeURIComponent(message)}`); }
export async function createYouthRuleClientAction(input: { targetYouthId: string | null; category: string; detail: string }, requestId: string, expectedActorId: string) {
  try { const actor = await requireYouthPermission("canManageYouth"); assertYouthWebActor(actor.id, expectedActorId); const result = await createMobileYouthRule({ actorId: actor.id, requestData: await getCurrentAuditLogRequestData(), client: "web" }, { ...input, requestId }); revalidatePath(youthRulesPath); return { ok: true as const, data: result }; } catch (error) { return youthActivityFailure(error); }
}
export async function deleteYouthRuleClientAction(ruleId: string, baseline: { requestId: string; targetYouthId: string | null; expectedUpdatedAt: string; expectedActorId: string }) {
  try { const actor = await requireYouthPermission("canManageYouth"); assertYouthWebActor(actor.id, baseline.expectedActorId); const result = await deleteMobileYouthRule({ actorId: actor.id, requestData: await getCurrentAuditLogRequestData(), client: "web" }, ruleId, { requestId: baseline.requestId, expectedUpdatedAt: baseline.expectedUpdatedAt, targetYouthId: baseline.targetYouthId }); revalidatePath(youthRulesPath); return { ok: true as const, data: result }; } catch (error) { return youthActivityFailure(error); }
}
