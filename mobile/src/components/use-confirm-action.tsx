import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Modal, Platform, ScrollView, Text, View } from "react-native";
import { PrimaryButton, TextAction } from "@/components/ui";
import { useTheme } from "@/lib/theme";

type Confirmation = { title: string; message: string; confirm: string; danger?: boolean; onReturnFocus?: () => void };

/** Native alerts on phones; an accessible, focus-trapped dialog in the web preview. */
export function useConfirmAction() {
  const theme = useTheme();
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const pending = useRef<((accepted: boolean) => void) | null>(null);
  const cancelButton = useRef<View>(null);
  const returnFocus = useRef<(() => void) | null>(null);
  const finish = useCallback((accepted: boolean) => {
    const resolve = pending.current;
    pending.current = null;
    setConfirmation(null);
    resolve?.(accepted);
  }, []);
  useEffect(() => () => { pending.current?.(false); pending.current = null; }, []);
  useEffect(() => {
    if (confirmation || !returnFocus.current) return;
    const restore = returnFocus.current;
    returnFocus.current = null;
    restore();
  }, [confirmation]);
  const ask = (value: Confirmation) => {
    if (pending.current) return Promise.resolve(false);
    return new Promise<boolean>(resolve => {
      pending.current = resolve;
      if (Platform.OS === "web") {
        const target = typeof document !== "undefined" && document.activeElement instanceof HTMLElement ? document.activeElement : null;
        returnFocus.current = value.onReturnFocus ?? (target ? () => { if (target.isConnected && target.getClientRects().length) target.focus(); } : null);
        setConfirmation(value);
      }
      else Alert.alert(value.title, value.message,
        [{ text: "취소", style: "cancel", onPress: () => finish(false) },
          { text: value.confirm, style: value.danger ? "destructive" : "default", onPress: () => finish(true) }],
        { cancelable: true, onDismiss: () => finish(false) });
    });
  };
  const dialog = Platform.OS === "web" ? <Modal visible={!!confirmation} transparent animationType="none"
    accessibilityLabel={confirmation?.title} onRequestClose={() => finish(false)} onShow={() => cancelButton.current?.focus()}>
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.5)", padding: 16 }}>
      <View style={{ width: "100%", maxWidth: 480, maxHeight: "100%", padding: 16, borderRadius: 12, backgroundColor: theme.surface, gap: 12 }}>
        <Text accessibilityRole="header" aria-level={2} style={{ color: theme.text, fontSize: 18, fontWeight: "700" }}>{confirmation?.title}</Text>
        <ScrollView style={{ flexShrink: 1 }}><Text style={{ color: theme.secondary, fontSize: 14, lineHeight: 22 }}>{confirmation?.message}</Text></ScrollView>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ flex: 1 }}><TextAction ref={cancelButton} label="취소" onPress={() => finish(false)} /></View>
          <View style={{ flex: 1 }}><PrimaryButton title={confirmation?.confirm ?? "확인"} danger={confirmation?.danger} onPress={() => finish(true)} /></View>
        </View>
      </View>
    </View>
  </Modal> : null;
  return { ask, dialog };
}
