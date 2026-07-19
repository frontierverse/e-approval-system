type EmptyStateProps = {
  title: string;
  description: string;
  action?: React.ReactNode;
};

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <section className="flex min-h-56 flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--surface)] px-6 py-10 text-center sm:min-h-72 sm:py-12">
      <span
        aria-hidden="true"
        className="mb-4 grid size-11 place-items-center rounded-full bg-[var(--brand-soft)] text-[var(--brand)]"
      >
        <svg
          className="size-5"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          viewBox="0 0 24 24"
        >
          <path d="M4 6h16" />
          <path d="M7 10h10" />
          <path d="M9 14h6" />
          <path d="M11 18h2" />
        </svg>
      </span>
      <p className="text-lg font-semibold text-[var(--foreground)]">{title}</p>
      <p className="mt-2 max-w-md text-sm leading-6 text-[var(--text-muted)]">
        {description}
      </p>
      {action ? <div className="mt-6">{action}</div> : null}
    </section>
  );
}
