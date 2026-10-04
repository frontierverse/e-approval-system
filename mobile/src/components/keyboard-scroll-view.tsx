import { useCallback, useImperativeHandle, useLayoutEffect, useRef, type Ref } from "react";
import { FlatList, Platform, ScrollView, TextInput, type FlatListProps, type HostInstance, type ScrollViewProps } from "react-native";
import { useKeyboardViewport } from "@/components/keyboard-screen";
import { keyboardScrollOffset } from "@/lib/keyboard-layout";

type ScrollHandle = {
  getInnerViewRef(): HostInstance | null;
  scrollTo(options: { x: number; y: number; animated: boolean }): void;
};

// RN exposes this method on ScrollView's public ref; its TS declaration omits it.
function scrollHandle(value: unknown): ScrollHandle | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<ScrollHandle>;
  return typeof candidate.getInnerViewRef === "function" && typeof candidate.scrollTo === "function"
    ? candidate as ScrollHandle : null;
}

function useKeyboardReveal(getScroll: () => ScrollHandle | null, initialOffset: ScrollViewProps["contentOffset"]) {
  const { focused, revision } = useKeyboardViewport();
  const active = useRef(false);
  const generation = useRef(0);
  const frame = useRef<number | null>(null);
  const height = useRef(0);
  const offset = useRef({ x: initialOffset?.x ?? 0, y: initialOffset?.y ?? 0 });
  const cancel = useCallback(() => {
    generation.current++;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  }, []);
  const reveal = useCallback(() => {
    cancel();
    if (!active.current || Platform.OS === "web") return;
    const version = generation.current;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      if (!active.current || version !== generation.current) return;
      const input = TextInput.State.currentlyFocusedInput();
      const scroll = getScroll();
      const inner = scroll?.getInnerViewRef();
      if (!input || !scroll || !inner || height.current <= 0) return;
      input.measureLayout(inner, (_left, top, _width, inputHeight) => {
        if (!active.current || version !== generation.current || getScroll() !== scroll || TextInput.State.currentlyFocusedInput() !== input) return;
        const next = keyboardScrollOffset(top, inputHeight, offset.current.y, height.current);
        if (next !== offset.current.y) scroll.scrollTo({ x: offset.current.x, y: next, animated: true });
      }, () => undefined);
    });
  }, [cancel, getScroll]);

  useLayoutEffect(() => {
    active.current = focused && Platform.OS !== "web";
    reveal();
    return () => { active.current = false; cancel(); };
  }, [focused, revision, reveal, cancel]);

  const layout: NonNullable<ScrollViewProps["onLayout"]> = event => {
    height.current = event.nativeEvent.layout.height;
    reveal();
  };
  const scroll: NonNullable<ScrollViewProps["onScroll"]> = event => {
    offset.current = event.nativeEvent.contentOffset;
    height.current = event.nativeEvent.layoutMeasurement.height;
  };
  return { layout, scroll, reveal, cancel };
}

/** Preserves ScrollView's public ref and events while revealing focused native inputs. */
export function KeyboardScrollView({ ref, onLayout, onContentSizeChange, onScroll, onScrollBeginDrag, onFocus, onBlur, scrollEventThrottle, ...props }: ScrollViewProps & { ref?: Ref<ScrollView> }) {
  const view = useRef<ScrollView>(null);
  const getScroll = useCallback(() => scrollHandle(view.current), []);
  const reveal = useKeyboardReveal(getScroll, props.contentOffset);
  useImperativeHandle(ref, () => view.current!, []);
  return <ScrollView {...props} ref={view} scrollEventThrottle={scrollEventThrottle ?? 16}
    onLayout={event => { onLayout?.(event); reveal.layout(event); }}
    onContentSizeChange={(width, height) => { onContentSizeChange?.(width, height); reveal.reveal(); }}
    onScroll={event => { reveal.scroll(event); onScroll?.(event); }}
    onScrollBeginDrag={event => { reveal.cancel(); onScrollBeginDrag?.(event); }}
    onFocus={event => { onFocus?.(event); reveal.reveal(); }}
    onBlur={event => { reveal.cancel(); onBlur?.(event); }} />;
}

/** Keeps virtualization and the caller's FlatList instance intact. */
export function KeyboardFlatList<ItemT>({ ref, onLayout, onContentSizeChange, onScroll, onScrollBeginDrag, onFocus, onBlur, scrollEventThrottle, ...props }: FlatListProps<ItemT> & { ref?: Ref<FlatList<ItemT>> }) {
  const list = useRef<FlatList<ItemT>>(null);
  const getScroll = useCallback(() => scrollHandle(list.current?.getScrollResponder()), []);
  const reveal = useKeyboardReveal(getScroll, props.contentOffset);
  useImperativeHandle(ref, () => list.current!, []);
  return <FlatList {...props} ref={list} scrollEventThrottle={scrollEventThrottle ?? 16}
    onLayout={event => { onLayout?.(event); reveal.layout(event); }}
    onContentSizeChange={(width, height) => { onContentSizeChange?.(width, height); reveal.reveal(); }}
    onScroll={event => { reveal.scroll(event); onScroll?.(event); }}
    onScrollBeginDrag={event => { reveal.cancel(); onScrollBeginDrag?.(event); }}
    onFocus={event => { onFocus?.(event); reveal.reveal(); }}
    onBlur={event => { reveal.cancel(); onBlur?.(event); }} />;
}
