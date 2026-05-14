import "server-only";

import { prisma } from "@/lib/prisma";
import type {
  LoginFailureReason,
  LoginRequestInfo,
} from "@/lib/login-history-core";

type RecordLoginHistoryInput = {
  attemptedName: string;
  userId?: string | null;
  success: boolean;
  failureReason?: LoginFailureReason | null;
  requestInfo: LoginRequestInfo;
};

export async function recordLoginHistory(input: RecordLoginHistoryInput) {
  try {
    await prisma.loginHistory.create({
      data: {
        attemptedName: input.attemptedName,
        userId: input.userId ?? null,
        success: input.success,
        failureReason: input.failureReason ?? null,
        ipAddress: input.requestInfo.ipAddress,
        userAgent: input.requestInfo.userAgent,
        browser: input.requestInfo.browser,
        os: input.requestInfo.os,
        device: input.requestInfo.device,
        country: input.requestInfo.country,
        region: input.requestInfo.region,
        city: input.requestInfo.city,
      },
    });
  } catch (error) {
    console.error("Failed to record login history", error);
  }
}
