"use client";

import {
  useEffect,
  useRef,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

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
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    function closeFromEscape(event: globalThis.KeyboardEvent) {
      if (event.defaultPrevented || event.key !== "Escape") {
        return;
      }

      const dialogs = Array.from(
        document.querySelectorAll<HTMLElement>("[data-app-modal='true']"),
      );
      const topmostDialog = dialogs[dialogs.length - 1];

      if (topmostDialog !== dialogRef.current) {
        return;
      }

      event.preventDefault();
      onClose();
    }

    document.addEventListener("keydown", closeFromEscape);

    return () => {
      document.removeEventListener("keydown", closeFromEscape);
    };
  }, [onClose]);

  function closeFromBackdrop(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }

  const modal = (
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
          "max-h-[calc(100vh-3rem)] w-full overflow-hidden rounded-md border border-[#d9dee7] bg-white shadow-xl",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        data-app-modal="true"
        ref={dialogRef}
        role="dialog"
        style={style}
      >
        {children}
      </section>
    </div>
  );

  return typeof document === "undefined"
    ? modal
    : createPortal(modal, document.body);
}
