import { timingSafeEqual } from "node:crypto";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const headers = { "Cache-Control": "private, no-store", Pragma: "no-cache", Vary: "Authorization", "X-Content-Type-Options": "nosniff" };
function json(data: unknown, status = 200) { return Response.json(data, { status, headers }); }
function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16 || /[\x00-\x1f\x7f]/.test(secret)) return false;
  const actual = Buffer.from(request.headers.get("authorization") ?? ""), expected = Buffer.from(`Bearer ${secret}`);
  return actual.byteLength === expected.byteLength && timingSafeEqual(actual, expected);
}
export async function GET(request: Request) {
  if (!authorized(request)) return json({ error: "인증이 필요합니다.", code: "UNAUTHORIZED" }, 401);
  try {
    // Authentication stays before the dispatcher and every DB/storage domain import.
    const { runInternalFileMaintenance } = await import("@/lib/internal-file-maintenance");
    const result = await runInternalFileMaintenance({ signal: request.signal });
    if (!result.ok) return json({ ...result, error: "파일 정리 작업을 완료하지 못했습니다. 다음 실행에서 다시 확인합니다.", code: "MAINTENANCE_FAILED" }, 500);
    return json(result);
  } catch { return json({ error: "파일 정리 작업을 완료하지 못했습니다. 다음 실행에서 다시 확인합니다.", code: "MAINTENANCE_FAILED" }, 500); }
}
