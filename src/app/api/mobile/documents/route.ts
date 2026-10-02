import { getMobileSession, mobileJson } from "@/lib/mobile-auth";
import { getMobileDocumentPage } from "@/lib/mobile-document-library";
import { parseMobileDocumentFilters } from "@/lib/mobile-document-library-core";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getMobileSession(request);
  if (!session) return mobileJson({ error: "로그인이 필요합니다." }, 401);
  const parsed = parseMobileDocumentFilters(new URL(request.url).searchParams);
  if (!parsed.ok) return mobileJson({ error: parsed.error }, 400);
  try {
    return mobileJson(await getMobileDocumentPage(session.userId, parsed.filters));
  } catch (error) {
    console.error("Mobile document library load failed", error);
    return mobileJson({ error: "문서함을 불러오지 못했습니다. 잠시 후 다시 시도하세요." }, 500);
  }
}
