import type { CSSProperties, MouseEvent, ReactNode } from "react";

export function AppModal({
  children,
  className = "",
  describedBy,
  label,
  labelledBy,
  onClose,
  style,
}: {
  children: ReactNode;
  className?: string;
  describedBy?: string;
  label?: string;
  labelledBy?: string;
  onClose: () => void;
  style?: CSSProperties;
}) {
  function closeFromBackdrop(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#111827]/40 px-4 py-6"
      onMouseDown={closeFromBackdrop}
      role="presentation"
    >
      <section
        aria-describedby={describedBy}
        aria-label={label}
        aria-labelledby={labelledBy}
        aria-modal="true"
        className={[
          "max-h-[calc(100vh-3rem)] w-full overflow-hidden rounded-md bg-white shadow-xl",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        data-app-modal="true"
        role="dialog"
        style={style}
      >
        {children}
      </section>
    </div>
  );
}
