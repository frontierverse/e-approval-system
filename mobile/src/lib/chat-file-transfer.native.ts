import * as DocumentPicker from "expo-document-picker";
import { Directory, File, FileMode, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import ReactNativeBlobUtil, { type FetchBlobResponse, type StatefulPromise } from "react-native-blob-util";
import { ApiError, apiUrl } from "./api";
import { availableAttachmentFilename, isAttachmentTransferCancellation, transferProgress } from "./attachment-file";
import { CHAT_CHUNK_BYTES, chatFileDownloadInfo, chatFileFailure, chatFileJsonResponse, createChatFileApi, validateChatPickedFile, type ChatFileAdapter, type ChatFileCall } from "./chat-file-core";
export type { SelectedChatFile, ChatFileTransfer, ChatFileExportResult, ChatFilePreview, ChatFilePickOptions, ChatFileUploadOptions, ChatFileTransferOptions } from "./chat-file-core";
export { chatFileSize, isChatFileCancellation } from "./chat-file-core";

type LocalFile = { file: File; directory: Directory };
const CACHE_NAME = "chat-file-transfers";
const directories = new Set<Directory>();
function root() { return new Directory(Paths.cache, CACHE_NAME); }
function remove(directory: Directory) { directories.delete(directory); try { if (directory.exists) directory.delete(); } catch { /* Account cleanup retries only private files. */ } }
function path(uri: string) { if (!uri.startsWith("file://")) throw new ApiError("앱 임시 파일을 확인하지 못했습니다.", 0); return decodeURIComponent(uri.slice(7)); }
function create(name: string): LocalFile {
  const parent = root(); parent.create({ intermediates: true, idempotent: true });
  const directory = new Directory(parent, `op-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  directory.create(); directories.add(directory); return { file: new File(directory, name), directory };
}
function pickerCopy(uri: string) {
  const value = path(uri), prefix = path(new Directory(Paths.cache, "DocumentPicker").uri).replace(/\/$/, "") + "/";
  if (!value.startsWith(prefix) || value.slice(prefix.length).split("/").some(segment => segment === "." || segment === "..")) throw new ApiError("선택한 파일의 임시 사본을 확인하지 못했습니다. 다시 선택하세요.", 0);
  return new File(uri);
}
async function copy(source: File, target: File, offset: number, length: number, call: ChatFileCall) {
  call.check(); const reader = source.open(FileMode.ReadOnly); let writer: ReturnType<File["open"]> | undefined;
  try {
    reader.offset = offset; writer = target.open(FileMode.WriteOnly); let copied = 0, ticks = 0;
    while (copied < length) {
      call.check(); const bytes = reader.readBytes(Math.min(64 * 1024, length - copied));
      if (!bytes.length || bytes.length > length - copied) throw new ApiError("파일이 완전히 복사되지 않았습니다. 저장 위치와 원본을 확인하세요.", 0);
      writer.writeBytes(bytes); copied += bytes.length;
      if (++ticks % 16 === 0) await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
    call.check();
  } finally { try { writer?.close(); } finally { reader.close(); } }
  call.check(); if (!target.exists || target.size !== length) throw new ApiError("파일 크기를 확인하지 못했습니다. 수신 완료를 처리하지 않았습니다.", 0);
}
async function taskResponse(task: StatefulPromise<FetchBlobResponse>, call: ChatFileCall, upload = false) {
  const cancel = () => { try { task.cancel(); } catch { /* The request may have completed already. */ } };
  const off = call.onCancel(cancel);
  if (upload) task.uploadProgress({ interval: 250 }, (written, total) => { try { call.check(); call.onProgress(transferProgress(written, total)); } catch { cancel(); } });
  else task.progress({ interval: 250 }, (received, total) => { try { call.check(); call.onProgress(transferProgress(received, total)); } catch { cancel(); } });
  try { const response = await task; call.check(); return response; }
  catch (cause) { call.check(); if (cause instanceof ApiError || isAttachmentTransferCancellation(cause)) throw cause; throw new ApiError("파일 요청 결과를 확인하지 못했습니다. 같은 요청으로 다시 확인하세요.", 0); }
  finally { off(); }
}
async function jsonResponse(response: FetchBlobResponse, call: ChatFileCall) {
  const data: unknown = await response.json().catch(() => null); call.check(); return chatFileJsonResponse(response.info().status, data);
}
const adapter: ChatFileAdapter<LocalFile, LocalFile> = {
  async pick(options, call) {
    let copied: File | undefined, snapshot: LocalFile | undefined;
    try {
      call.check(); const result = await DocumentPicker.getDocumentAsync({ multiple: false, copyToCacheDirectory: true, base64: false });
      if (result.canceled) return null;
      const asset = result.assets[0]; if (!asset) throw new ApiError("선택한 파일을 확인하지 못했습니다.", 0);
      copied = pickerCopy(asset.uri); call.check();
      const size = copied.size, name = validateChatPickedFile(asset.name, size, options.policy);
      if (typeof asset.size === "number" && asset.size !== size) throw new ApiError("선택한 파일 크기가 변경되었습니다. 다시 선택하세요.", 0);
      const mimeType = asset.mimeType && /^[\w!#$&^_.+-]+\/[\w!#$&^_.+-]+$/.test(asset.mimeType) ? asset.mimeType.toLowerCase() : /\.zip$/i.test(name) ? "application/zip" : "application/octet-stream";
      snapshot = create(name);
      // Move only DocumentPicker's owned cache copy into a private snapshot.
      // A ZIP is never materialized as a whole JS/native request body.
      await copied.move(snapshot.file); copied = undefined; call.check();
      if (!snapshot.file.exists || snapshot.file.size !== size) throw new ApiError("선택한 파일의 전체 사본을 확인하지 못했습니다.", 0);
      const file = snapshot; snapshot = undefined; return { file, name, size, mimeType };
    } catch (cause) { if (isAttachmentTransferCancellation(cause)) return null; throw cause; }
    finally { if (copied) { try { if (copied.exists) copied.delete(); } catch { /* Never remove an external original. */ } } if (snapshot) remove(snapshot.directory); }
  },
  size: local => local.file.exists ? local.file.size : -1,
  async head(local) { const handle = local.file.open(FileMode.ReadOnly); try { return handle.readBytes(16); } finally { handle.close(); } },
  async part(local, offset, size, call) {
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(size) || offset < 0 || size <= 0 || size > CHAT_CHUNK_BYTES || offset + size > local.file.size) throw new ApiError("파일 조각의 범위를 확인하세요.", 400);
    const scratch = create("chunk.bin");
    try {
      scratch.file.create();
      await copy(local.file, scratch.file, offset, size, call); call.check();
      const digest = (await ReactNativeBlobUtil.fs.hash(path(scratch.file.uri), "sha256")).toLowerCase(); call.check();
      if (!/^[a-f0-9]{64}$/.test(digest)) throw new ApiError("파일 조각을 검증하지 못했습니다.", 0);
      return { file: scratch, digest, release: () => remove(scratch.directory) };
    } catch (cause) { remove(scratch.directory); throw cause; }
  },
  async multipart(local, input, call) {
    call.check(); if (local.file.size > CHAT_CHUNK_BYTES) throw new ApiError("일반 파일은 4MB 이하만 한 번에 전송할 수 있습니다.", 413);
    const response = await taskResponse(ReactNativeBlobUtil.config({ timeout: 120_000, followRedirect: false }).fetch("POST", apiUrl("/chat/files"), { Authorization: `Bearer ${call.token}`, Accept: "application/json", "Content-Type": "multipart/form-data" }, [
      { name: "peerId", data: input.peerId }, { name: "body", data: input.body }, { name: "requestId", data: input.requestId },
      { name: "file", filename: input.name, type: input.mimeType, data: ReactNativeBlobUtil.wrap(path(local.file.uri)) },
    ]), call, true);
    return jsonResponse(response, call);
  },
  async putPart(local, endpoint, call) {
    call.check(); if (!local.file.exists || local.file.size > CHAT_CHUNK_BYTES || local.file.size <= 0) throw new ApiError("파일 조각의 전체 내용을 확인하지 못했습니다.", 0);
    const response = await taskResponse(ReactNativeBlobUtil.config({ timeout: 120_000, followRedirect: false }).fetch("PUT", apiUrl(endpoint), { Authorization: `Bearer ${call.token}`, Accept: "application/json", "Content-Type": "application/octet-stream", "Content-Length": String(local.file.size) }, ReactNativeBlobUtil.wrap(path(local.file.uri))), call, true);
    return jsonResponse(response, call);
  },
  async download(endpoint, body, expectedSize, recipient, call) {
    const local = create("download.part"); let success = false;
    try {
      call.check(); call.onProgress(null);
      const response = await taskResponse(ReactNativeBlobUtil.config({ path: path(local.file.uri), timeout: 120_000, followRedirect: false }).fetch(body ? "POST" : "GET", apiUrl(endpoint), { Authorization: `Bearer ${call.token}`, Accept: "application/octet-stream", ...(body ? { "Content-Type": "application/json" } : {}) }, body ? JSON.stringify(body) : undefined), call);
      const metadata = response.info();
      if (metadata.status !== 200) {
        // Error responses are also saved on disk. Never materialize an
        // unexpectedly large proxy/error body as a whole JS string/buffer.
        const value: unknown = local.file.exists && local.file.size <= 16 * 1024 ? await response.json().catch(() => null) : null;
        call.check(); chatFileFailure(metadata.status, value);
      }
      const info = chatFileDownloadInfo(metadata.headers, expectedSize, recipient);
      if (!local.file.exists || local.file.size !== expectedSize) throw new ApiError("파일이 완전히 내려받아지지 않았습니다. 수신 완료를 처리하지 않았습니다.", 0);
      const complete = new File(local.directory, info.name); await local.file.move(complete); local.file = complete; call.check();
      call.onProgress(1); success = true; return { file: local, info };
    } finally { if (!success) remove(local.directory); }
  },
  async export(local, info, action, call) {
    call.check();
    if (action === "share" || Platform.OS === "ios") {
      if (!(await Sharing.isAvailableAsync())) throw new ApiError("이 기기에서는 파일 공유를 지원하지 않습니다.", 0);
      call.check(); await Sharing.shareAsync(local.file.uri, { mimeType: info.mimeType, dialogTitle: action === "save" ? "파일에 저장" : "파일 공유" }); call.check();
      // shareAsync returns void; chooser completion never proves saving.
      return { kind: "handoff", message: "파일 공유 창을 열었습니다. 저장한 파일을 확인한 뒤 수신 완료하세요." };
    }
    let target: File | undefined, saved = false;
    try {
      const folder = await Directory.pickDirectoryAsync(); call.check(); if (!folder) return null;
      const occupied = folder.info().files; if (!occupied) throw new ApiError("저장 폴더의 파일 목록을 확인하지 못했습니다.", 0);
      const name = availableAttachmentFilename(info.name, occupied); target = folder.createFile(name, info.mimeType);
      await copy(local.file, target, 0, info.size, call); call.check();
      if (!target.exists || target.size !== info.size) throw new ApiError("저장된 파일의 전체 크기를 확인하지 못했습니다. 수신 완료를 처리하지 않았습니다.", 0);
      saved = true; return { kind: "saved", message: `${name} 파일을 저장했습니다.` };
    } catch (cause) { if (isAttachmentTransferCancellation(cause)) return null; throw cause; }
    finally { if (target && !saved) { try { if (target.exists) target.delete(); } catch { /* Only our new external partial is removable. */ } } }
  },
  preview(local) { return { uri: local.file.uri, release() {} }; },
  release: local => remove(local.directory),
  async clear() {
    // Capture/delete synchronously. Never remove the shared root after yielding
    // when a new generation might already have created a different file.
    const captured = new Set(directories), parent = root();
    if (parent.exists) for (const entry of parent.list()) if (entry instanceof Directory) captured.add(entry);
    for (const directory of captured) remove(directory);
  },
};
const api = createChatFileApi(adapter);
export const { pickChatFile, discardChatFile, uploadChatFile, createChatFileTransfer, loadChatPreview, registerChatPreviewAttachment, lookupChatPreviewAttachment, clearChatFileResources } = api;
