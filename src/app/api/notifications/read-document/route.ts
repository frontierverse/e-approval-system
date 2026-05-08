import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { markDocumentNotificationsRead } from "@/lib/notifications";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    documentId?: unknown;
  } | null;
  const documentId =
    typeof body?.documentId === "string" ? body.documentId.trim() : "";

  if (!documentId) {
    return NextResponse.json(
      { error: "요청 값이 올바르지 않습니다." },
      { status: 400 },
    );
  }

  await markDocumentNotificationsRead(user.id, documentId);

  return NextResponse.json({ ok: true });
}
