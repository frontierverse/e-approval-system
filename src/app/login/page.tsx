import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { ThemeToggle } from "@/components/theme-toggle";
import { getCurrentUser } from "@/lib/auth";
import { appName, organizationName } from "@/lib/branding";

export default async function LoginPage() {
  const user = await getCurrentUser();

  if (user) {
    redirect("/");
  }

  return (
    <main className="relative grid min-h-screen place-items-center bg-[#f6f7f9] px-4 py-10 text-[#16181d]">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <section className="w-full max-w-md rounded-md border border-[#d9dee7] bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-md bg-[#196b69] text-base font-bold text-white">
            결
          </span>
          <div>
            <h1 className="text-xl font-semibold">{appName} 로그인</h1>
            <p className="mt-1 text-sm text-[#697386]">
              {organizationName}
            </p>
          </div>
        </div>

        <LoginForm />

        <div className="mt-6 rounded-md bg-[#f7f9fc] px-4 py-3 text-sm leading-6 text-[#697386]">
          <p className="font-semibold text-[#394150]">테스트 계정</p>
          <p>관리자: minjun.kim@company.local</p>
          <p>일반 사용자: seoyeon.lee@company.local</p>
          <p>비밀번호: password123</p>
        </div>
      </section>
    </main>
  );
}
