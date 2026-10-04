import type { Prisma } from "@/generated/prisma/client";
import type { YouthProfile } from "@/lib/youth-management-core";

export const youthRetentionPath = "/youth/retention";
export const youthRetentionBasis = "2026년 청소년사업 안내 2권 459쪽(운영자료 5년 이상), 418쪽(상담완료일부터 5년)";
export type YouthRetentionRecord = {
  id: string; name: string; admissionDate: string | null; dischargeDate: string | null;
  actualDischargeDate: string | null; caseClosedDate: string | null;
  retentionUntil: string | null; retentionBasis: string | null; retentionHoldReason: string | null;
  retentionVersion: number; purgeStartedAt: string | null; purgedAt: string | null;
  decisionDocumentCount: number;
  purgeProgress?: YouthPurgeProgress | null;
};
export const youthPurgeBlockedReasons = ["FILE_CLEANUP_PENDING", "WRITE_PENDING", "LIVE_REFERENCE", "LEGACY_WRITER_UNTRACKED", "PURGE_RETRY_REQUIRED"] as const;
export type YouthPurgeBlockedReason = (typeof youthPurgeBlockedReasons)[number];
export type YouthPurgeProgress = { phase: "running" | "waiting-provider" | "retryable" | "completed"; blockedReason: YouthPurgeBlockedReason | null; lastCheckedAt: string | null; nextCheckAt: string | null; leaseUntil: string | null; canRetry: boolean };
export type YouthPurgeResult = { status: "pending" | "complete"; youthId: string; retentionVersion: number; progress: YouthPurgeProgress };
type PurgeProgressRecord = { purgeStartedAt: Date | string | null; purgedAt: Date | string | null; purgeLeaseUntil?: Date | string | null; purgeBlockedReason?: string | null; purgeLastCheckedAt?: Date | string | null; purgeNextCheckAt?: Date | string | null };
const purgeIso = (value: Date | string | null | undefined) => value instanceof Date ? value.toISOString() : value ?? null;
export function getYouthPurgeProgress(record: PurgeProgressRecord, now = new Date()): YouthPurgeProgress | null {
  if (!record.purgeStartedAt && !record.purgedAt) return null;
  const blockedReason = youthPurgeBlockedReasons.find(code => code === record.purgeBlockedReason) ?? null, leaseUntil = purgeIso(record.purgeLeaseUntil);
  const running = !!leaseUntil && new Date(leaseUntil).getTime() > now.getTime(), waiting = blockedReason === "WRITE_PENDING" || blockedReason === "LEGACY_WRITER_UNTRACKED" || blockedReason === "LIVE_REFERENCE";
  return { phase: record.purgedAt ? "completed" : running ? "running" : waiting ? "waiting-provider" : "retryable", blockedReason: record.purgedAt ? null : blockedReason, lastCheckedAt: purgeIso(record.purgeLastCheckedAt), nextCheckAt: record.purgedAt ? null : purgeIso(record.purgeNextCheckAt), leaseUntil: record.purgedAt ? null : leaseUntil, canRetry: !record.purgedAt && !running && !waiting && (!record.purgeNextCheckAt || new Date(record.purgeNextCheckAt).getTime() <= now.getTime()) };
}

export type YouthRetentionState = "pending" | "aftercare" | "retained" | "due" | "held" | "purging" | "purged";
export type RetentionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };
export type RetentionInput = { actualDischargeDate: string; caseClosedDate: string; holdReason: string; version: number; correctedDischargeDate?: string };
export type YouthRetentionDetail = YouthProfile & { retainedReports: Array<{ workDate: string; authorName: string; content: string }> };

export function isRetentionDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

// Calendar years, including February 29 -> February 28 in a non-leap year.
export function getYouthRetentionUntil(closedDate: string) {
  if (!isRetentionDate(closedDate)) throw new Error("상담·사후관리 완료일을 확인하세요.");
  const [year, month, day] = closedDate.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year + 5, month, 0)).getUTCDate();
  return `${year + 5}-${String(month).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

export function getYouthRetentionState(record: Pick<YouthRetentionRecord, "actualDischargeDate" | "caseClosedDate" | "retentionUntil" | "retentionHoldReason" | "purgeStartedAt" | "purgedAt">, today: string): YouthRetentionState {
  if (record.purgedAt) return "purged";
  if (record.purgeStartedAt) return "purging";
  if (!record.actualDischargeDate) return "pending";
  if (record.retentionHoldReason) return "held";
  if (!record.caseClosedDate || !record.retentionUntil) return "aftercare";
  return record.retentionUntil < today ? "due" : "retained";
}

export const youthRetentionStateLabels: Record<YouthRetentionState, string> = {
  pending: "퇴소 확인 필요", aftercare: "사후관리 중", retained: "보존 중", due: "파기 검토", held: "보존 보류", purging: "파기 처리 대기", purged: "파기 완료",
};

export function youthOperationalWhere(today: string): Prisma.YouthWhereInput {
  return { actualDischargeDate: null, purgeStartedAt: null, purgedAt: null,
    OR: [{ dischargeDate: null }, { dischargeDate: "" }, { dischargeDate: { gte: today } }],
  };
}

export function isRestrictedYouth(record: { actualDischargeDate?: string | null; dischargeDate?: string | null; purgeStartedAt?: Date | string | null; purgedAt?: Date | string | null }, today: string) {
  return Boolean(record.actualDischargeDate || record.purgeStartedAt || record.purgedAt || (record.dischargeDate && record.dischargeDate < today));
}

export function validateRetentionInput(input: RetentionInput, record: Pick<YouthRetentionRecord, "admissionDate" | "actualDischargeDate" | "caseClosedDate">, today: string) {
  if (!Number.isSafeInteger(input.version) || input.version < 0) return "기록 버전을 확인하세요.";
  if (input.correctedDischargeDate !== undefined) {
    if (record.actualDischargeDate || input.actualDischargeDate || input.caseClosedDate) return "퇴소가 확정되지 않은 기록의 예정일만 정정할 수 있습니다.";
    if (!isRetentionDate(input.correctedDischargeDate) || input.correctedDischargeDate < today || (record.admissionDate && input.correctedDischargeDate < record.admissionDate)) return "입소 유지 시 퇴소 예정일은 오늘 이후의 유효한 날짜여야 합니다.";
    return null;
  }
  if (!isRetentionDate(input.actualDischargeDate) || input.actualDischargeDate > today) return "실제 퇴소일은 오늘까지의 유효한 날짜여야 합니다.";
  if (record.admissionDate && input.actualDischargeDate < record.admissionDate) return "실제 퇴소일은 입소일보다 빠를 수 없습니다.";
  if (record.actualDischargeDate && record.actualDischargeDate !== input.actualDischargeDate) return "확정된 실제 퇴소일은 변경할 수 없습니다.";
  if (input.caseClosedDate && (!isRetentionDate(input.caseClosedDate) || input.caseClosedDate < input.actualDischargeDate || input.caseClosedDate > today)) return "상담·사후관리 완료일은 실제 퇴소일부터 오늘 사이여야 합니다.";
  // Never allow an edit to shorten an established retention period.
  if (record.caseClosedDate && (!input.caseClosedDate || input.caseClosedDate < record.caseClosedDate)) return "이미 등록한 완료일을 앞당기거나 지울 수 없습니다.";
  if (typeof input.holdReason !== "string" || input.holdReason.trim().length > 500) return "보존 보류 사유는 500자 이내로 입력하세요.";
  return null;
}
