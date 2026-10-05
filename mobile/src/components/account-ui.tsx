import { Feather } from "@expo/vector-icons";
import { useState, type ReactNode, type Ref } from "react";
import { Pressable, StyleSheet, View, type ViewStyle } from "react-native";
import { DetailText as Text } from "./document-detail-ui";
import { useHomeTheme } from "@/lib/home-theme";

export function AccountButton({ label, accessibilityLabel, onPress, disabled, primary, danger, icon, iconOnly, ref, style }: {
  label: string; accessibilityLabel?: string; onPress: () => void; disabled?: boolean; primary?: boolean; danger?: boolean;
  icon?: keyof typeof Feather.glyphMap; iconOnly?: boolean; ref?: Ref<View>; style?: ViewStyle;
}) {
  const theme = useHomeTheme(), [focused, setFocused] = useState(false);
  const color = primary ? "#FFFFFF" : danger ? theme.danger : theme.text;
  return <Pressable ref={ref} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityState={{ disabled: !!disabled }} disabled={disabled}
    onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onPress={onPress}
    style={({ pressed }) => [styles.button, { backgroundColor: primary ? danger ? theme.dangerFill : theme.actionFill : theme.surface,
      borderColor: focused ? theme.accent : primary || iconOnly ? "transparent" : theme.controlBorder,
      borderWidth: focused ? 2 : 1, opacity: disabled ? .55 : pressed ? .8 : 1 }, iconOnly && { width: 44, padding: 0 }, style]}>
    {icon ? <Feather name={icon} size={iconOnly ? 22 : 18} color={color} accessible={false} aria-hidden /> : null}
    {!iconOnly ? <Text style={{ color, fontSize: 14, lineHeight: 20, fontWeight: "700", flexShrink: 1, textAlign: "center" }}>{label}</Text> : null}
  </Pressable>;
}
export function AccountSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  const theme = useHomeTheme();
  return <View style={{ gap: 6 }}>
    <View style={{ marginLeft: 4 }}><Text accessibilityRole="header" aria-level={2} style={{ color: theme.secondary, fontSize: 13, lineHeight: 19, fontWeight: "700" }}>{title}</Text>
      {description ? <Text style={{ color: theme.secondary, fontSize: 12, lineHeight: 18 }}>{description}</Text> : null}</View>
    <View style={{ backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1, borderRadius: 16, padding: 12, gap: 10 }}>{children}</View>
  </View>;
}
const styles = StyleSheet.create({ button: { minHeight: 44, minWidth: 44, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 } });
