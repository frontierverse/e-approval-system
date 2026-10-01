import { getMobileSession, mobileJson, mobileUserSummary } from "@/lib/mobile-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getMobileSession(request);
  if (!session) return mobileJson({ error: "로그인이 필요합니다." }, 401);
  return mobileJson({ user: mobileUserSummary(session.user) });
}
