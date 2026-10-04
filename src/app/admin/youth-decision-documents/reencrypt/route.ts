import { getCurrentUser } from "@/lib/auth";
import { getCurrentAuditLogRequestData } from "@/lib/audit-log-request";
import { YouthError, readYouthJson, youthObject, youthId } from "@/lib/mobile-youth-core";
import { youthTransaction } from "@/lib/youth-mobile-context";
import { reencryptYouthDecisionDocuments } from "@/lib/youth-decision-reencrypt";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const headers = { "Cache-Control": "private, no-store", Pragma: "no-cache", Vary: "Cookie, Authorization", "X-Content-Type-Options": "nosniff" };
// Bounded admin migration. Pass returned nextCursor as afterId for the next batch.
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "인증이 필요합니다.", code: "UNAUTHORIZED" }, { status: 401, headers });
  const context = { actorId: user.id, client: "web" as const, requestData: await getCurrentAuditLogRequestData() };
  try {
    await youthTransaction(context, async (_tx, actor) => { if (actor.role !== "ADMIN") throw new YouthError("관리자만 재암호화할 수 있습니다.", "FORBIDDEN", 403); });
    let input: { afterId?: string } = {};
    if (request.body) { const raw = youthObject(await readYouthJson(request, 4096), [], ["afterId"]); if (raw.afterId !== undefined) input = { afterId: youthId(raw.afterId) }; }
    return Response.json(await reencryptYouthDecisionDocuments(context, input), { headers });
  } catch (error) { return Response.json({ error: error instanceof YouthError ? error.message : "재암호화를 완료하지 못했습니다.", code: error instanceof YouthError ? error.code : "REENCRYPT_FAILED" }, { status: error instanceof YouthError ? error.status : 503, headers }); }
}
