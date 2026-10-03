import "server-only";
import { getMobileSession } from "@/lib/mobile-auth";
import { getAuditLogRequestData } from "@/lib/audit-log-request";
import { getLoginRequestInfo } from "@/lib/login-history-core";
import { getAttachmentPreviewKind } from "@/lib/attachment-preview";
import { ResourceError, parseResourceCreate, parseResourceUpdate, parseResourceDelete, parseResourceUpload, parseResourcePageQuery, parseResourceQuery, resourcePage, resourceId, resourceInputObject, readResourceJson, type ResourceFile } from "@/lib/mobile-resources-core";
import { getResourcePage, getResourceOptions, getResourceDetail, getResourceEditor, getResourceViewers, resourceTransaction, type ResourceContext } from "@/lib/resource-library-queries";
import { getResourceMutationStatus, mutateResource, recordResourceView } from "@/lib/resource-library-mutations";
import { startResourceUpload, getResourceUploadStatus, grantResourceUpload, completeResourceUpload, cancelResourceUpload } from "@/lib/resource-uploads";
export const resourcePrivateHeaders = { "Cache-Control": "private, no-store", Pragma: "no-cache", Vary: "Authorization, Cookie", "X-Content-Type-Options": "nosniff" };
export const resourceJson = (value: unknown, status = 200) => Response.json(value, { status, headers: resourcePrivateHeaders });
export function resourceFailure(error: unknown) { return error instanceof ResourceError ? resourceJson({ error: error.message, code: error.code, ...(error.fields ? { fields: error.fields } : {}) }, error.status) : resourceJson({ error: "자료실 요청을 처리하지 못했습니다. 같은 요청으로 다시 확인해 주세요.", code: "INTERNAL_ERROR" }, 500); }
export type ResourceRouteAction = "list" | "create" | "options" | "detail" | "editor" | "viewers" | "view" | "update" | "delete" | "mutation" | "upload-start" | "upload-status" | "upload-grant" | "upload-complete" | "upload-cancel" | "attachment" | "preview" | "download";
export async function mobileResourceResponse(request: Request, action: ResourceRouteAction, id?: string | (() => Promise<string>)) {
  try {
    const session = await getMobileSession(request); if (!session) return resourceJson({ error: "인증이 필요합니다.", code: "UNAUTHORIZED" }, 401);
    const context: ResourceContext = { actorId: session.userId, requestData: getAuditLogRequestData(getLoginRequestInfo(request.headers)) };
    const target = id ? resourceId(typeof id === "function" ? await id() : id, action === "mutation") : undefined, url = new URL(request.url);
    if (action === "list") return resourceJson(await getResourcePage(context, parseResourcePageQuery(url)));
    if (action === "upload-status" && !target) { const query = parseResourceQuery(url, ["requestId"]); return resourceJson(await getResourceUploadStatus(context, { requestId: resourceId(query.requestId, true) })); }
    if (action === "viewers") { const query = parseResourceQuery(url, ["page"]); return resourceJson(await getResourceViewers(context, target!, resourcePage(query.page))); }
    parseResourceQuery(url);
    if (action === "options") return resourceJson(await getResourceOptions(context));
    if (action === "detail") return resourceJson({ resource: await getResourceDetail(context, target!) });
    if (action === "editor") return resourceJson(await getResourceEditor(context, target!));
    if (action === "mutation") return resourceJson(await getResourceMutationStatus(context, target!));
    if (action === "upload-status") return resourceJson(await getResourceUploadStatus(context, { id: target! }));
    if (action === "attachment") return resourceJson({ attachment: await getResourceAttachment(context, target!) });
    if (action === "download" || action === "preview") return await readResourceAttachment(context, target!, { preview: action === "preview", signal: request.signal });
    const body = await readResourceJson(request);
    if (action === "create") { const result = await mutateResource(context, { operation: "create", data: parseResourceCreate(body) }); return resourceJson(result, result.replayed ? 200 : 201); }
    if (action === "update") return resourceJson(await mutateResource(context, { operation: "update", resourceId: target!, data: parseResourceUpdate(body) }));
    if (action === "delete") return resourceJson(await mutateResource(context, { operation: "delete", resourceId: target!, data: parseResourceDelete(body) }));
    if (action === "view") { const input = resourceInputObject(body, ["requestId"]); return resourceJson(await recordResourceView(context, { resourceId: target!, requestId: resourceId(input.requestId, true) })); }
    if (action === "upload-start") { const result = await startResourceUpload(context, parseResourceUpload(body)); const { replayed, ...data } = result; return resourceJson(data, replayed ? 200 : 201); }
    resourceInputObject(body, []);
    if (action === "upload-grant") return resourceJson(await grantResourceUpload(context, target!));
    if (action === "upload-cancel") return resourceJson(await cancelResourceUpload(context, target!));
    if (action === "upload-complete") { const { pending, upload } = await completeResourceUpload(context, target!); return resourceJson({ upload }, pending ? 202 : 200); }
    throw new ResourceError();
  } catch (error) { return resourceFailure(error); }
}
async function attachmentRecord(context: ResourceContext, id: string) { return resourceTransaction(context, async tx => { const file = await tx.resourceAttachment.findUnique({ where: { id: resourceId(id) }, include: { resource: { select: { id: true } } } }); if (!file) throw new ResourceError("첨부파일을 찾을 수 없습니다.", "NOT_FOUND", 404); const upload = await tx.resourceUpload.findFirst({ where: { consumedAttachmentId: file.id, state: "consumed", finalizeWriteEvidence: "confirmed" }, select: { plaintextSha256: true } }); return { file, hash: upload?.plaintextSha256 ?? undefined }; }); }
export async function getResourceAttachment(context: ResourceContext, id: string): Promise<ResourceFile> { const { file } = await attachmentRecord(context, id); return { id: file.id, name: file.originalName, mimeType: file.mimeType, size: file.size, previewKind: getAttachmentPreviewKind(file.originalName, file.mimeType) ?? "unsupported" }; }
function fileDisposition(name: string, inline: boolean) { const safe = name.replace(/[\r\n\x00-\x1f\x7f]/g, ""); const ascii = safe.replace(/[^\x20-\x7e]|["\\]/g, "_") || "attachment"; return `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(safe).replace(/['()*]/g, value => "%" + value.charCodeAt(0).toString(16).toUpperCase())}`; }
export async function readResourceAttachment(context: ResourceContext, id: string, options: { preview?: boolean; signal?: AbortSignal } = {}): Promise<Response> {
  const { file, hash } = await attachmentRecord(context, id), storage = context.storage ?? await import("@/lib/resource-file-storage");
  let result: Awaited<ReturnType<typeof storage.readResourceStoredFile>>;
  try { result = await storage.readResourceStoredFile(file, { expectedSize: file.size, expectedSha256: hash, signal: options.signal, beforeExpose: async () => { const fresh = await attachmentRecord(context, id); if (fresh.file.storageProvider !== file.storageProvider || fresh.file.storageKey !== file.storageKey || fresh.file.size !== file.size) throw new ResourceError("첨부파일을 찾을 수 없습니다.", "NOT_FOUND", 404); } }); }
  catch (error) { if (error instanceof ResourceError) throw error; throw new ResourceError("첨부파일을 읽지 못했습니다. 잠시 후 다시 시도해 주세요.", "STORAGE_UNAVAILABLE", 503); }
  if (options.preview && !result.previewKind) { await result.body.cancel().catch(() => undefined); throw new ResourceError("이 파일은 미리보기를 지원하지 않습니다.", "UNSUPPORTED_PREVIEW", 415); }
  return new Response(result.body, { headers: { ...resourcePrivateHeaders, "Content-Type": result.mimeType ?? "application/octet-stream", "Content-Length": String(result.size), "Content-Disposition": fileDisposition(file.originalName, Boolean(options.preview)), "Access-Control-Expose-Headers": "Content-Disposition, Content-Length, Content-Type" } });
}
