import { ApiError, apiUrl } from "./api";
import { attachmentDownloadInfo, attachmentDownloadPath, isAttachmentTransferCancellation, transferProgress,
  type AttachmentTransfer, type AttachmentTransferOptions } from "./attachment-file";

const active = new Set<AbortController>();
const objectUrls = new Set<string>();

export async function clearAttachmentTransferCache(): Promise<void> {
  for (const controller of active) controller.abort();
  for (const url of objectUrls) URL.revokeObjectURL(url);
  objectUrls.clear();
}

export function startAttachmentTransfer(options: AttachmentTransferOptions): AttachmentTransfer {
  const controller = new AbortController();
  active.add(controller);
  const promise = (async () => {
    let objectUrl: string | null = null;
    try {
      if (!options.token) throw new ApiError("로그인이 필요합니다.", 401);
      if (options.action === "share") throw new ApiError("파일 공유는 설치된 앱에서 사용할 수 있습니다. 이 화면에서는 파일을 저장하세요.", 0);
      options.onProgress?.(null);
      const response = await fetch(apiUrl(attachmentDownloadPath(options.id)), {
        headers: { Authorization: `Bearer ${options.token}`, Accept: "application/octet-stream" },
        cache: "no-store", redirect: "error", signal: controller.signal,
      });
      if (response.status !== 200) {
        const data: unknown = await response.json().catch(() => null);
        const message = data && typeof data === "object" && "error" in data && typeof data.error === "string" ? data.error : "첨부파일을 내려받지 못했습니다. 다시 시도하세요.";
        throw new ApiError(message, response.status);
      }
      const info = attachmentDownloadInfo(Object.fromEntries(response.headers.entries()), options.id);
      const chunks: Uint8Array[] = [];
      let received = 0;
      const reader = response.body?.getReader();
      let blob: Blob;
      if (reader) {
        while (true) {
          const result = await reader.read();
          if (result.done) break;
          chunks.push(result.value);
          received += result.value.length;
          options.onProgress?.(transferProgress(received, info.size ?? -1));
        }
        blob = new Blob(chunks as BlobPart[], { type: info.mimeType });
      } else {
        blob = await response.blob();
      }
      if (controller.signal.aborted) return null;
      if (blob.size === 0 || (info.size !== null && blob.size !== info.size)) throw new ApiError("첨부파일이 완전히 내려받아지지 않았습니다. 다시 시도하세요.", 0);
      objectUrl = URL.createObjectURL(blob);
      objectUrls.add(objectUrl);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = info.name;
      document.body.appendChild(anchor);
      try { anchor.click(); } finally { anchor.remove(); }
      options.onProgress?.(1);
      const completedUrl = objectUrl;
      setTimeout(() => { URL.revokeObjectURL(completedUrl); objectUrls.delete(completedUrl); }, 60_000);
      objectUrl = null;
      return "파일 저장을 시작했습니다.";
    } catch (error) {
      if (controller.signal.aborted || isAttachmentTransferCancellation(error)) return null;
      if (error instanceof ApiError) throw error;
      throw new ApiError("파일을 내려받지 못했습니다. 연결을 확인하고 다시 시도하세요.", 0);
    } finally {
      active.delete(controller);
      if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrls.delete(objectUrl); }
    }
  })();
  return { promise, cancel: () => controller.abort() };
}
