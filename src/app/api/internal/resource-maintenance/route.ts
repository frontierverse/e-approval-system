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
  const deadline = Date.now() + 45000;
  let checked = 0, completed = 0;
  try {
    // Load the DB/storage maintenance domain only after exact cron authentication.
    const { reconcileResourceLibraryMaintenance } = await import("@/lib/resource-file-cleanup");
    for (let batch = 0; batch < 4; batch++) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error("MAINTENANCE_DEADLINE");
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("MAINTENANCE_DEADLINE")), remaining); });
      const result = await Promise.race([reconcileResourceLibraryMaintenance({}, { limit: 10, budgetMs: Math.min(10000, remaining) }), timeout]).finally(() => clearTimeout(timer));
      checked += result.checked; completed += result.completed;
      if (result.checked === 0 && (result.expired ?? 0) === 0) break;
    }
    return json({ ok: true, checked, completed });
  } catch { return json({ error: "파일 정리 작업을 완료하지 못했습니다. 다음 실행에서 다시 확인합니다.", code: "MAINTENANCE_FAILED" }, 500); }
}
