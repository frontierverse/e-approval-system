import assert from "node:assert/strict";
import test from "node:test";
import { keyboardOverlap, keyboardScrollOffset } from "../mobile/src/lib/keyboard-layout";
import { createDraftRecoveryHarness } from "./helpers/mobile-draft-recovery-client.mjs";

const screen = { x: 0, y: 56, width: 390, height: 788 };
const docked = { screenX: 0, screenY: 544, width: 390, height: 300 };

test("measured viewport handles headers, native resize, taller keyboards and navigation bars", () => {
  assert.equal(keyboardOverlap(screen, docked), 300);
  assert.equal(keyboardOverlap({ ...screen, height: 488 }, docked), 0, "already resized native window must not be compensated twice");
  assert.equal(keyboardOverlap(screen, { ...docked, screenY: 444, height: 400 }), 400);
  assert.equal(keyboardOverlap(screen, { ...docked, height: 276 }, 24), 300, "Android keyboard height excludes the navigation bar");
  assert.equal(keyboardOverlap({ ...screen, y: 96, height: 724 }, { ...docked, height: 276 }), 276);
  assert.equal(keyboardOverlap(screen, { ...docked, screenY: -100, height: 944 }), 788);
});

test("hidden, floating, non-overlapping and invalid keyboard rectangles keep the viewport", () => {
  assert.equal(keyboardOverlap(screen, undefined), 0);
  assert.equal(keyboardOverlap(screen, { ...docked, screenY: 844 }), 0);
  assert.equal(keyboardOverlap(screen, { screenX: 200, screenY: 300, width: 190, height: 240 }), 0);
  assert.equal(keyboardOverlap(screen, { ...docked, screenY: 300, height: 240 }), 0);
  assert.equal(keyboardOverlap(screen, { ...docked, width: 0 }), 0);
  assert.equal(keyboardOverlap({ ...screen, height: NaN }, docked), 0);
  assert.equal(keyboardOverlap(screen, { ...docked, screenY: Infinity }), 0);
});

test("scroll target reveals last and previous inputs without moving a visible input", () => {
  assert.equal(keyboardScrollOffset(700, 60, 0, 300), 468);
  assert.equal(keyboardScrollOffset(700, 60, 468, 300), 468);
  assert.equal(keyboardScrollOffset(120, 48, 468, 300), 112);
  assert.equal(keyboardScrollOffset(700, 600, 0, 300), 692, "oversized input exposes its beginning rather than endlessly chasing its bottom");
  assert.equal(keyboardScrollOffset(NaN, 48, 100, 300), 100);
});

// Runs the unchanged production TSX against measured-view / keyboard boundaries.
// These lifecycle checks do not claim to exercise Yoga or a real OS keyboard.
function mountScreen(os = "android", visible: typeof docked | undefined = undefined) {
  const h = createDraftRecoveryHarness({ os });
  const state = { focused: true, metrics: visible, bounds: screen, dimensions: { width: 390, height: 844 }, animations: 0, callbacks: [] as Array<() => void>, deferred: false };
  h.mocks["expo-router"].useIsFocused = () => state.focused;
  h.mocks["react-native-safe-area-context"].useSafeAreaInsets = () => ({ bottom: 24 });
  const flatten = (value: unknown): Record<string, unknown> => Array.isArray(value)
    ? Object.assign({}, ...value.map(flatten)) : value && typeof value === "object" ? value as Record<string, unknown> : {};
  h.mocks["react-native"].StyleSheet.flatten = flatten;
  h.mocks["react-native"].useWindowDimensions = () => state.dimensions;
  h.mocks["react-native"].Keyboard = {
    metrics: () => state.metrics,
    scheduleLayoutAnimation: () => { state.animations++; },
    addListener: (name: string, callback: (event: unknown) => void) => {
      const bucket = h.state.listeners.get(name) ?? new Set();
      bucket.add(callback); h.state.listeners.set(name, bucket);
      return { remove: () => bucket.delete(callback) };
    },
  };
  const child = { type: "TextInput", props: { value: "작성 중인 내용" }, key: "stable" };
  const component = h.load("components/keyboard-screen.tsx").KeyboardScreen;
  const scope = h.mount(component, { style: { flex: 1, paddingBottom: 8 }, children: child });
  h.find(scope, "View").ref.current = { measureInWindow: (callback: (...values: number[]) => void) => {
    const { x, y, width, height } = state.bounds;
    const run = () => callback(x, y, width, height);
    if (state.deferred) state.callbacks.push(run); else run();
  } };
  const layout = () => { h.find(scope, "View").onLayout({ nativeEvent: { layout: state.bounds } }); scope.update(); };
  const event = (name: string, frame = docked) => { if (name.startsWith("keyboardDid")) state.metrics = name.includes("Hide") ? undefined : frame; h.event(name, { endCoordinates: frame }); scope.update(); };
  const padding = () => flatten(h.find(scope, "View").style).paddingBottom;
  layout();
  return { h, scope, state, child, layout, event, padding };
}

test("Android open, resize, emoji height and hide preserve the same input child", () => {
  const p = mountScreen();
  assert.equal(p.padding(), 8);
  p.event("keyboardDidShow"); assert.equal(p.padding(), 308);
  p.state.bounds = { ...screen, height: 488 }; p.layout(); assert.equal(p.padding(), 8);
  p.state.bounds = screen; p.layout(); assert.equal(p.padding(), 308);
  p.event("keyboardDidShow", { ...docked, screenY: 444, height: 400 }); assert.equal(p.padding(), 408);
  p.event("keyboardDidHide"); assert.equal(p.padding(), 8);
  assert.equal(p.h.find(p.scope, "View").children, p.child);
  p.h.dispose();
});

test("mount with an already visible keyboard and focus transitions use current metrics", () => {
  const p = mountScreen("ios", docked);
  assert.equal(p.padding(), 308);
  p.state.focused = false; p.scope.update(); p.scope.update(); assert.equal(p.padding(), 8);
  assert.equal([...p.h.state.listeners.values()].reduce((n, bucket) => n + bucket.size, 0), 0);
  p.state.focused = true; p.scope.update(); p.scope.update(); assert.equal(p.padding(), 308);
  p.event("keyboardWillChangeFrame", { ...docked, screenY: 444, height: 400 }); assert.equal(p.padding(), 408);
  p.event("keyboardWillHide"); assert.equal(p.padding(), 8);
  assert.equal(p.state.animations, 2);
  p.h.dispose();
});

test("late measurement cannot resurrect padding after hide, blur or unmount", () => {
  const p = mountScreen(); p.state.deferred = true;
  p.event("keyboardDidShow"); p.event("keyboardDidHide");
  p.state.callbacks.shift()!(); p.scope.update(); assert.equal(p.padding(), 8);
  p.event("keyboardDidShow"); p.state.focused = false; p.scope.update();
  p.state.callbacks.shift()!(); p.scope.update(); assert.equal(p.padding(), 8);
  p.state.focused = true; p.scope.update();
  p.scope.unmount(); p.state.callbacks.shift()!();
  assert.equal(p.padding(), 8);
  p.h.dispose();
});

test("iOS frame and hide events survive stale did-show metrics during window changes", () => {
  const p = mountScreen("ios", docked);
  p.event("keyboardWillChangeFrame", { ...docked, screenY: 444, height: 400 });
  assert.deepEqual(p.state.metrics, docked, "RN metrics retains did-show coordinates");
  p.state.dimensions = { width: 390, height: 843 }; p.scope.update(); p.scope.update();
  assert.equal(p.padding(), 408, "window change must retain the newer will-frame rectangle");
  p.event("keyboardWillHide");
  p.state.dimensions = { width: 390, height: 844 }; p.scope.update(); p.scope.update();
  assert.equal(p.padding(), 8, "window change must not restore a keyboard already hiding");
  p.h.dispose();
});

test("web keeps browser-controlled viewport and registers no native keyboard listeners", () => {
  const p = mountScreen("web", docked);
  assert.equal(p.padding(), 8);
  assert.equal(p.h.state.listeners.size, 0);
  p.h.dispose();
});
