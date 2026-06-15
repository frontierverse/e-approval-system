import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { youthManagementAccessCookieName } from "@/lib/session-constants";

export async function POST() {
  await requireUser();

  const response = NextResponse.json({ ok: true });

  response.cookies.delete(youthManagementAccessCookieName);

  return response;
}
