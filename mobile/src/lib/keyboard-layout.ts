export type KeyboardRectangle = { screenX: number; screenY: number; width: number; height: number };
export type ScreenRectangle = { x: number; y: number; width: number; height: number };

/** Only reserve the part of a bottom-docked keyboard covering this screen. */
export function keyboardOverlap(screen: ScreenRectangle, keyboard: KeyboardRectangle | undefined, bottomInset = 0): number {
  if (!keyboard || !Object.values(screen).every(Number.isFinite) || !Object.values(keyboard).every(Number.isFinite)) return 0;
  if (screen.width <= 0 || screen.height <= 0 || keyboard.width <= 0 || keyboard.height <= 0) return 0;
  const bottom = screen.y + screen.height;
  // Floating/split keyboards must not lift an entire screen above their top edge.
  // Android reports keyboard height without the navigation-bar inset.
  const inset = Number.isFinite(bottomInset) ? Math.max(0, bottomInset) : 0;
  if (keyboard.screenX > screen.x + 1 || keyboard.screenX + keyboard.width < screen.x + screen.width - 1 || keyboard.screenY + keyboard.height < bottom - inset - 1) return 0;
  return Math.min(screen.height, Math.max(0, bottom - keyboard.screenY));
}

/** Reveal an input only when it lies outside the resized scroll viewport. */
export function keyboardScrollOffset(top: number, inputHeight: number, offset: number, viewportHeight: number): number {
  if (![top, inputHeight, offset, viewportHeight].every(Number.isFinite) || inputHeight <= 0 || viewportHeight <= 16) return offset;
  if (top < offset + 8) return Math.max(0, top - 8);
  const bottom = top + Math.min(inputHeight, viewportHeight - 16);
  return bottom > offset + viewportHeight - 8 ? Math.max(0, bottom - viewportHeight + 8) : offset;
}
