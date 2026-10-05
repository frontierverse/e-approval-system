import { Feather } from "@expo/vector-icons";
import { useEffect, useRef, useState, type Ref } from "react";
import { Pressable, StyleSheet, View, type PressableProps } from "react-native";
import { focusAccountNotice } from "@/components/account-feedback";
import { DetailButton, DetailPanel, DetailText } from "@/components/document-detail-ui";
import { useHomeTheme } from "@/lib/home-theme";

export function DraftAction({ label, icon, danger, ref, ...props }: PressableProps & {
  label: string; icon?: keyof typeof Feather.glyphMap; danger?: boolean; ref?: Ref<View>;
}) {
  const theme = useHomeTheme(), [focused, setFocused] = useState(false);
  const color = danger ? theme.danger : theme.accent;
  return <Pressable {...props} ref={ref} accessibilityRole="button" accessibilityLabel={props.accessibilityLabel ?? label}
    accessibilityState={{ ...props.accessibilityState, disabled: !!props.disabled }}
    onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
    style={({ pressed }) => [styles.action, { borderColor: focused ? theme.accent : "transparent", backgroundColor: focused || pressed ? theme.accentSoft : "transparent", opacity: props.disabled ? .5 : 1 }]}>
    {icon ? <Feather name={icon} size={16} color={color} accessible={false} aria-hidden /> : null}
    <DetailText style={{ color, fontSize: 14, lineHeight: 20, fontWeight: "700", flexShrink: 1 }}>{label}</DetailText>
  </Pressable>;
}

export function DraftButton({ title, ...props }: { title: string; disabled?: boolean; danger?: boolean; onPress: () => void; ref?: Ref<View> }) {
  return <DetailButton label={title} primary {...props} />;
}

export function DraftErrorState({ message, retry }: { message: string; retry: () => void }) {
  const theme = useHomeTheme();
  return <DetailPanel style={{ padding: 16, gap: 12 }}>
    <DetailText accessibilityRole="alert" style={{ color: theme.danger, fontSize: 14, lineHeight: 21 }}>{message}</DetailText>
    <DetailButton label="다시 시도" icon="refresh-cw" onPress={retry} />
  </DetailPanel>;
}

export function DraftFeedback({ error, message }: { error?: string | null; message?: string | null }) {
  const theme = useHomeTheme(), summary = useRef<View>(null);
  useEffect(() => { if (error) focusAccountNotice(summary.current); }, [error]);
  if (!error && !message) return null;
  return <View ref={summary} accessible tabIndex={-1} accessibilityRole={error ? "alert" : undefined} accessibilityLiveRegion="polite"
    style={{ borderWidth: 1, borderColor: error ? theme.danger : theme.controlBorder, backgroundColor: error ? theme.dangerSoft : theme.accentSoft, borderRadius: 12, padding: 12 }}>
    <DetailText style={{ color: error ? theme.danger : theme.text, fontSize: 14, lineHeight: 21 }}>{error || message}</DetailText>
  </View>;
}

const styles = StyleSheet.create({ action: { minHeight: 44, minWidth: 44, borderWidth: 2, borderRadius: 10, paddingHorizontal: 6, flexDirection: "row", gap: 4, alignItems: "center", justifyContent: "center" } });
