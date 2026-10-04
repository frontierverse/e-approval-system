import { unstable_rethrow } from "next/navigation";
import { YouthPermissionError } from "@/lib/youth-permissions";
import { YouthError } from "@/lib/mobile-youth-core";
import type { YouthActionResult } from "@/lib/youth-management-core";
export type YouthActivityResult<T> = YouthActionResult<T> & { code?: string; status?: number };
export function assertYouthWebActor(actorId: string, expectedActorId?: string) { if (expectedActorId !== undefined && actorId !== expectedActorId) throw new YouthError("로그인 계정이 변경되었습니다. 화면을 다시 열어 주세요.", "UNAUTHORIZED", 401); }
export function youthActivityFailure(error: unknown): { ok: false; error: string; status: number; code: string } {
  unstable_rethrow(error);
  if (error instanceof YouthPermissionError && error.code === "YOUTH_PERMISSION_DENIED") return { ok: false, error: error.message, status: 403, code: "FORBIDDEN" };
  return error instanceof YouthError ? { ok: false, error: error.message, status: error.status, code: error.code } : { ok: false, error: "요청 결과를 확인하지 못했습니다. 입력을 유지하고 같은 요청의 결과를 확인하세요.", status: 503, code: "REQUEST_UNAVAILABLE" };
}
