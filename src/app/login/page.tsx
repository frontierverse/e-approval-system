import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { LoginForm } from "@/components/login-form";
import { ThemeToggle } from "@/components/theme-toggle";
import { getCurrentUser } from "@/lib/auth";
import { appDescription, appName, organizationName } from "@/lib/branding";

export const metadata: Metadata = {
  title: "사내 시스템 로그인",
  description: appDescription,
  alternates: {
    canonical: "/login",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default async function LoginPage() {
  const user = await getCurrentUser();

  if (user) {
    redirect("/");
  }

  return (
    <main className="relative grid min-h-screen place-items-center bg-[var(--background)] px-4 py-10 text-[var(--foreground)]">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <section className="grid w-full max-w-4xl overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-xl md:grid-cols-[minmax(0,0.9fr)_minmax(24rem,1.1fr)]">
        <div className="relative hidden overflow-hidden bg-[var(--brand)] p-10 text-white md:flex md:flex-col md:justify-between">
          <div
            aria-hidden="true"
            className="absolute -right-20 -top-20 size-72 rounded-full border-[3rem] border-white/10"
          />
          <div className="relative">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/75">
              Bajaul Workspace
            </p>
            <p className="mt-6 max-w-sm text-3xl font-semibold leading-tight">
              결재와 사내 업무를<br />한곳에서 빠르게
            </p>
            <p className="mt-4 max-w-sm text-sm leading-6 text-white/75">
              필요한 문서를 찾고, 결재하고, 업무 현황을 확인하는 내부 업무 공간입니다.
            </p>
          </div>
          <div className="relative border-t border-white/20 pt-5 text-sm text-white/80">
            {organizationName}
          </div>
        </div>

        <div className="p-6 sm:p-10 md:p-12">
          <div className="inline-flex size-11 items-center justify-center rounded-xl bg-[var(--brand-soft)] text-lg font-bold text-[var(--brand)]">
            바
          </div>
          <h1 className="mt-6 text-2xl font-semibold tracking-tight">
            {appName} 업무 시스템
          </h1>
          <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
            등록된 이름과 비밀번호로 로그인하세요.
          </p>

          <LoginForm />

          <p className="mt-8 border-t border-[var(--border)] pt-5 text-center text-xs text-[var(--text-muted)]">
            내부 직원 전용 시스템 · 계정 문의는 관리자에게 연락하세요.
          </p>
        </div>
      </section>
    </main>
  );
}
