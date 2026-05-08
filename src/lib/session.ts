import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { sessionCookieName } from "@/lib/session-constants";

type SessionPayload = {
  userId: string;
  expiresAt: number;
};

const maxAgeSeconds = 60 * 60 * 8;

export async function createSession(userId: string) {
  const expiresAt = Date.now() + maxAgeSeconds * 1000;
  const payload = encodePayload({ userId, expiresAt });
  const signature = sign(payload);
  const cookieStore = await cookies();

  cookieStore.set(sessionCookieName, `${payload}.${signature}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(sessionCookieName);
}

export async function getSessionUserId() {
  const cookieStore = await cookies();
  const value = cookieStore.get(sessionCookieName)?.value;

  if (!value) {
    return null;
  }

  return verifySessionValue(value)?.userId ?? null;
}

export function verifySessionValue(value: string) {
  const [payload, signature] = value.split(".");

  if (!payload || !signature || !verifySignature(payload, signature)) {
    return null;
  }

  const parsed = decodePayload(payload);

  if (!parsed || parsed.expiresAt < Date.now()) {
    return null;
  }

  return parsed;
}

function encodePayload(payload: SessionPayload) {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function decodePayload(value: string): SessionPayload | null {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));

    if (
      typeof parsed.userId !== "string" ||
      typeof parsed.expiresAt !== "number"
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function sign(payload: string) {
  return createHmac("sha256", getSessionSecret())
    .update(payload)
    .digest("base64url");
}

function verifySignature(payload: string, signature: string) {
  const expected = sign(payload);
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, actualBuffer);
}

function getSessionSecret() {
  return (
    process.env.AUTH_SECRET ??
    "dev-only-change-this-secret-before-production"
  );
}
