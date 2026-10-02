import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View, type PressableProps } from "react-native";
import { useTheme } from "@/lib/theme";

export function ScreenHeading({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  const theme = useTheme();
  return <View style={styles.heading}>
    <View style={{ flex: 1 }}><Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>{title}</Text>
      {subtitle ? <Text style={[styles.subtitle, { color: theme.secondary }]}>{subtitle}</Text> : null}</View>
    {action}
  </View>;
}

export function PrimaryButton({ title, disabled, onPress, danger = false }: {
  title: string; disabled?: boolean; onPress: () => void; danger?: boolean;
}) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  return <Pressable onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} accessibilityRole="button" accessibilityState={{ disabled: !!disabled }} disabled={disabled}
    onPress={onPress} style={({ pressed }) => [styles.button, { backgroundColor: danger ? theme.dangerFill : theme.actionFill, borderWidth: 2, borderColor: focused ? theme.accent : "transparent", opacity: disabled ? 0.55 : pressed ? 0.84 : 1 }]}>
    <Text style={styles.buttonText}>{title}</Text>
  </Pressable>;
}

export function TextAction({ label, onPress, icon, ...props }: PressableProps & { label: string; icon?: keyof typeof Ionicons.glyphMap }) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  return <Pressable {...props} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
    style={({ pressed }) => [styles.action, { backgroundColor: pressed || focused ? theme.accentSoft : "transparent", borderWidth: 2, borderColor: focused ? theme.accent : "transparent", paddingHorizontal: 6 }]}>
    {icon ? <Ionicons name={icon} size={18} color={theme.accent} /> : null}
    <Text style={{ color: theme.accent, fontSize: 14, fontWeight: "700" }}>{label}</Text>
  </Pressable>;
}

export function EmptyState({ title, detail }: { title: string; detail?: string }) {
  const theme = useTheme();
  return <View style={[styles.empty, { borderColor: theme.border, backgroundColor: theme.surface }]}>
    <Text style={{ color: theme.text, fontSize: 15, fontWeight: "700" }}>{title}</Text>
    {detail ? <Text style={{ color: theme.secondary, marginTop: 4, textAlign: "center" }}>{detail}</Text> : null}
  </View>;
}

export function ErrorState({ message, retry }: { message: string; retry: () => void }) {
  const theme = useTheme();
  return <View style={[styles.empty, { borderColor: theme.border, backgroundColor: theme.surface }]}>
    <Text style={{ color: theme.danger, textAlign: "center" }}>{message}</Text>
    <TextAction label="다시 시도" icon="refresh" onPress={retry} />
  </View>;
}

const styles = StyleSheet.create({
  heading: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 16, paddingBottom: 12 },
  title: { fontSize: 23, fontWeight: "800", letterSpacing: -0.6 },
  subtitle: { fontSize: 13, marginTop: 2 },
  button: { minHeight: 48, borderRadius: 11, alignItems: "center", justifyContent: "center", paddingHorizontal: 20 },
  buttonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  action: { minHeight: 44, minWidth: 44, flexDirection: "row", gap: 5, alignItems: "center", justifyContent: "center", borderRadius: 9, paddingHorizontal: 8 },
  empty: { minHeight: 116, borderWidth: 1, borderRadius: 12, alignItems: "center", justifyContent: "center", padding: 16 },
});
