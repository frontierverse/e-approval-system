import { Feather } from "@expo/vector-icons";
import { useState, type ReactNode, type Ref } from "react";
import { Platform, Pressable, StyleSheet, Text as NativeText, View, type ViewStyle, type TextProps, type TextStyle } from "react-native";
import { useHomeTheme } from "@/lib/home-theme";

export function DetailButton({ label, icon, onPress, disabled, primary, danger, iconOnly, iconSize, ref, style }: {
  label: string; icon?: keyof typeof Feather.glyphMap; onPress: () => void; disabled?: boolean;
  primary?: boolean; danger?: boolean; iconOnly?: boolean; iconSize?: number; ref?: Ref<View>; style?: ViewStyle;
}) {
  const theme = useHomeTheme(), [focused, setFocused] = useState(false);
  const color = primary ? "#FFFFFF" : danger ? theme.danger : theme.text;
  return <Pressable ref={ref} accessibilityRole="button" accessibilityLabel={label} disabled={disabled} accessibilityState={{ disabled: !!disabled }}
    onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onPress={onPress}
    style={({ pressed }) => [styles.button, iconOnly && { minHeight: 44, paddingVertical: 0 }, { backgroundColor: primary ? danger ? theme.dangerFill : theme.actionFill : theme.surface,
      borderColor: focused ? theme.accent : danger ? theme.danger : primary ? "transparent" : theme.controlBorder,
      borderWidth: focused ? 2 : 1, opacity: disabled ? .55 : pressed ? .8 : 1 }, style, focused && { borderWidth: 2, borderColor: theme.accent }]}>
    {icon ? <Feather name={icon} color={color} size={iconSize ?? 18} accessible={false} aria-hidden /> : null}
    {!iconOnly ? <DetailText style={{ color, fontSize: 16, fontWeight: "700", lineHeight: 23, flexShrink: 1, textAlign: "center" }}>{label}</DetailText> : null}
  </Pressable>;
}
export function DetailSection({ title, extra, children }: { title: string; extra?: string; children: ReactNode }) {
  const theme = useHomeTheme();
  return <View style={{ gap: 8 }}><View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 8 }}>
    <DetailText accessibilityRole="header" {...(Platform.OS === "web" ? { "aria-level": 3 } : {})} style={{ color: theme.text, fontSize: 16, lineHeight: 23, fontWeight: "700" }}>{title}</DetailText>
    {extra ? <DetailText style={{ color: theme.secondary, fontSize: 13, lineHeight: 23 }}>{extra}</DetailText> : null}
  </View>{children}</View>;
}
export function DetailPanel({ children, style }: { children?: ReactNode; style?: ViewStyle }) {
  const theme = useHomeTheme();
  return <View style={[{ backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1, borderRadius: 14, overflow: "hidden" }, style]}>{children}</View>;
}
export function DetailBadge({ label, status }: { label: string; status: string }) {
  const theme = useHomeTheme();
  const danger = status === "rejected", active = status === "pending" || status === "submitted";
  return <View style={{ paddingVertical: 1, paddingHorizontal: 7, borderRadius: 6, borderWidth: 1,
    borderColor: status === "recalled" ? theme.controlBorder : "transparent", backgroundColor: danger ? theme.dangerSoft : active ? theme.accentSoft : theme.surfaceMuted }}>
    <DetailText style={{ color: danger ? theme.danger : active ? theme.accent : status === "approved" ? theme.success : theme.secondary, fontSize: 12, lineHeight: 17, fontWeight: "700" }}>{label}</DetailText>
  </View>;
}
/** Native text stays in the app's system font; web keeps Korean words together. */
export function DetailText({ style, ...props }: TextProps) {
  return <NativeText {...props} style={[Platform.OS === "web" ? { wordBreak: "keep-all", overflowWrap: "anywhere" } as unknown as TextStyle : undefined, style]} />;
}
const styles = StyleSheet.create({ button: { minHeight: 48, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6 } });
