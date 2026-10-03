import { useState } from "react";
import { Pressable, Text, TextInput, View, type PressableProps } from "react-native";
import { useTheme } from "@/lib/theme";
export function ChatRowLink({ children, ...props }: PressableProps & {
  children: React.ReactNode;
}) {
  const theme = useTheme();
  const [focus, setFocus] = useState(false);
  return <Pressable {...props} accessibilityRole="button" onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} style={({ pressed }) => ({ minHeight: 64, justifyContent: "center", padding: 10, borderBottomWidth: 1, borderBottomColor: theme.border, borderWidth: 2, borderColor: focus ? theme.accent : "transparent", backgroundColor: pressed || focus ? theme.accentSoft : theme.surface, opacity: props.disabled ? .55 : 1 })}>{children}</Pressable>;
}
export function ChatInput({ label, value, onChange, disabled, multiline = false, placeholder }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  multiline?: boolean;
  placeholder?: string;
}) {
  const theme = useTheme();
  const [focus, setFocus] = useState(false);
  return <TextInput accessibilityLabel={label} value={value} onChangeText={onChange} editable={!disabled} multiline={multiline} placeholder={placeholder} placeholderTextColor={theme.muted} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} style={{ minHeight: multiline ? 64 : 44, maxHeight: multiline ? 150 : undefined, borderWidth: 1, borderColor: focus ? theme.accent : theme.muted, borderRadius: 8, color: theme.text, backgroundColor: theme.surface, padding: 10, fontSize: 14, lineHeight: 20, textAlignVertical: multiline ? "top" : "center" }}/>;
}
export function ChatBadge({ count }: {
  count: number;
}) {
  const theme = useTheme();
  return count > 0 ? <View style={{ backgroundColor: theme.accentSoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 }}><Text accessibilityLabel={`안 읽은 메시지 ${count}개`} style={{ color: theme.accent, fontSize: 12, fontWeight: "700" }}>{count > 99 ? "99+" : count}</Text></View> : null;
}
