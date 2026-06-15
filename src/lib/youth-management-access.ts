import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { youthManagementAccessCookieName } from "@/lib/session-constants";

type YouthManagementAccessPayload = {
  purpose: typeof youthManagementAccessPurpose;
  userId: string;
};

const youthManagementAccessPurpose = "youth-management";

export async function createYouthManagementAccess(userId: string) {
  const cookieStore = await cookies();

  cookieStore.set(
    youthManagementAccessCookieName,
    createYouthManagementAccessValue(userId),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    },
  );
}

export async function clearYouthManagementAccess() {
  const cookieStore = await cookies();

  cookieStore.delete(youthManagementAccessCookieName);
}

export async function hasYouthManagementAccess(userId: string) {
  const cookieStore = await cookies();
  const value = cookieStore.get(youthManagementAccessCookieName)?.value;

  if (!value) {
    return false;
  }

  return verifyYouthManagementAccessValue(value, userId);
}

export function createYouthManagementAccessValue(userId: string) {
  const payload = encodePayload({
    purpose: youthManagementAccessPurpose,
    userId,
  });
  const signature = sign(payload);

  return `${payload}.${signature}`;
}

export function verifyYouthManagementAccessValue(
  value: string,
  userId: string,
) {
  const parts = value.split(".");

  if (parts.length !== 2) {
    return false;
  }

  const [payload, signature] = parts;

  if (!payload || !signature || !verifySignature(payload, signature)) {
    return false;
  }

  const parsed = decodePayload(payload);

  if (!parsed) {
    return false;
  }

  return (
    parsed.purpose === youthManagementAccessPurpose && parsed.userId === userId
  );
}

function encodePayload(payload: YouthManagementAccessPayload) {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function decodePayload(value: string): YouthManagementAccessPayload | null {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));

    if (
      parsed.purpose !== youthManagementAccessPurpose ||
      typeof parsed.userId !== "string"
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
    process.env.AUTH_SECRET ?? "dev-only-change-this-secret-before-production"
  );
}
