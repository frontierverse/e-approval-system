import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, BackHandler, Keyboard, Modal, Platform, ScrollView, Text, View, type TextStyle } from "react-native";
import { PrimaryButton, TextAction } from "@/components/ui";
import { useTheme } from "@/lib/theme";

type Confirmation = { title: string; message: string; confirm: string; danger?: boolean; alternative?: string; onReturnFocus?: () => void };
type Choice = "confirm" | "alternative" | "cancel";

/** inlineNative keeps privacy-sensitive confirmations in the app's own window. */
export function useConfirmAction({ inlineNative = false, colors, sheet = false, bottomInset = 0 }: { inlineNative?: boolean; colors?: ReturnType<typeof useTheme>; sheet?: boolean; bottomInset?: number } = {}) {
  const base = useTheme(), theme = colors ?? base;
  const textWrap = sheet && Platform.OS === "web" ? { wordBreak: "keep-all", overflowWrap: "anywhere" } as unknown as TextStyle : undefined;
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const firstLine = confirmation?.message.split("\n")[0] ?? "";
  const quotedSummary = sheet && /^".*"$/.test(firstLine) ? firstLine.slice(1, -1) : null;
  const message = quotedSummary !== null ? confirmation?.message.slice(firstLine.length + 1) : confirmation?.message;
  const pending = useRef<((choice: Choice) => void) | null>(null);
  const cancelButton = useRef<View>(null);
  const returnFocus = useRef<(() => void) | null>(null);
  const finish = useCallback((choice: Choice, expected?: (choice: Choice) => void) => {
    if (expected && pending.current !== expected) return;
    const resolve = pending.current;
    pending.current = null;
    setConfirmation(null);
    resolve?.(choice);
  }, []);
  const cancel = useCallback(() => finish("cancel"), [finish]);
  useEffect(() => () => { pending.current?.("cancel"); pending.current = null; }, []);
  useEffect(() => {
    if (!inlineNative || Platform.OS === "web" || !confirmation) return;
    cancelButton.current?.focus();
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => { cancel(); return true; });
    return () => subscription.remove();
  }, [inlineNative, confirmation, cancel]);
  useEffect(() => {
    if (confirmation || !returnFocus.current) return;
    const restore = returnFocus.current;
    returnFocus.current = null;
    restore();
  }, [confirmation]);
  const choose = (value: Confirmation): Promise<Choice> => {
    if (pending.current) return Promise.resolve("cancel");
    return new Promise<Choice>(resolve => {
      pending.current = resolve;
      if (Platform.OS === "web" || inlineNative) {
        if (Platform.OS !== "web") Keyboard.dismiss();
        const target = typeof document !== "undefined" && document.activeElement instanceof HTMLElement ? document.activeElement : null;
        returnFocus.current = value.onReturnFocus ?? (target ? () => { if (target.isConnected && target.getClientRects().length) target.focus(); } : null);
        setConfirmation(value);
      }
      else Alert.alert(value.title, value.message,
        [{ text: "취소", style: "cancel", onPress: () => finish("cancel", resolve) },
          ...(value.alternative ? [{ text: value.alternative, style: "destructive" as const, onPress: () => finish("alternative", resolve) }] : []),
          { text: value.confirm, style: value.danger ? "destructive" : "default", onPress: () => finish("confirm", resolve) }],
        { cancelable: true, onDismiss: () => finish("cancel", resolve) });
    });
  };
  const ask = (value: Confirmation) => choose(value).then(choice => choice === "confirm");
  const resolution = pending.current;
  const respond = (choice: Choice) => { if (resolution) finish(choice, resolution); };
  const actions = inlineNative || confirmation?.alternative ? <>
    <PrimaryButton colors={colors} title={confirmation?.confirm ?? "확인"} danger={confirmation?.danger} onPress={() => respond("confirm")} />
    {confirmation?.alternative ? <PrimaryButton colors={colors} title={confirmation.alternative} danger onPress={() => respond("alternative")} /> : null}
    <TextAction colors={colors} outlined={!!colors} ref={cancelButton} label="취소" onPress={() => respond("cancel")} />
  </> : <View style={{ flexDirection: "row", gap: 12 }}>
    <View style={{ flex: 1 }}><TextAction ref={cancelButton} label="취소" onPress={() => respond("cancel")} /></View>
    <View style={{ flex: 1 }}><PrimaryButton title={confirmation?.confirm ?? "확인"} danger={confirmation?.danger} onPress={() => respond("confirm")} /></View>
  </View>;
  const content = <View accessibilityViewIsModal style={{ width: "100%", maxWidth: 480, maxHeight: sheet ? "90%" : "100%", borderRadius: sheet ? 20 : 12, borderBottomLeftRadius: sheet ? 0 : 12, borderBottomRightRadius: sheet ? 0 : 12, backgroundColor: theme.surface, overflow: "hidden" }}>
    <Text accessibilityRole="header" aria-level={2} style={[textWrap, { color: theme.text, fontSize: 18, fontWeight: "700", padding: 16, paddingBottom: 12 }]}>{confirmation?.title}</Text>
    <ScrollView showsVerticalScrollIndicator={sheet ? false : undefined} style={{ flexShrink: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: sheet ? 16 : 12, gap: sheet ? 12 : 0 }} keyboardShouldPersistTaps="handled">
      {quotedSummary !== null ? <View style={{ padding: 12, borderWidth: 1, borderColor: theme.border, borderRadius: 12, backgroundColor: theme.background }}><Text style={[textWrap, { color: theme.text, fontSize: 14, lineHeight: 22, fontWeight: "700" }]}>{quotedSummary}</Text></View> : null}
      <Text style={[textWrap, { color: theme.secondary, fontSize: 14, lineHeight: 22 }]}>{message}</Text>
    </ScrollView>
    <View style={{ paddingHorizontal: 16, paddingBottom: Math.max(16, bottomInset), gap: sheet ? 8 : 12 }}>{actions}</View>
  </View>;
  const inline = inlineNative && Platform.OS !== "web" && !!confirmation;
  const dialog = inline ? content : Platform.OS === "web" ? <Modal visible={!!confirmation} transparent animationType="none"
    accessibilityLabel={confirmation?.title} onRequestClose={cancel} onShow={() => cancelButton.current?.focus()}>
    <View style={{ flex: 1, justifyContent: sheet ? "flex-end" : "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.5)", padding: sheet ? 0 : 16 }}>
      {content}
    </View>
  </Modal> : null;
  return { ask, choose, cancel, inline, dialog };
}
