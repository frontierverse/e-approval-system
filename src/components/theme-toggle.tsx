export function ThemeToggle() {
  return (
    <button
      type="button"
      data-theme-toggle
      aria-label="테마 변경"
      title="테마 변경"
      className="relative inline-grid h-9 w-[4.75rem] grid-cols-2 items-center rounded-full border border-[#cfd6e3] bg-white p-1 text-sm font-semibold transition hover:bg-[#f7f9fc]"
    >
      <span
        data-theme-toggle-thumb
        className="absolute left-1 top-1 size-7 rounded-full bg-[#196b69] shadow-sm transition-transform"
        aria-hidden="true"
      />
      <span
        data-theme-toggle-sun
        className="relative grid size-7 place-items-center transition-colors"
        aria-hidden="true"
      >
        <svg
          viewBox="0 0 24 24"
          className="size-4"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2" />
          <path d="M12 20v2" />
          <path d="m4.93 4.93 1.41 1.41" />
          <path d="m17.66 17.66 1.41 1.41" />
          <path d="M2 12h2" />
          <path d="M20 12h2" />
          <path d="m6.34 17.66-1.41 1.41" />
          <path d="m19.07 4.93-1.41 1.41" />
        </svg>
      </span>
      <span
        data-theme-toggle-moon
        className="relative grid size-7 place-items-center transition-colors"
        aria-hidden="true"
      >
        <svg
          viewBox="0 0 24 24"
          className="size-4"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        >
          <path d="M20.99 12.72A8.5 8.5 0 1 1 11.28 3.01 6.5 6.5 0 0 0 20.99 12.72Z" />
        </svg>
      </span>
      <span className="sr-only">
        테마 변경
      </span>
    </button>
  );
}
