import { randomUUID } from "node:crypto";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentAuditLogRequestData } from "@/lib/audit-log-request";
import { YouthError, youthId } from "@/lib/mobile-youth-core";
import { youthTransaction, assertYouthPermission } from "@/lib/youth-mobile-context";
import { parseYouthDecisionDownload, youthDecisionDisposition } from "@/lib/youth-decision-file-core";
import { downloadYouthDecisionDocument, recordYouthDecisionDownloadFailure } from "@/lib/youth-decision-documents";
import { resourceSafeMimeType } from "@/lib/resource-file-storage-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const privateHeaders = { "Cache-Control": "private, no-store", Pragma: "no-cache", Vary: "Cookie, Authorization", "X-Content-Type-Options": "nosniff" };
async function boundedForm(request: Request) {
  const mime = request.headers.get("content-type") ?? "";
  if (!/^(application\/x-www-form-urlencoded|multipart\/form-data)(;|$)/i.test(mime) || !request.body) throw new YouthError();
  const reader = request.body.getReader(), signal = AbortSignal.timeout(5000); let size = 0; const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const part = await new Promise<ReadableStreamReadResult<Uint8Array>>((resolve, reject) => {
        const abort = () => reject(new YouthError("요청을 읽지 못했습니다.", "INVALID_REQUEST", 400));
        signal.addEventListener("abort", abort, { once: true }); if (signal.aborted) { abort(); return; }
        reader.read().then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
      });
      if (part.done) break; size += part.value.byteLength; if (size > 16384) throw new YouthError(); chunks.push(part.value);
    }
  } finally { void reader.cancel().catch(() => {}); }
  const form = await new Request("https://internal.invalid", { method: "POST", headers: { "Content-Type": mime }, body: Buffer.concat(chunks) }).formData();
  const allowed = new Set(["reason", "reasonDetail", "requestId"]);
  for (const key of form.keys()) if (!allowed.has(key) || form.getAll(key).length !== 1) throw new YouthError();
  return parseYouthDecisionDownload({ requestId: form.get("requestId") ?? randomUUID(), reason: form.get("reason"), reasonDetail: form.get("reasonDetail") });
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("인증이 필요합니다.", { status: 401, headers: privateHeaders });
  const context = { actorId: user.id, client: "web" as const, requestData: await getCurrentAuditLogRequestData() };
  let id = "";
  try {
    await youthTransaction(context, async (_tx, actor) => assertYouthPermission(actor, "canDownloadYouthDocuments"));
    id = youthId((await params).id);
    let input;
    try { input = await boundedForm(request); }
    catch (error) { await recordYouthDecisionDownloadFailure(context, id, "invalid_reason"); throw error; }
    const result = await downloadYouthDecisionDocument(context, id, input, { retainedAdmin: true });
    return new Response(result.body, { headers: { ...privateHeaders, "Content-Type": resourceSafeMimeType(result.mimeType || result.file.mimeType), "Content-Length": String(result.size), "Content-Disposition": youthDecisionDisposition(result.file.name) } });
  } catch (error) {
    if (id && error instanceof YouthError && error.status === 403) await recordYouthDecisionDownloadFailure(context, id, "forbidden");
    return new Response(error instanceof YouthError ? error.message : "결정문 다운로드를 완료하지 못했습니다. 같은 요청으로 확인하세요.", { status: error instanceof YouthError ? error.status : 503, headers: privateHeaders });
  }
}
