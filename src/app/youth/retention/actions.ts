"use server";

import { unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma } from "@/generated/prisma/client";
import { requireAdmin } from "@/lib/auth";
import { YouthPurgeError } from "@/lib/youth-purge";
import { getYouthRetentionRecords, purgeYouthRecord, readRetainedYouth, saveYouthRetention, type YouthPurgeInput } from "@/lib/youth-retention";
import type { RetentionInput, RetentionResult, YouthPurgeResult } from "@/lib/youth-retention-core";

function refreshYouthPages() {
  try { revalidatePath("/", "layout"); } catch { console.error("Youth page cache refresh remains pending"); }
}
function failure(error: unknown): { ok: false; error: string } {
  unstable_rethrow(error);
  if (error instanceof Prisma.PrismaClientKnownRequestError) return { ok: false, error: "기록을 처리하지 못했습니다. 변경 여부를 새로고침하여 확인한 뒤 다시 시도하세요." };
  return { ok: false, error: error instanceof Error ? error.message : "기록을 처리하지 못했습니다." };
}
function purgeFailure(error: unknown): { ok: false; error: string } {
  unstable_rethrow(error);
  return { ok: false, error: error instanceof YouthPurgeError ? error.message : "파기 상태를 확인하지 못했습니다. 상태를 새로고침하여 요청 접수 여부를 확인하세요." };
}
export async function saveYouthRetentionAction(youthId: string, input: RetentionInput): Promise<RetentionResult<Awaited<ReturnType<typeof getYouthRetentionRecords>>>> {
  await requireAdmin();
  try { await saveYouthRetention(youthId, input); refreshYouthPages(); return { ok: true, data: await getYouthRetentionRecords() }; } catch (error) { return failure(error); }
}
export async function readRetainedYouthAction(youthId: string, reason: string): Promise<RetentionResult<Awaited<ReturnType<typeof readRetainedYouth>>>> {
  await requireAdmin();
  try { return { ok: true, data: await readRetainedYouth(youthId, reason) }; } catch (error) { return failure(error); }
}
export async function purgeYouthRecordAction(youthId: string, input: YouthPurgeInput): Promise<RetentionResult<Awaited<ReturnType<typeof getYouthRetentionRecords>>> & { purgeOutcome?: YouthPurgeResult }> {
  await requireAdmin();
  try { const purgeOutcome = await purgeYouthRecord(youthId, input); refreshYouthPages(); return { ok: true, data: await getYouthRetentionRecords(), purgeOutcome }; } catch (error) { refreshYouthPages(); return purgeFailure(error); }
}

/** Status refresh does not resume purge or dispatch file cleanup. */
export async function getYouthRetentionRecordsAction(): Promise<RetentionResult<Awaited<ReturnType<typeof getYouthRetentionRecords>>>> {
  await requireAdmin();
  try { return { ok: true, data: await getYouthRetentionRecords() }; } catch (error) { unstable_rethrow(error); return { ok: false, error: "상태를 확인하지 못했습니다. 잠시 후 다시 새로고침하세요." }; }
}
