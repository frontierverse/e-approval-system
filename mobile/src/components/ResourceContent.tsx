import { useState } from "react";
import { Pressable, Text, TextInput, View, type TextInputProps } from "react-native";
import { useTheme } from "@/lib/theme";
export function ResourceRow({ title, detail, onPress, disabled, accessibilityLabel, numberOfLines }: {
    title: string;
    detail?: string;
    onPress(): void;
    disabled?: boolean;
    accessibilityLabel?: string;
    numberOfLines?: number;
}) {
    const theme = useTheme();
    const [focused, setFocused] = useState(false);
    return <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? title} accessibilityState={{ disabled: !!disabled }} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={{ minHeight: 44, paddingVertical: detail ? 10 : 8, paddingHorizontal: 6, borderWidth: 2, borderColor: focused ? theme.accent : "transparent", borderRadius: 8, backgroundColor: focused ? theme.accentSoft : "transparent", opacity: disabled ? 0.5 : 1 }}>
    <Text numberOfLines={numberOfLines} style={{ color: theme.accent, fontSize: 15, lineHeight: 22, fontWeight: "700", flexShrink: 1 }}>{title}</Text>
    {detail ? <Text style={{ color: theme.secondary, fontSize: 12, lineHeight: 19, marginTop: 2 }}>{detail}</Text> : null}
  </Pressable>;
}
export function ResourceField({ label, value, onChange, error, hint, disabled, multiline, ...props }: Omit<TextInputProps, "onChange" | "editable"> & {
    label: string;
    value: string;
    onChange(value: string): void;
    error?: string;
    hint?: string;
    disabled?: boolean;
    multiline?: boolean;
}) {
    const theme = useTheme();
    const [focused, setFocused] = useState(false);
    return <View style={{ gap: 4 }}><Text style={{ color: theme.text, fontSize: 14, fontWeight: "700" }}>{label}</Text>
    {hint ? <Text style={{ color: theme.secondary, fontSize: 12 }}>{hint}</Text> : null}
    <TextInput {...props} value={value} onChangeText={onChange} multiline={multiline} editable={!disabled} accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={{ color: theme.text, backgroundColor: theme.surface, borderWidth: 2, borderColor: error ? theme.danger : focused ? theme.accent : theme.muted, minHeight: multiline ? 132 : 48, padding: 10, borderRadius: 8, textAlignVertical: multiline ? "top" : "center", fontSize: 15, lineHeight: 22 }}/>
    {error ? <Text style={{ color: theme.danger, fontSize: 12 }}>{error}</Text> : null}
  </View>;
}
