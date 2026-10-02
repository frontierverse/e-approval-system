"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { requireAdmin } from "@/lib/auth";
import { getYouthRetentionRecords, purgeYouthRecord, readRetainedYouth, saveYouthRetention, type YouthPurgeInput } from "@/lib/youth-retention";
import type { RetentionInput, RetentionResult } from "@/lib/youth-retention-core";

function refreshYouthPages() {
  revalidatePath("/", "layout");
}
function failure(error: unknown): { ok: false; error: string } {
  if (error instanceof Prisma.PrismaClientKnownRequestError) return { ok: false, error: "기록을 처리하지 못했습니다. 변경 여부를 새로고침하여 확인한 뒤 다시 시도하세요." };
  return { ok: false, error: error instanceof Error ? error.message : "기록을 처리하지 못했습니다." };
}
export async function saveYouthRetentionAction(youthId: string, input: RetentionInput): Promise<RetentionResult<Awaited<ReturnType<typeof getYouthRetentionRecords>>>> {
  await requireAdmin();
  try { await saveYouthRetention(youthId, input); refreshYouthPages(); return { ok: true, data: await getYouthRetentionRecords() }; } catch (error) { return failure(error); }
}
export async function readRetainedYouthAction(youthId: string, reason: string): Promise<RetentionResult<Awaited<ReturnType<typeof readRetainedYouth>>>> {
  await requireAdmin();
  try { return { ok: true, data: await readRetainedYouth(youthId, reason) }; } catch (error) { return failure(error); }
}
export async function purgeYouthRecordAction(youthId: string, input: YouthPurgeInput): Promise<RetentionResult<Awaited<ReturnType<typeof getYouthRetentionRecords>>>> {
  await requireAdmin();
  try { await purgeYouthRecord(youthId, input); refreshYouthPages(); return { ok: true, data: await getYouthRetentionRecords() }; } catch (error) { refreshYouthPages(); return failure(error); }
}
