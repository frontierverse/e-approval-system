import type { Metadata } from "next";
import Link from "next/link";
import { appName, organizationName } from "@/lib/branding";

import { mobileAppInfo } from "@/lib/mobile-app-info";

const { supportEmail } = mobileAppInfo;

export const metadata: Metadata = {
  title: "모바일 앱 지원",
  description: `${appName} 직원용 모바일 앱의 계정, 로그인, 사용 문의 안내`,
  alternates: { canonical: "https://www.bajaul.com/mobile-app/support" },
};

export default function MobileAppSupportPage() {
  return (
    <main className="min-h-screen bg-[var(--background)] px-4 py-6 text-[var(--foreground)] sm:py-8">
      <div className="mx-auto max-w-2xl">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{appName} 앱 지원</h1>
            <p className="mt-2 text-sm leading-6">{organizationName}</p>
          </div>
          <button
            type="button"
            data-theme-toggle
            aria-label="화면 테마 변경"
            className="min-h-11 shrink-0 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm font-medium hover:bg-[var(--surface-muted)]"
          >
            테마 변경
          </button>
        </header>

        <section aria-labelledby="contact-heading" className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
          <h2 id="contact-heading" className="text-lg font-semibold">앱 관리자에게 문의하기</h2>
          <p className="mt-2 text-sm leading-6">계정 등록, 로그인, 앱 사용 중 발생한 문제는 아래 이메일로 문의해 주세요.</p>
          <a
            href={`mailto:${supportEmail}`}
            className="mt-3 inline-flex min-h-11 max-w-full items-center rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-semibold break-all text-white hover:underline underline-offset-4"
          >
            {supportEmail}
          </a>
          <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">
            문의에는 사용 중인 기기 종류, 앱 버전, 문제 발생 시간과 상황을 적어 주세요.
            비밀번호·인증번호·업무 문서·직원 및 청소년의 개인정보는 보내지 마세요.
          </p>
        </section>

        <section aria-labelledby="access-heading" className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
          <h2 id="access-heading" className="text-lg font-semibold">직원 계정과 앱 사용</h2>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-6">
            <li>기관에 등록된 활성 직원 계정으로 이용할 수 있습니다.</li>
            <li>기기를 변경했거나 계정 사용이 어려우면 앱 관리자에게 연락해 주세요.</li>
            <li>문서와 업무 정보는 직원에게 부여된 권한에 따라 제공됩니다.</li>
          </ul>
        </section>

        <nav aria-label="관련 페이지" className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <Link href="/mobile-app/privacy" className="inline-flex min-h-11 items-center text-[var(--foreground)] underline underline-offset-4">개인정보처리방침</Link>
          <Link href="/login" className="inline-flex min-h-11 items-center font-medium text-[var(--foreground)] underline underline-offset-4">업무 시스템 로그인</Link>
          <a href="https://youth.bajaul.com/" className="inline-flex min-h-11 items-center text-[var(--foreground)] underline underline-offset-4">기관 홈페이지</a>
        </nav>
      </div>
    </main>
  );
}
