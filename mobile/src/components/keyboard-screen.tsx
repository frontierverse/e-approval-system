import { useIsFocused } from "expo-router";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Keyboard, Platform, StyleSheet, View, useWindowDimensions, type KeyboardEvent, type ViewProps } from "react-native";
import { keyboardOverlap, type KeyboardRectangle } from "@/lib/keyboard-layout";

const KeyboardViewport = createContext({ focused: false, revision: 0 });
export function useKeyboardViewport() { return useContext(KeyboardViewport); }

/** Keeps scrollable forms and fixed action bars within the visible native viewport. */
export function KeyboardScreen({ children, style, onLayout, ...props }: ViewProps) {
  const view = useRef<View>(null);
  const focused = useIsFocused();
  const active = useRef(false);
  const previousFocus = useRef(false);
  const measurement = useRef(0);
  const keyboard = useRef<KeyboardRectangle | undefined>(undefined);
  const [bottom, setBottom] = useState(0);
  const [present, setPresent] = useState(false);
  const [revision, setRevision] = useState(0);
  const { width, height } = useWindowDimensions();
  const { bottom: bottomInset } = useSafeAreaInsets();
  const flattened = StyleSheet.flatten(style);
  const basePadding = flattened?.paddingBottom ?? flattened?.paddingVertical ?? flattened?.padding ?? 0;

  const measure = useCallback(() => {
    const version = ++measurement.current;
    if (!active.current || Platform.OS === "web" || !keyboard.current) {
      setBottom(0);
      return;
    }
    view.current?.measureInWindow((x, y, measuredWidth, measuredHeight) => {
      if (!active.current || version !== measurement.current) return;
      setBottom(keyboardOverlap({ x, y, width: measuredWidth, height: measuredHeight }, keyboard.current, bottomInset));
      setRevision(value => value + 1);
    });
  }, [bottomInset]);
  const deactivate = useCallback(() => { active.current = false; measurement.current++; }, []);

  useLayoutEffect(() => {
    active.current = focused;
    // metrics() caches did-show/did-hide only; never replace a newer will-frame
    // event when dimensions or safe-area insets change during its animation.
    if (focused && !previousFocus.current && Platform.OS !== "web") {
      keyboard.current = Keyboard.metrics();
      setPresent(!!keyboard.current);
    } else if (!focused) {
      keyboard.current = undefined;
      setPresent(false);
    }
    previousFocus.current = focused;
    measure();
    return deactivate;
  }, [focused, width, height, measure, deactivate]);

  useEffect(() => {
    if (!focused || Platform.OS === "web") return;
    const change = (event: KeyboardEvent) => {
      keyboard.current = event.endCoordinates;
      setPresent(event.endCoordinates.height > 0);
      if (Platform.OS === "ios") Keyboard.scheduleLayoutAnimation(event);
      measure();
    };
    const hide = (event: KeyboardEvent) => {
      keyboard.current = undefined;
      setPresent(false);
      measurement.current++;
      if (Platform.OS === "ios") Keyboard.scheduleLayoutAnimation(event);
      setBottom(0);
    };
    const subscriptions = Platform.OS === "ios"
      ? [Keyboard.addListener("keyboardWillChangeFrame", change), Keyboard.addListener("keyboardWillHide", hide)]
      : [Keyboard.addListener("keyboardDidShow", change), Keyboard.addListener("keyboardDidHide", hide)];
    return () => { subscriptions.forEach(subscription => subscription.remove()); };
  }, [focused, measure]);

  return <KeyboardViewport.Provider value={{ focused: focused && present, revision }}><View {...props} ref={view} collapsable={false}
    onLayout={event => { onLayout?.(event); measure(); }}
    style={[styles.screen, style, bottom > 0 && { paddingBottom: bottom + (typeof basePadding === "number" ? basePadding : 0) }]}>
    {children}
  </View></KeyboardViewport.Provider>;
}

const styles = StyleSheet.create({ screen: { flex: 1 } });
