import type { YouthActionResult } from "@/lib/youth-management-core";
export type ActivityReceipt = { ok: true; requestId: string; operation: string; targetId: string; outcome: string };
export type ActivityAttempt<P> = { requestId: string; operation: string; payload: P; unknown: boolean; conflict: boolean; busy: boolean; valid: boolean };
export function newYouthActivityAttempt<P>(operation: string, payload: P): ActivityAttempt<P> { return { requestId: crypto.randomUUID(), operation, payload: structuredClone(payload), unknown: false, conflict: false, busy: false, valid: true }; }
export const activityUnknown = (result: { status?: number }) => result.status === undefined || result.status === 0 || result.status === 408 || result.status >= 500 || result.status >= 200 && result.status < 300;
export const invalidateYouthActivity = (attempt: ActivityAttempt<unknown> | null) => { if (attempt) attempt.valid = false; };
export async function runYouthActivity<P, T>(attempt: ActivityAttempt<P>, dispatch: (frozen: P, requestId: string) => Promise<YouthActionResult<T> & { status?: number; code?: string }>, receipt: (requestId: string) => Promise<YouthActionResult<ActivityReceipt> & { status?: number }>, timeoutMs = 30000): Promise<{ kind: "result"; result: YouthActionResult<T> & { status?: number; code?: string } } | { kind: "committed"; receipt: ActivityReceipt } | { kind: "blocked" }> {
  if (!attempt.valid || attempt.busy || attempt.conflict) return { kind: "blocked" };
  attempt.busy = true;
  let expired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const work = async () => {
      if (attempt.unknown) {
        const status = await receipt(attempt.requestId);
        if (!attempt.valid || expired) return { kind: "blocked" as const };
        if (status.ok) {
          if (!status.data || status.data.ok !== true || status.data.requestId !== attempt.requestId || status.data.operation !== attempt.operation || typeof status.data.targetId !== "string" || !status.data.targetId || !["present", "unavailable", "deleted"].includes(status.data.outcome)) throw Error("Invalid receipt");
          attempt.unknown = false; return { kind: "committed" as const, receipt: status.data };
        }
        if (status.status !== 404) return { kind: "result" as const, result: status as YouthActionResult<T> & { status?: number } };
      }
      if (!attempt.valid || expired) return { kind: "blocked" as const };
      const result = await dispatch(attempt.payload, attempt.requestId);
      if (!attempt.valid || expired) return { kind: "blocked" as const };
      if (!result || typeof result !== "object" || typeof result.ok !== "boolean" || result.ok && (!result.data || typeof result.data !== "object")) throw Error("Invalid result");
      if (!result.ok) { attempt.unknown = activityUnknown(result); attempt.conflict = result.status === 409; }
      else attempt.unknown = false;
      return { kind: "result" as const, result };
    };
    return await Promise.race([work(), new Promise<never>((_, reject) => { timer = setTimeout(() => { expired = true; reject(Error("Deadline")); }, timeoutMs); })]);
  } catch { if (!attempt.valid) return { kind: "blocked" }; attempt.unknown = true; return { kind: "result", result: { ok: false, status: 503, code: "REQUEST_UNAVAILABLE", error: "저장 결과를 확인하지 못했습니다. 입력을 유지하고 같은 요청의 결과를 확인하세요." } }; }
  finally { if (timer) clearTimeout(timer); attempt.busy = false; }
}
