import { getMobileSession, mobileJson } from "@/lib/mobile-auth";
import { validMobileNotificationId } from "@/lib/mobile-notifications-core";
import { markMobileDocumentNotificationsRead } from "@/lib/mobile-notifications";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const session = await getMobileSession(request);
    if (!session) return mobileJson({ error: "로그인이 필요합니다." }, 401);
    const body: unknown = await request.json().catch(() => null);
    const documentId = typeof body === "object" && body !== null && "documentId" in body
      ? body.documentId
      : null;
    if (!validMobileNotificationId(documentId)) return mobileJson({ error: "문서가 올바르지 않습니다." }, 400);
    const result = await markMobileDocumentNotificationsRead(session.userId, documentId);
    return result ? mobileJson(result) : mobileJson({ error: "문서를 찾을 수 없습니다." }, 404);
  } catch {
    return mobileJson({ error: "알림을 읽음으로 처리하지 못했습니다. 다시 시도하세요." }, 500);
  }
}
