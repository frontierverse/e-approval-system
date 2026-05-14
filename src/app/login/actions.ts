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
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!name || !password) {
    return { error: "이름과 비밀번호를 입력하세요." };
  }

  const users = await prisma.user.findMany({
    where: {
      name,
      status: UserStatus.ACTIVE,
    },
    select: {
      id: true,
      passwordHash: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  });
  const user = users.find(
    (candidate) =>
      candidate.passwordHash &&
      verifyPassword(password, candidate.passwordHash),
  );

  if (!user) {
    return { error: "이름 또는 비밀번호가 올바르지 않습니다." };
  }

  await createSession(user.id);
  redirect("/");
}

export async function logoutAction() {
  await clearSession();
  redirect("/login");
}
