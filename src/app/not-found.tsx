import Link from "next/link";
import { buttonClass, buttonStyles } from "@/lib/button-styles";

export default function NotFound() {
  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-6 py-12 text-center shadow-sm">
      <p className="text-sm font-semibold text-[var(--brand)]">404</p>
      <h1 className="mt-2 text-2xl font-semibold text-[var(--foreground)]">
        요청한 화면을 찾을 수 없습니다
      </h1>
      <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-[var(--text-muted)]">
        주소가 변경되었거나 접근할 수 없는 화면입니다. 홈에서 필요한 메뉴를 다시 선택해 주세요.
      </p>
      <Link
        href="/"
        className={buttonClass(
          buttonStyles.base,
          buttonStyles.primary,
          "mt-6 h-10 px-4 text-sm",
        )}
      >
        홈으로 이동
      </Link>
    </section>
  );
}
