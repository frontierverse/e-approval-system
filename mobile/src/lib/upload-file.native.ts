import ReactNativeBlobUtil from "react-native-blob-util";
import type { PendingAttachment } from "./drafts";
export async function uploadFile(file: PendingAttachment, url: string, mimeType: string) {
  const path = file.uri.startsWith("file://") ? decodeURIComponent(file.uri.slice(7)) : file.uri;
  const response = await ReactNativeBlobUtil.config({ timeout: 120_000 }).fetch("PUT", url, { "Content-Type": mimeType }, ReactNativeBlobUtil.wrap(path));
  if (response.info().status < 200 || response.info().status >= 300) throw new Error("첨부파일을 업로드하지 못했습니다. 파일을 제거한 뒤 다시 첨부하세요.");
}
