"use server";

import { redirect } from "next/navigation";
import { UserStatus } from "@/generated/prisma/client";
import { createSession, clearSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";

type LoginState = {
  error?: string;
};

export async function loginAction(
  _state: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "이메일과 비밀번호를 입력하세요." };
  }

  const user = await prisma.user.findUnique({
    where: {
      email,
    },
  });

  if (
    !user ||
    user.status !== UserStatus.ACTIVE ||
    !user.passwordHash ||
    !verifyPassword(password, user.passwordHash)
  ) {
    return { error: "이메일 또는 비밀번호가 올바르지 않습니다." };
  }

  await createSession(user.id);
  redirect("/");
}

export async function logoutAction() {
  await clearSession();
  redirect("/login");
}
