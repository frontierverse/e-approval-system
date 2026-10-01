import { getMobileSession, mobileJson } from "@/lib/mobile-auth";
import { markDocumentNotificationsRead } from "@/lib/notifications";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getMobileSession(request);
  if (!session) return mobileJson({ error: "로그인이 필요합니다." }, 401);
  const body: unknown = await request.json().catch(() => null);
  const documentId = typeof body === "object" && body !== null && "documentId" in body
    ? body.documentId : null;
  if (typeof documentId !== "string" || documentId.length > 100) {
    return mobileJson({ error: "문서가 올바르지 않습니다." }, 400);
  }
  await markDocumentNotificationsRead(session.userId, documentId);
  return mobileJson({ ok: true });
}
