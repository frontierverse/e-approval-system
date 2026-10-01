import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { UserStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

const mobileSessionDays = 30;

export function mobileJson(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store", Pragma: "no-cache" },
  });
}

export function hashMobileToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createMobileSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + mobileSessionDays * 86_400_000);
  await prisma.mobileSession.create({
    data: { userId, tokenHash: hashMobileToken(token), expiresAt },
  });
  return { token, expiresAt: expiresAt.toISOString() };
}

export async function getMobileSession(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer ([A-Za-z0-9_-]{32,128})$/.exec(authorization);
  if (!match) return null;

  const session = await prisma.mobileSession.findUnique({
    where: { tokenHash: hashMobileToken(match[1]!) },
    include: { user: { select: { id: true, name: true, role: true, status: true } } },
  });
  if (
    !session ||
    session.expiresAt.getTime() <= Date.now() ||
    session.user.status !== UserStatus.ACTIVE
  ) {
    return null;
  }
  return session;
}

export function mobileUserSummary(user: {
  id: string;
  name: string;
  role: string;
}) {
  return { id: user.id, name: user.name, role: user.role };
}
