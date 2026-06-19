"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { UserStatus } from "@/generated/prisma/client";
import { createSession, clearSession } from "@/lib/session";
import { getLoginRequestInfo, type LoginFailureReason } from "@/lib/login-history-core";
import { recordLoginHistory } from "@/lib/login-history";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { ensureStaffLeaveAccrualsForUser } from "@/lib/staff-leave";

type LoginState = {
  error?: string;
};

export async function loginAction(
  _state: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const requestInfo = getLoginRequestInfo(await headers());

  if (!name || !password) {
    await recordLoginHistory({
      attemptedName: name,
      success: false,
      failureReason: "missing_credentials",
      requestInfo,
    });

    return { error: "이름과 비밀번호를 입력하세요." };
  }

  const users = await prisma.user.findMany({
    where: {
      name,
    },
    select: {
      id: true,
      passwordHash: true,
      status: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  const user = users.find(
    (candidate) =>
      candidate.status === UserStatus.ACTIVE &&
      candidate.passwordHash &&
      verifyPassword(password, candidate.passwordHash),
  );

  if (!user) {
    const matchedInactiveUser = users.find(
      (candidate) =>
        candidate.status !== UserStatus.ACTIVE &&
        candidate.passwordHash &&
        verifyPassword(password, candidate.passwordHash),
    );
    const failureReason: LoginFailureReason = matchedInactiveUser
      ? "inactive_user"
      : users.length > 0 && users.every((candidate) => !candidate.passwordHash)
        ? "no_password"
        : "invalid_credentials";

    await recordLoginHistory({
      attemptedName: name,
      userId: matchedInactiveUser?.id ?? null,
      success: false,
      failureReason,
      requestInfo,
    });

    return { error: "이름 또는 비밀번호가 올바르지 않습니다." };
  }

  await recordLoginHistory({
    attemptedName: name,
    userId: user.id,
    success: true,
    requestInfo,
  });
  await ensureStaffLeaveAccrualsForUser(user.id);

  await createSession(user.id);
  redirect("/");
}

export async function logoutAction() {
  await clearSession();
  redirect("/login");
}
