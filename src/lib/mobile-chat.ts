import "server-only";

import { getMobileSession, mobileJson } from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";
import { getStaffChatToday, parseStaffChatId, StaffChatError } from "@/lib/staff-chat-core";
import { lockActiveParticipants, readActiveStaffChatActor } from "@/lib/staff-chat-actor";
import { getStaffChatSummary, getStaffChatMessages, sendStaffChatMessage, markStaffChatRead } from "@/lib/staff-chat";
import { getStaffChatFilePolicySnapshot, sendStaffChatFile, previewStaffChatFile, downloadStaffChatFile, completeStaffChatFileDownload, getStaffChatFileReceiptStatus } from "@/lib/staff-chat-files";
import { startStaffChatUpload, putStaffChatUploadPart, completeStaffChatUpload, getStaffChatUploadStatus } from "@/lib/staff-chat-uploads";
import { parseStaffChatUploadId } from "@/lib/staff-chat-upload-core";
import { parseMobileChatQuery, parseMobileChatOperationId, parseMobileChatPartIndex, readMobileChatJson, readMobileChatFileForm, readMobileChatChunk, mobileChatUploadJsonMaxBytes } from "@/lib/mobile-chat-core";

type Action = "summary" | "messages" | "read" | "files" | "preview" | "download" | "status" | "receipt" | "uploads" | "part" | "publish";
type Params = Promise<{ id: string; index?: string }>;
const codes: Record<number, string> = { 400: "INVALID_REQUEST", 401: "UNAUTHORIZED", 403: "FORBIDDEN", 404: "NOT_FOUND", 408: "REQUEST_TIMEOUT", 409: "CHAT_CONFLICT", 410: "RESOURCE_UNAVAILABLE", 413: "PAYLOAD_TOO_LARGE", 415: "UNSUPPORTED_MEDIA_TYPE", 503: "CHAT_UNAVAILABLE" };
function privateResponse(value: unknown) {
  const response = value instanceof Response ? value : mobileJson(value);
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "private, no-store"); headers.set("Pragma", "no-cache"); headers.set("Vary", "Authorization");
  if (value instanceof Response) headers.set("Access-Control-Expose-Headers", "Content-Disposition, Content-Length, Content-Type, X-Chat-Download-Token");
  return new Response(response.body, { status: response.status, headers });
}
/** Authentication precedes every query, async param and bounded body parser. */
export async function getMobileChatResponse(request: Request, action: Action, params?: Params): Promise<Response> {
  try {
    const session = await getMobileSession(request), today = getStaffChatToday();
    if (!session) throw new StaffChatError("인증이 필요합니다.", 401);
    const actor = await readActiveStaffChatActor(prisma, session.userId, today), context = { today };
    const search = new URL(request.url).searchParams;
    if (action === "messages" && request.method === "GET") {
      const query = parseMobileChatQuery(search, ["peerId"], ["before"]);
      return privateResponse(await getStaffChatMessages(actor.id, query.peerId, query.before, context));
    }
    if (action === "uploads" && request.method === "GET") {
      const query = parseMobileChatQuery(search, ["requestId"]);
      return privateResponse(await getStaffChatUploadStatus(actor.id, parseMobileChatOperationId(query.requestId), context));
    }
    parseMobileChatQuery(search);
    if (action === "summary") return privateResponse(await getStaffChatSummary(actor.id, context));
    if (action === "files" && request.method === "GET") return privateResponse(await prisma.$transaction(async tx => {
      await lockActiveParticipants(tx, actor.id, undefined, today); return getStaffChatFilePolicySnapshot(tx);
    }, { isolationLevel: "RepeatableRead" }));
    if (action === "messages") return privateResponse({ message: await sendStaffChatMessage(actor.id, await readMobileChatJson(request, ["peerId", "body", "requestId"]), context) });
    if (action === "read") { await markStaffChatRead(actor.id, await readMobileChatJson(request, ["peerId", "messageId"]), context); return privateResponse({ ok: true }); }
    if (action === "files") return privateResponse({ message: await sendStaffChatFile(actor.id, await readMobileChatFileForm(request), context) });
    if (action === "uploads") return privateResponse(await startStaffChatUpload(actor.id, await readMobileChatJson(request, ["peerId", "body", "requestId", "originalName", "mimeType", "size", "chunkDigests"], mobileChatUploadJsonMaxBytes), context));
    const raw = await params;
    const id = action === "part" || action === "publish" ? parseStaffChatUploadId(raw?.id) : parseStaffChatId(raw?.id);
    if (action === "preview") return privateResponse(await previewStaffChatFile(actor.id, id, context));
    if (action === "download") return privateResponse(await downloadStaffChatFile(actor.id, id, await readMobileChatJson(request, ["requestId"]), context));
    if (action === "status") return privateResponse(await getStaffChatFileReceiptStatus(actor.id, id, await readMobileChatJson(request, ["requestId", "token"]), context));
    if (action === "receipt") return privateResponse({ message: await completeStaffChatFileDownload(actor.id, id, await readMobileChatJson(request, ["token"]), context) });
    if (action === "part") return privateResponse(await putStaffChatUploadPart(actor.id, id, parseMobileChatPartIndex(raw?.index), await readMobileChatChunk(request), context));
    await readMobileChatJson(request, []);
    return privateResponse({ message: await completeStaffChatUpload(actor.id, id, context) });
  } catch (error) {
    const known = error instanceof StaffChatError;
    return privateResponse(mobileJson({ error: known ? error.message : "채팅을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.", code: known ? codes[error.status] ?? "CHAT_UNAVAILABLE" : "CHAT_UNAVAILABLE" }, known ? error.status : 503));
  }
}
