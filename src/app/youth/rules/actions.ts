"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AuditAction } from "@/generated/prisma/client";
import { getCurrentAuditLogRequestData } from "@/lib/audit-log-request";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  isYouthRuleCategory,
  youthRuleDetailMaxLength,
} from "@/lib/youth-management-core";

const youthRulesPath = "/youth/rules";

export async function createYouthRuleAction(formData: FormData) {
  const user = await requireUser();
  const category = String(formData.get("category") ?? "").trim();
  const detail = String(formData.get("detail") ?? "").trim();
  const targetYouthIdValue = String(formData.get("targetYouthId") ?? "").trim();

  if (!isYouthRuleCategory(category)) {
    redirectWithRuleError("규칙 카테고리를 선택하세요.");
  }

  if (!detail) {
    redirectWithRuleError("세부사항을 입력하세요.");
  }

  if (detail.length > youthRuleDetailMaxLength) {
    redirectWithRuleError(
      `세부사항은 ${youthRuleDetailMaxLength}자 이내로 입력하세요.`,
    );
  }

  const targetYouth = targetYouthIdValue
    ? await prisma.youth.findUnique({
        where: {
          id: targetYouthIdValue,
        },
        select: {
          id: true,
          name: true,
        },
      })
    : null;

  if (targetYouthIdValue && !targetYouth) {
    redirectWithRuleError("적용 대상을 다시 선택하세요.");
  }

  const auditRequestData = await getCurrentAuditLogRequestData();
  const ruleId = `youth-rule-${randomUUID()}`;
  const targetYouthId = targetYouth?.id ?? null;
  const targetLabel = targetYouth?.name ?? "공통";

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      INSERT INTO "YouthRule" (
        "id",
        "category",
        "detail",
        "targetYouthId",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        ${ruleId},
        ${category},
        ${detail},
        ${targetYouthId},
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
    `;

    await tx.auditLog.create({
      data: {
        actorId: user.id,
        ...auditRequestData,
        action: AuditAction.UPDATE_YOUTH,
        targetType: "YouthRule",
        targetId: ruleId,
        message: `${targetLabel} 대상 ${category} 규칙을 생성했습니다.`,
        metadata: {
          category,
          source: "youth-rules",
          targetYouthId,
          targetYouthName: targetYouth?.name ?? null,
        },
      },
    });
  });

  revalidatePath(youthRulesPath);
  redirect(youthRulesPath);
}

export async function deleteYouthRuleAction(ruleId: string) {
  const user = await requireUser();
  const auditRequestData = await getCurrentAuditLogRequestData();
  const deletedRules = await prisma.$transaction(async (tx) => {
    const rules = await tx.$queryRaw<
      Array<{
        id: string;
        category: string;
        detail: string;
        targetYouthId: string | null;
        targetYouthName: string | null;
      }>
    >`
      WITH deleted_rule AS (
        DELETE FROM "YouthRule"
        WHERE "id" = ${ruleId}
        RETURNING "id", "category", "detail", "targetYouthId"
      )
      SELECT
        deleted_rule."id",
        deleted_rule."category",
        deleted_rule."detail",
        deleted_rule."targetYouthId",
        youth."name" AS "targetYouthName"
      FROM deleted_rule
      LEFT JOIN "Youth" youth ON youth."id" = deleted_rule."targetYouthId"
    `;

    const deletedRule = rules[0];

    if (!deletedRule) {
      return [];
    }

    await tx.auditLog.create({
      data: {
        actorId: user.id,
        ...auditRequestData,
        action: AuditAction.UPDATE_YOUTH,
        targetType: "YouthRule",
        targetId: deletedRule.id,
        message: `${deletedRule.targetYouthName ?? "공통"} 대상 ${
          deletedRule.category
        } 규칙을 삭제했습니다.`,
        metadata: {
          category: deletedRule.category,
          source: "youth-rules",
          targetYouthId: deletedRule.targetYouthId,
          targetYouthName: deletedRule.targetYouthName,
        },
      },
    });

    return rules;
  });

  if (deletedRules.length === 0) {
    redirectWithRuleError("삭제할 규칙을 찾을 수 없습니다.");
  }

  revalidatePath(youthRulesPath);
  redirect(youthRulesPath);
}

function redirectWithRuleError(message: string): never {
  redirect(`${youthRulesPath}?ruleError=${encodeURIComponent(message)}`);
}
