import Link from "next/link";

export type ShellQuickStatusItem = {
  href: string;
  label: string;
  value: number | string;
};

export function ShellQuickStatusLinks({
  ariaLabel = "빠른 현황",
  items,
}: {
  ariaLabel?: string;
  items: ShellQuickStatusItem[];
}) {
  return (
    <nav className="mt-3" aria-label={ariaLabel}>
      <ul className="space-y-1.5 text-sm">
        {items.map((item) => (
          <li key={item.label}>
            <Link
              href={item.href}
              className="flex min-h-7 items-center justify-between gap-3 rounded-md px-2 py-1 text-[#697386] transition hover:bg-white hover:text-[#0f5553] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d7eceb]"
            >
              <span>{item.label}</span>
              <span className="font-semibold tabular-nums text-[#16181d]">
                {item.value}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function ShellQuickStatusFallback() {
  return (
    <div className="mt-3 space-y-1.5 text-sm" aria-label="빠른 현황 불러오는 중">
      {["받은결재", "임시저장", "제출문서", "완료문서", "보관 검토"].map(
        (label) => (
          <div
            key={label}
            className="flex min-h-7 items-center justify-between gap-3 px-2 py-1"
          >
            <span className="text-[#697386]">{label}</span>
            <span className="font-semibold text-[#16181d]">-</span>
          </div>
        ),
      )}
    </div>
  );
}
