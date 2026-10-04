import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, BackHandler, Keyboard, Modal, Platform, ScrollView, Text, View } from "react-native";
import { PrimaryButton, TextAction } from "@/components/ui";
import { useTheme } from "@/lib/theme";

type Confirmation = { title: string; message: string; confirm: string; danger?: boolean; alternative?: string; onReturnFocus?: () => void };
type Choice = "confirm" | "alternative" | "cancel";

/** inlineNative keeps privacy-sensitive confirmations in the app's own window. */
export function useConfirmAction({ inlineNative = false }: { inlineNative?: boolean } = {}) {
  const theme = useTheme();
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
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
  const content = <View accessibilityViewIsModal style={{ width: "100%", maxWidth: 480, maxHeight: "100%", borderRadius: 12, backgroundColor: theme.surface, overflow: "hidden" }}>
    <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
    <Text accessibilityRole="header" aria-level={2} style={{ color: theme.text, fontSize: 18, fontWeight: "700" }}>{confirmation?.title}</Text>
    <Text style={{ color: theme.secondary, fontSize: 14, lineHeight: 22 }}>{confirmation?.message}</Text>
    {inlineNative || confirmation?.alternative ? <>
      <PrimaryButton title={confirmation?.confirm ?? "확인"} danger={confirmation?.danger} onPress={() => respond("confirm")} />
      {confirmation?.alternative ? <PrimaryButton title={confirmation.alternative} danger onPress={() => respond("alternative")} /> : null}
      <TextAction ref={cancelButton} label="취소" onPress={() => respond("cancel")} />
    </> : <View style={{ flexDirection: "row", gap: 12 }}>
      <View style={{ flex: 1 }}><TextAction ref={cancelButton} label="취소" onPress={() => respond("cancel")} /></View>
      <View style={{ flex: 1 }}><PrimaryButton title={confirmation?.confirm ?? "확인"} danger={confirmation?.danger} onPress={() => respond("confirm")} /></View>
    </View>}
    </ScrollView>
  </View>;
  const inline = inlineNative && Platform.OS !== "web" && !!confirmation;
  const dialog = inline ? content : Platform.OS === "web" ? <Modal visible={!!confirmation} transparent animationType="none"
    accessibilityLabel={confirmation?.title} onRequestClose={cancel} onShow={() => cancelButton.current?.focus()}>
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.5)", padding: 16 }}>
      {content}
    </View>
  </Modal> : null;
  return { ask, choose, cancel, inline, dialog };
}
