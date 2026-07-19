import Link from "next/link";

export type QuickStatusLink = {
  href?: string;
  label: string;
  meta?: string;
  note: string;
  tone?: "brand" | "warning" | "danger" | "neutral";
  unit?: string;
  value: string;
};

const toneStyles = {
  brand: {
    accent: "bg-[var(--brand)]",
    arrow:
      "bg-[var(--brand-soft)] text-[var(--brand)] group-hover:bg-[var(--brand)] group-hover:text-white",
    meta: "bg-[var(--brand-soft)] text-[var(--brand)]",
    value: "text-[var(--brand)]",
  },
  warning: {
    accent: "bg-amber-500 dark:bg-amber-400",
    arrow:
      "bg-amber-50 text-amber-700 group-hover:bg-amber-600 group-hover:text-white dark:bg-amber-400/10 dark:text-amber-300 dark:group-hover:bg-amber-400 dark:group-hover:text-[#16181d]",
    meta:
      "bg-amber-50 text-amber-800 dark:bg-amber-400/10 dark:text-amber-200",
    value: "text-amber-700 dark:text-amber-300",
  },
  danger: {
    accent: "bg-[var(--danger)]",
    arrow:
      "bg-red-50 text-[var(--danger)] group-hover:bg-[var(--danger)] group-hover:text-white dark:bg-red-400/10",
    meta:
      "bg-red-50 text-[var(--danger)] dark:bg-red-400/10 dark:text-red-300",
    value: "text-[var(--danger)]",
  },
  neutral: {
    accent: "bg-[var(--border-strong)]",
    arrow:
      "bg-[var(--surface-muted)] text-[var(--text-muted)] group-hover:bg-[var(--foreground)] group-hover:text-[var(--surface)]",
    meta: "bg-[var(--surface-muted)] text-[var(--text-muted)]",
    value: "text-[var(--foreground)]",
  },
} as const;

const cardClassName =
  "relative grid min-h-16 min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-left shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:min-h-[4.25rem] sm:px-3.5";

export function QuickStatusLinks({
  ariaLabel = "빠른 현황",
  items,
}: {
  ariaLabel?: string;
  items: QuickStatusLink[];
}) {
  const gridClassName = getGridClassName(items.length);

  return (
    <section className={gridClassName} aria-label={ariaLabel}>
      {items.map((item) => (
        <QuickStatusCard key={item.label} item={item} />
      ))}
    </section>
  );
}

function getGridClassName(itemCount: number) {
  if (itemCount <= 1) {
    return "grid grid-cols-1 gap-2";
  }

  if (itemCount === 2) {
    return "grid grid-cols-2 gap-2";
  }

  if (itemCount === 3) {
    return "grid grid-cols-2 gap-2 lg:grid-cols-3 lg:gap-3";
  }

  return "grid grid-cols-2 gap-2 lg:grid-cols-4 lg:gap-3";
}

function QuickStatusCard({ item }: { item: QuickStatusLink }) {
  const tone = item.tone ?? "neutral";
  const styles = toneStyles[tone];
  const content = (
    <>
      <span
        aria-hidden="true"
        className={`absolute inset-y-0 left-0 w-1 ${styles.accent}`}
      />

      <div className="min-w-0 pl-0.5">
        <p className="text-xs font-semibold leading-4 text-[var(--foreground)] sm:text-sm sm:leading-5">
          {item.label}
        </p>
        {item.meta ? (
          <p
            className={`sr-only max-w-full rounded-full px-1.5 py-0.5 text-[0.6875rem] font-semibold leading-4 sm:not-sr-only sm:mt-0.5 sm:inline-flex ${styles.meta}`}
          >
            {item.meta}
          </p>
        ) : null}
        <p className="sr-only">{item.note}</p>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <p className="flex items-baseline gap-1 whitespace-nowrap">
          <span
            className={`text-2xl font-semibold leading-none tracking-[-0.025em] tabular-nums ${styles.value}`}
          >
            {item.value}
          </span>
          {item.unit ? (
            <>
              {" "}
              <span className="text-xs font-semibold text-[var(--text-muted)] sm:text-sm">
                {item.unit}
              </span>
            </>
          ) : null}
        </p>

        {item.href ? (
          <span
            aria-hidden="true"
            className={`hidden size-6 shrink-0 place-items-center rounded-full transition-colors sm:grid ${styles.arrow}`}
          >
            <svg
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              className="size-3.5 transition-transform group-hover:translate-x-0.5"
            >
              <path
                d="m7 5 5 5-5 5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        ) : null}
      </div>
    </>
  );

  if (!item.href) {
    return (
      <div className={cardClassName} data-tone={tone}>
        {content}
      </div>
    );
  }

  return (
    <Link
      href={item.href}
      data-tone={tone}
      className={`${cardClassName} group min-h-11 touch-manipulation transition-[border-color,background-color,box-shadow] duration-150 hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)] hover:shadow-[0_4px_12px_rgba(15,23,42,0.07)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]`}
    >
      {content}
    </Link>
  );
}
