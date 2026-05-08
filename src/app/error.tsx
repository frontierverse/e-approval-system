"use client";

import { buttonClass, buttonStyles } from "@/lib/button-styles";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="rounded-md border border-[#f0c6c6] bg-white p-6">
      <h1 className="text-xl font-semibold text-[#8a1f1f]">
        화면을 불러오지 못했습니다
      </h1>
      <p className="mt-2 text-sm leading-6 text-[#697386]">
        잠시 후 다시 시도하거나, 같은 문제가 반복되면 개발 로그를 확인합니다.
      </p>
      <button
        type="button"
        onClick={reset}
        className={buttonClass(
          buttonStyles.base,
          buttonStyles.primary,
          "mt-5 h-10 px-4 text-sm",
        )}
      >
        다시 시도
      </button>
    </section>
  );
}
