import type { PendingAttachment } from "./drafts";
export async function uploadFile(file: PendingAttachment, url: string, mimeType: string) {
  const body = file.file ?? await (await fetch(file.uri)).blob();
  const response = await fetch(url, { method: "PUT", headers: { "Content-Type": mimeType }, body });
  if (!response.ok) throw new Error("첨부파일을 업로드하지 못했습니다. 파일을 제거한 뒤 다시 첨부하세요.");
}
