import { getMobileSession, mobileJson } from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getMobileSession(request);
  if (!session) return mobileJson({ error: "로그인이 필요합니다." }, 401);
  const subscription = await prisma.mobilePushSubscription.findUnique({
    where: { sessionId: session.id },
    select: { id: true },
  });
  return mobileJson({ enabled: Boolean(subscription) });
}

export async function POST(request: Request) {
  const session = await getMobileSession(request);
  if (!session) return mobileJson({ error: "로그인이 필요합니다." }, 401);
  const body: unknown = await request.json().catch(() => null);
  const token = typeof body === "object" && body !== null && "expoPushToken" in body
    ? body.expoPushToken : null;
  if (typeof token !== "string" || !/^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]{10,200}\]$/.test(token)) {
    return mobileJson({ error: "알림 토큰이 올바르지 않습니다." }, 400);
  }
  await prisma.$transaction(async (tx) => {
    await tx.mobilePushSubscription.deleteMany({
      where: { expoToken: token, NOT: { sessionId: session.id } },
    });
    await tx.mobilePushSubscription.upsert({
      where: { sessionId: session.id },
      create: { expoToken: token, sessionId: session.id },
      update: { expoToken: token },
    });
  });
  return mobileJson({ enabled: true });
}

export async function DELETE(request: Request) {
  const session = await getMobileSession(request);
  if (!session) return mobileJson({ error: "로그인이 필요합니다." }, 401);
  await prisma.mobilePushSubscription.deleteMany({ where: { sessionId: session.id } });
  return mobileJson({ enabled: false });
}
