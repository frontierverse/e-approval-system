import { getMobileSession, mobileJson } from "@/lib/mobile-auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getMobileSession(request);
  if (session) await prisma.mobileSession.delete({ where: { id: session.id } });
  return mobileJson({ ok: true });
}
