import { UserStatus } from "@/generated/prisma/client";
import { getLoginRequestInfo } from "@/lib/login-history-core";
import { recordLoginHistory } from "@/lib/login-history";
import { createMobileSession, mobileJson, mobileUserSummary } from "@/lib/mobile-auth";
import { verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { ensureStaffLeaveAccrualsForUser } from "@/lib/staff-leave";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const name = typeof body === "object" && body !== null && "name" in body
    ? String(body.name).trim() : "";
  const password = typeof body === "object" && body !== null && "password" in body
    ? String(body.password) : "";
  if (!name || !password || name.length > 100 || password.length > 1024) {
    return mobileJson({ error: "이름과 비밀번호를 입력하세요." }, 400);
  }

  const users = await prisma.user.findMany({
    where: { name },
    select: { id: true, name: true, role: true, status: true, passwordHash: true },
    orderBy: { createdAt: "asc" },
  });
  const user = users.find((candidate) =>
    candidate.status === UserStatus.ACTIVE &&
    candidate.passwordHash &&
    verifyPassword(password, candidate.passwordHash),
  );
  const requestInfo = getLoginRequestInfo(request.headers);
  await recordLoginHistory({
    attemptedName: name,
    userId: user?.id ?? null,
    success: Boolean(user),
    failureReason: user ? undefined : "invalid_credentials",
    requestInfo,
  });
  if (!user) return mobileJson({ error: "이름 또는 비밀번호가 올바르지 않습니다." }, 401);

  await ensureStaffLeaveAccrualsForUser(user.id);
  const session = await createMobileSession(user.id);
  return mobileJson({ ...session, user: mobileUserSummary(user) });
}
