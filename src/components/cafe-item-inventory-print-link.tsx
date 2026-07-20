import Link from "next/link";
import { createCafeItemInventoryPrintHref } from "@/lib/cafe-items-core";

export function CafeItemInventoryPrintLink() {
  return (
    <Link
      aria-label="전체 카페 물품 상세 목록을 PDF로 출력(새 창)"
      href={createCafeItemInventoryPrintHref()}
      target="_blank"
      rel="noreferrer"
      className="inline-flex h-11 w-fit max-w-full items-center justify-center gap-2 justify-self-start rounded-md border border-[var(--brand)] bg-[var(--brand)] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--brand-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        className="h-5 w-5 shrink-0"
      >
        <path d="M7 3.75h7l3 3v13.5H7z" strokeLinejoin="round" />
        <path d="M14 3.75v3h3M9.5 11h5M9.5 14h5M9.5 17h3.5" />
      </svg>
      <span>전체 물품 PDF 출력</span>
    </Link>
  );
}
