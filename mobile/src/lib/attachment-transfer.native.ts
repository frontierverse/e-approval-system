import { Directory, File, FileMode, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import ReactNativeBlobUtil, { type FetchBlobResponse, type StatefulPromise } from "react-native-blob-util";
import { ApiError, apiUrl } from "./api";
import { attachmentDownloadInfo, attachmentDownloadPath, availableAttachmentFilename, isAttachmentTransferCancellation, transferProgress,
  type AttachmentTransfer, type AttachmentTransferOptions } from "./attachment-file";

const CACHE_NAME = "attachment-transfers";
const SHARE_RETENTION_MS = 10 * 60 * 1000;

async function copyAttachment(source: File, destination: File, stopped: () => boolean) {
  const reader = source.open(FileMode.ReadOnly);
  let writer: ReturnType<File["open"]> | null = null;
  try {
    writer = destination.open(FileMode.WriteOnly);
    let chunks = 0;
    while (!stopped()) {
      const bytes = reader.readBytes(64 * 1024);
      if (bytes.length === 0) break;
      writer.writeBytes(bytes);
      // Yield periodically so large files keep navigation and cancellation responsive.
      if (++chunks % 16 === 0) await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
  } finally {
    try { writer?.close(); } finally { reader.close(); }
  }
}
const active = new Set<{ cancel: () => void; cacheUri?: string }>();
let cacheGeneration = 0;

function privateCache() { return new Directory(Paths.cache, CACHE_NAME); }
function removeCache(directory: Directory) { if (directory.exists) directory.delete(); }

function purgeStaleCache() {
  const root = privateCache();
  if (!root.exists) return;
  for (const item of root.list()) {
    const timestamp = item.name.match(/^op-(\d+)-/)?.[1];
    if (!timestamp || Date.now() - Number(timestamp) < SHARE_RETENTION_MS || [...active].some(operation => operation.cacheUri === item.uri)) continue;
    try { item.delete(); } catch { /* A provider or the OS may already have removed it. */ }
  }
}

export async function clearAttachmentTransferCache(): Promise<void> {
  cacheGeneration += 1;
  for (const operation of active) operation.cancel();
  try { removeCache(privateCache()); } catch { /* Cleanup is also retried at the next transfer. */ }
}

export function startAttachmentTransfer(options: AttachmentTransferOptions): AttachmentTransfer {
  let cancelled = false;
  let task: StatefulPromise<FetchBlobResponse> | null = null;
  const generation = cacheGeneration;
  const operation: { cancel: () => void; cacheUri?: string } = { cancel: () => {
    cancelled = true;
    try { task?.cancel(); } catch { /* A completed native request can no longer be cancelled. */ }
  } };
  active.add(operation);
  const stopped = () => cancelled || generation !== cacheGeneration;
  const promise = (async () => {
    let cache: Directory | null = null;
    let destination: File | null = null;
    let keepForShare = false;
    let saved = false;
    try {
      if (!options.token) throw new ApiError("로그인이 필요합니다.", 401);
      const url = apiUrl(attachmentDownloadPath(options.id));
      purgeStaleCache();
      if (stopped()) return null;
      const needsShare = options.action === "share" || Platform.OS === "ios";
      if (needsShare && !(await Sharing.isAvailableAsync())) throw new ApiError("이 기기에서는 파일 공유를 사용할 수 없습니다.", 0);
      if (stopped()) return null;
      const folder = !needsShare ? await Directory.pickDirectoryAsync() : null;
      if (stopped()) return null;
      const root = privateCache();
      root.create({ intermediates: true, idempotent: true });
      cache = new Directory(root, `op-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      cache.create();
      operation.cacheUri = cache.uri;
      const partial = new File(cache, "download.part");
      const path = decodeURIComponent(partial.uri.replace(/^file:\/\//, ""));
      options.onProgress?.(null);
      task = ReactNativeBlobUtil.config({ path, followRedirect: false, timeout: 120_000 })
        .fetch("GET", url, { Authorization: `Bearer ${options.token}`, Accept: "application/octet-stream" })
        .progress({ interval: 250 }, (received, total) => { if (!stopped()) options.onProgress?.(transferProgress(received, total)); });
      const response = await task;
      task = null;
      if (stopped()) return null;
      const info = response.info();
      if (info.status !== 200) {
        const message = info.status === 401 ? "로그인이 만료되었습니다. 다시 로그인하세요." : info.status === 403 ? "이 첨부파일을 내려받을 권한이 없습니다." :
          info.status === 404 ? "첨부파일을 찾을 수 없습니다." : "첨부파일을 내려받지 못했습니다. 다시 시도하세요.";
        throw new ApiError(message, info.status);
      }
      const fileInfo = attachmentDownloadInfo(info.headers, options.id);
      if (!partial.exists || partial.size === 0 || (fileInfo.size !== null && partial.size !== fileInfo.size)) {
        throw new ApiError("첨부파일이 완전히 내려받아지지 않았습니다. 다시 시도하세요.", 0);
      }
      const local = new File(cache, fileInfo.name);
      await partial.move(local);
      if (stopped()) return null;
      options.onProgress?.(1);
      if (folder) {
        const occupied = folder.info().files;
        if (!occupied) throw new ApiError("저장 위치의 파일 목록을 확인하지 못했습니다. 다른 폴더를 선택하세요.", 0);
        const filename = availableAttachmentFilename(fileInfo.name, occupied);
        destination = folder.createFile(filename, fileInfo.mimeType);
        await copyAttachment(local, destination, stopped);
        if (stopped()) return null;
        if (!destination.exists || destination.size !== local.size) throw new ApiError("파일을 저장하지 못했습니다. 저장 위치를 확인하고 다시 시도하세요.", 0);
        saved = true;
        return `${filename} 파일을 저장했습니다.`;
      }
      // The receiving app may read after the chooser promise resolves on Android.
      keepForShare = true;
      await Sharing.shareAsync(local.uri, { mimeType: fileInfo.mimeType, dialogTitle: options.action === "save" ? "파일에 저장" : "첨부파일 공유" });
      if (stopped()) return null;
      return options.action === "save" ? "파일 저장 창을 열었습니다." : "파일 공유 창을 열었습니다.";
    } catch (error) {
      keepForShare = false;
      if (stopped() || isAttachmentTransferCancellation(error)) return null;
      if (error instanceof ApiError) throw error;
      throw new ApiError("파일을 내려받거나 저장하지 못했습니다. 연결과 저장 위치를 확인하고 다시 시도하세요.", 0);
    } finally {
      task = null;
      active.delete(operation);
      if (destination && !saved) { try { if (destination.exists) destination.delete(); } catch { /* Only our newly created file is eligible for cleanup. */ } }
      if (cache && !keepForShare) { try { removeCache(cache); } catch { /* Stale private files are cleared on logout/startup. */ } }
      if (cache && keepForShare) {
        const sharedCache = cache;
        setTimeout(() => { try { removeCache(sharedCache); } catch { /* Purged on the next transfer too. */ } }, SHARE_RETENTION_MS);
      }
    }
  })();
  return { promise, cancel: operation.cancel };
}
