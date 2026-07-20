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
  mobileFullscreen = false,
  onClose,
  returnFocusTo,
  style,
}: {
  children: ReactNode;
  className?: string;
  describedBy?: string;
  label?: string;
  labelledBy?: string;
  mobileFullscreen?: boolean;
  onClose: () => void;
  returnFocusTo?: HTMLElement | null;
  style?: CSSProperties;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    const previouslyFocusedElement =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const focusReturnTarget = returnFocusTo ?? previouslyFocusedElement;
    const previousBodyOverflow = document.body.style.overflow;
    const focusFrame = window.requestAnimationFrame(() => {
      const focusableElements = getFocusableElements(dialog);
      const initialFocusTarget =
        dialog?.querySelector<HTMLElement>("[data-modal-initial-focus]") ??
        focusableElements[0] ??
        dialog;

      initialFocusTarget?.focus({ preventScroll: true });
    });

    document.body.style.overflow = "hidden";

    function handleDialogKeyboard(event: globalThis.KeyboardEvent) {
      const dialogs = Array.from(
        document.querySelectorAll<HTMLElement>("[data-app-modal='true']"),
      );
      const topmostDialog = dialogs[dialogs.length - 1];

      if (topmostDialog !== dialog || event.defaultPrevented) {
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusableElements = getFocusableElements(dialog);

      if (focusableElements.length === 0) {
        event.preventDefault();
        dialog?.focus({ preventScroll: true });
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;

      if (event.shiftKey && activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (
        !event.shiftKey &&
        (activeElement === lastElement || !dialog?.contains(activeElement))
      ) {
        event.preventDefault();
        firstElement.focus();
      }
    }

    document.addEventListener("keydown", handleDialogKeyboard);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleDialogKeyboard);
      document.body.style.overflow = previousBodyOverflow;

      if (focusReturnTarget?.isConnected) {
        focusReturnTarget.focus({ preventScroll: true });
      }
    };
  }, [returnFocusTo]);

  function closeFromBackdrop(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }

  const modal = (
    <div
      className={[
        "fixed inset-0 z-50 flex items-center justify-center bg-[#111827]/40",
        mobileFullscreen ? "p-0 sm:px-4 sm:py-6" : "px-4 py-6",
      ].join(" ")}
      onMouseDown={closeFromBackdrop}
      role="presentation"
    >
      <section
        aria-describedby={describedBy}
        aria-label={label}
        aria-labelledby={labelledBy}
        aria-modal="true"
        className={[
          mobileFullscreen
            ? "h-dvh max-h-dvh w-full overflow-hidden border-0 bg-[var(--surface)] shadow-2xl sm:h-auto sm:max-h-[calc(100dvh-3rem)] sm:rounded-xl sm:border sm:border-[var(--border)]"
            : "max-h-[calc(100dvh-3rem)] w-full overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        data-app-modal="true"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
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

function getFocusableElements(container: HTMLElement | null) {
  if (!container) {
    return [];
  }

  const selector = [
    "a[href]",
    "button:not(:disabled)",
    "input:not(:disabled):not([type='hidden'])",
    "select:not(:disabled)",
    "textarea:not(:disabled)",
    "[tabindex]:not([tabindex='-1'])",
  ].join(",");

  return Array.from(container.querySelectorAll<HTMLElement>(selector)).filter(
    (element) =>
      element.getAttribute("aria-hidden") !== "true" &&
      element.getClientRects().length > 0,
  );
}
