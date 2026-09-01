"use client";

import Link from "next/link";
import { useEffect } from "react";
import { buttonClass, buttonStyles } from "@/lib/button-styles";
import { getSafeErrorDigest } from "@/lib/observability";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const digest = getSafeErrorDigest(error);

  useEffect(() => {
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "error",
        event: "client.segment_error",
        digest,
      }),
    );
  }, [digest]);

  return (
    <section
      aria-live="assertive"
      className="rounded-xl border border-[#f0c6c6] bg-[var(--surface)] p-6 shadow-sm"
    >
      <h1 className="text-xl font-semibold text-[#8a1f1f]">
        화면을 불러오지 못했습니다
      </h1>
      <p className="mt-2 text-sm leading-6 text-[#697386]">
        잠시 후 다시 시도해 주세요. 같은 문제가 반복되면 화면 이름과 발생 시각을 관리자에게 알려 주세요.
      </p>
      {digest ? (
        <p className="mt-2 text-xs text-[#697386]">
          오류 참조: <code>{digest}</code>
        </p>
      ) : null}
      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={reset}
          className={buttonClass(
            buttonStyles.base,
            buttonStyles.primary,
            "h-10 px-4 text-sm",
          )}
        >
          다시 시도
        </button>
        <Link
          href="/"
          className={buttonClass(
            buttonStyles.base,
            buttonStyles.neutral,
            "h-10 px-4 text-sm",
          )}
        >
          홈으로 이동
        </Link>
      </div>
    </section>
  );
}
