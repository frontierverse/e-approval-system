import "server-only";
import { getMobileSession } from "@/lib/mobile-auth";
import { getAuditLogRequestData } from "@/lib/audit-log-request";
import { getLoginRequestInfo } from "@/lib/login-history-core";
import { YouthError, readYouthJson, youthId, youthObject, youthQuery } from "@/lib/mobile-youth-core";
import { youthTransaction, assertYouthPermission } from "@/lib/youth-mobile-context";
import { startYouthDecisionUpload, getYouthDecisionUploadStatus, grantYouthDecisionUpload, completeYouthDecisionUpload, cancelYouthDecisionUpload, type YouthDecisionContext } from "@/lib/youth-decision-uploads";
import { attachYouthDecisionDocuments, deleteYouthDecisionDocument, getYouthDecisionDocuments, downloadYouthDecisionDocument, recordYouthDecisionDownloadFailure } from "@/lib/youth-decision-documents";
import { parseYouthDecisionUpload, parseYouthDecisionDownload, youthDecisionPolicy, youthDecisionDisposition } from "@/lib/youth-decision-file-core";
import { resourceSafeMimeType } from "@/lib/resource-file-storage-core";
export const youthDecisionPrivateHeaders = { "Cache-Control": "private, no-store", Pragma: "no-cache", Vary: "Authorization, Cookie", "X-Content-Type-Options": "nosniff" };
export function youthDecisionJson(value: unknown, status = 200) { return Response.json(value, { status, headers: youthDecisionPrivateHeaders }); }
export function youthDecisionFailure(error: unknown) { return error instanceof YouthError ? youthDecisionJson({ error: error.message, code: error.code, ...(error.fields ? { fields: error.fields } : {}) }, error.status) : youthDecisionJson({ error: "결정문 요청을 처리하지 못했습니다. 같은 요청으로 상태를 확인하세요.", code: "REQUEST_UNAVAILABLE" }, 503); }
export type YouthDecisionAction = "policy" | "upload-start" | "upload-status" | "upload-request" | "upload-grant" | "upload-complete" | "upload-cancel" | "documents" | "attach" | "delete" | "download";
export async function mobileYouthDecisionResponse(request: Request, action: YouthDecisionAction, id?: string | (() => Promise<string>)) {
  try {
    const session = await getMobileSession(request); if (!session) return youthDecisionJson({ error: "인증이 필요합니다.", code: "UNAUTHORIZED" }, 401);
    const context: YouthDecisionContext = { actorId: session.userId, client: "mobile", requestData: getAuditLogRequestData(getLoginRequestInfo(request.headers)) };
    const target = id ? youthId(typeof id === "function" ? await id() : id, action === "upload-request") : undefined;
    youthQuery(new URL(request.url));
    // Fresh actor and purpose permission precede body consumption and storage.
    await youthTransaction(context, async (_tx, actor) => assertYouthPermission(actor, ["documents", "download"].includes(action) ? "canDownloadYouthDocuments" : "canManageYouth"));
    if (action === "policy") return youthDecisionJson(youthDecisionPolicy);
    if (action === "upload-status") return youthDecisionJson(await getYouthDecisionUploadStatus(context, { id: target! }));
    if (action === "upload-request") return youthDecisionJson(await getYouthDecisionUploadStatus(context, { requestId: target! }));
    if (action === "documents") return youthDecisionJson(await getYouthDecisionDocuments(context, target!));
    let raw: unknown;
    try { raw = await readYouthJson(request); }
    catch (error) { if (action === "download") await recordYouthDecisionDownloadFailure(context, target!, "invalid_reason"); throw error; }
    if (action === "upload-start") return youthDecisionJson(await startYouthDecisionUpload(context, parseYouthDecisionUpload(raw)));
    if (["upload-grant", "upload-complete", "upload-cancel"].includes(action)) youthObject(raw, []);
    if (action === "upload-grant") return youthDecisionJson(await grantYouthDecisionUpload(context, target!));
    if (action === "upload-complete") { const result = await completeYouthDecisionUpload(context, target!); return youthDecisionJson(result, result.pending ? 202 : 200); }
    if (action === "upload-cancel") return youthDecisionJson(await cancelYouthDecisionUpload(context, target!));
    if (action === "attach") return youthDecisionJson(await attachYouthDecisionDocuments(context, target!, raw));
    if (action === "delete") return youthDecisionJson(await deleteYouthDecisionDocument(context, target!, raw));
    if (action === "download") {
      let input; try { input = parseYouthDecisionDownload(raw); } catch (error) { await recordYouthDecisionDownloadFailure(context, target!, "invalid_reason"); throw error; }
      const result = await downloadYouthDecisionDocument(context, target!, input);
      return new Response(result.body, { headers: { ...youthDecisionPrivateHeaders, "Content-Type": resourceSafeMimeType(result.file.mimeType), "Content-Length": String(result.size), "Content-Disposition": youthDecisionDisposition(result.file.name), "Access-Control-Expose-Headers": "Content-Disposition, Content-Length, Content-Type" } });
    }
    throw new YouthError();
  } catch (error) { return youthDecisionFailure(error); }
}
