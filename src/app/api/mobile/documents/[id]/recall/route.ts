import { revalidatePath } from "next/cache";
import { getReadableDocumentById } from "@/lib/approval-queries";
import { recallSubmittedDocument } from "@/lib/approval-mutations";
import { getMobileSession, mobileJson } from "@/lib/mobile-auth";
import { canRecallDocumentByPolicy } from "@/lib/approval-permissions-core";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getMobileSession(request);
  if (!session) return mobileJson({ error: "로그인이 필요합니다." }, 401);
  const value: unknown = await request.json().catch(() => null);
  const version = value && typeof value === "object" && "expectedUpdatedAt" in value ? value.expectedUpdatedAt : null;
  if (typeof version !== "string" || version.length > 32 || !Number.isFinite(Date.parse(version)) || new Date(version).toISOString() !== version) {
    return mobileJson({ error: "문서 수정 정보를 확인할 수 없습니다. 상세 화면을 다시 열어주세요." }, 400);
  }
  const { id } = await params;
  const document = await getReadableDocumentById(id, session.userId, session.user.role);
  if (!document) return mobileJson({ error: "문서를 찾을 수 없습니다." }, 404);
  if (document.drafterId !== session.userId) return mobileJson({ error: "작성자만 문서를 회수할 수 있습니다." }, 403);
  if (!canRecallDocumentByPolicy(session.userId, document) && document.status !== "recalled") {
    return mobileJson({ error: "상신 또는 결재 중인 문서만 회수할 수 있습니다. 최신 상태를 확인하세요." }, 409);
  }
  try {
    const result = await recallSubmittedDocument(id, session.userId, version);
    if (!result.ok) return mobileJson({ error: result.message }, 409);
    for (const path of ["/", "/drafts", "/inbox", "/sent", "/completed", `/documents/${id}`]) revalidatePath(path);
    return mobileJson({ ok: true, documentId: result.documentId, status: "recalled" });
  } catch (error) {
    console.error("Mobile recall failed", error instanceof Error ? error.name : "UnknownError");
    return mobileJson({ error: "회수 결과를 확인하지 못했습니다. 최신 상태를 확인하거나 다시 시도하세요." }, 500);
  }
}
