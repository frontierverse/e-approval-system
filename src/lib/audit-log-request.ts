import "server-only";

import { headers } from "next/headers";
import {
  getLoginRequestInfo,
  type LoginRequestInfo,
} from "@/lib/login-history-core";

export type AuditLogRequestData = {
  ipAddress?: string | null;
  userAgent?: string | null;
  browser?: string | null;
  os?: string | null;
  device?: string | null;
  country?: string | null;
  region?: string | null;
  city?: string | null;
};

export async function getCurrentAuditLogRequestData(): Promise<AuditLogRequestData> {
  try {
    return getAuditLogRequestData(getLoginRequestInfo(await headers()));
  } catch {
    return {};
  }
}

export function getAuditLogRequestData(
  requestInfo?: LoginRequestInfo | null,
): AuditLogRequestData {
  if (!requestInfo) {
    return {};
  }

  return {
    ipAddress: requestInfo.ipAddress,
    userAgent: requestInfo.userAgent,
    browser: requestInfo.browser,
    os: requestInfo.os,
    device: requestInfo.device,
    country: requestInfo.country,
    region: requestInfo.region,
    city: requestInfo.city,
  };
}
