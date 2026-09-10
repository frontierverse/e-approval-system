"use client";

import { useLayoutEffect, useRef, type KeyboardEvent, type PointerEvent } from "react";

type Position = { x: number; y: number };
type Drag = {
  pointerId: number;
  handle: HTMLButtonElement;
  start: Position;
  origin: Position;
  previous: Position | null;
  moved: boolean;
};

function readPosition(key: string): Position | null {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "null");
    return value && Number.isFinite(value.x) && Number.isFinite(value.y)
      ? { x: value.x, y: value.y } : null;
  } catch { return null; }
}

function savePosition(key: string, position: Position | null) {
  try {
    if (position) localStorage.setItem(key, JSON.stringify(position));
    else localStorage.removeItem(key);
  } catch { /* Moving the window also works when browser storage is unavailable. */ }
}

function positionWindow(panel: HTMLElement, preferred: Position | null): Position {
  const viewport = window.visualViewport;
  const width = viewport?.width ?? window.innerWidth;
  const height = viewport?.height ?? window.innerHeight;
  const offsetX = viewport?.offsetLeft ?? 0;
  const offsetY = viewport?.offsetTop ?? 0;
  const style = getComputedStyle(panel);
  // Custom properties retain max()/env() text. Scroll padding resolves these
  // lengths without adding padding to the chat's layout.
  const inset = (edge: string) => parseFloat(style.getPropertyValue(`scroll-padding-${edge}`)) || 8;
  const left = offsetX + inset("left");
  const top = offsetY + inset("top");
  // The page reserves a scrollbar gutter, which is included in some viewport
  // measurements. Keep the window out of that noninteractive strip as well.
  const layoutWidth = Math.min(document.documentElement.clientWidth, document.documentElement.getBoundingClientRect().width);
  const right = Math.min(offsetX + width, layoutWidth) - inset("right");
  const bottom = Math.min(offsetY + height, document.documentElement.clientHeight) - inset("bottom");
  panel.style.setProperty("--chat-available-width", `${Math.max(0, right - left)}px`);
  panel.style.setProperty("--chat-available-height", `${Math.max(0, bottom - top)}px`);
  // Clear the previous coordinates to measure the CSS default when resetting.
  if (!preferred) {
    panel.style.removeProperty("left");
    panel.style.removeProperty("top");
    panel.style.removeProperty("right");
    panel.style.removeProperty("bottom");
  }
  const rect = panel.getBoundingClientRect();
  const desired = preferred ?? { x: rect.x, y: rect.y };
  const position = {
    x: Math.max(left, Math.min(desired.x, right - rect.width)),
    y: Math.max(top, Math.min(desired.y, bottom - rect.height)),
  };
  panel.style.left = `${position.x}px`;
  panel.style.top = `${position.y}px`;
  panel.style.right = "auto";
  panel.style.bottom = "auto";
  return position;
}

function releaseDrag(drag: Drag, panel: HTMLElement | null) {
  panel?.removeAttribute("data-dragging");
  if (drag.handle.hasPointerCapture(drag.pointerId)) drag.handle.releasePointerCapture(drag.pointerId);
}

export function useStaffChatPosition(open: boolean, userId: string) {
  const panelRef = useRef<HTMLElement>(null);
  const preferredRef = useRef<Position | null>(null);
  const loadedKeyRef = useRef<string | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const storageKey = `staff-chat-position:v1:${userId}`;

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!open || !panel) return;
    if (loadedKeyRef.current !== storageKey) {
      preferredRef.current = readPosition(storageKey);
      loadedKeyRef.current = storageKey;
    }
    positionWindow(panel, preferredRef.current);
    let frame = 0;
    const onResize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const drag = dragRef.current;
        if (drag) {
          dragRef.current = null;
          preferredRef.current = drag.previous;
          releaseDrag(drag, panel);
        }
        positionWindow(panel, preferredRef.current);
      });
    };
    const observer = new ResizeObserver(onResize);
    observer.observe(panel);
    window.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("scroll", onResize);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("scroll", onResize);
      const drag = dragRef.current;
      dragRef.current = null;
      if (drag) releaseDrag(drag, panel);
    };
  }, [open, storageKey]);

  function cancelDrag() {
    const drag = dragRef.current;
    if (!drag) return false;
    dragRef.current = null;
    preferredRef.current = drag.previous;
    releaseDrag(drag, panelRef.current);
    if (panelRef.current) positionWindow(panelRef.current, drag.previous);
    return true;
  }

  function resetPosition() {
    cancelDrag();
    preferredRef.current = null;
    savePosition(storageKey, null);
    if (panelRef.current) positionWindow(panelRef.current, null);
  }

  function onPointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (!event.isPrimary || event.button !== 0 || !panelRef.current || dragRef.current) return;
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    const rect = panelRef.current.getBoundingClientRect();
    dragRef.current = {
      pointerId: event.pointerId, handle: event.currentTarget,
      start: { x: event.clientX, y: event.clientY }, origin: { x: rect.x, y: rect.y },
      previous: preferredRef.current, moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    const panel = panelRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !panel) return;
    const dx = event.clientX - drag.start.x;
    const dy = event.clientY - drag.start.y;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    drag.moved = true;
    panel.setAttribute("data-dragging", "true");
    preferredRef.current = positionWindow(panel, { x: drag.origin.x + dx, y: drag.origin.y + dy });
  }

  function onPointerUp(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    onPointerMove(event);
    dragRef.current = null;
    releaseDrag(drag, panelRef.current);
    if (drag.moved) savePosition(storageKey, preferredRef.current);
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.nativeEvent.isComposing) return;
    const step = event.shiftKey ? 48 : 16;
    const directions: Record<string, Position> = {
      ArrowLeft: { x: -step, y: 0 }, ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: -step }, ArrowDown: { x: 0, y: step },
    };
    const direction = directions[event.key];
    const panel = panelRef.current;
    if (!direction || !panel || dragRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = panel.getBoundingClientRect();
    preferredRef.current = positionWindow(panel, { x: rect.x + direction.x, y: rect.y + direction.y });
    savePosition(storageKey, preferredRef.current);
  }

  return {
    panelRef, cancelDrag, resetPosition,
    handleProps: {
      onPointerDown, onPointerMove, onPointerUp, onKeyDown,
      onPointerCancel: cancelDrag, onLostPointerCapture: cancelDrag,
    },
  };
}
