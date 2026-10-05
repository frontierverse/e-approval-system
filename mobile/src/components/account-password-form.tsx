import { useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, TextInput, View, type TextInputProps } from "react-native";
import { AccountFeedback } from "@/components/account-feedback";
import { AccountButton, AccountSection } from "@/components/account-ui";
import { DetailText as Text } from "@/components/document-detail-ui";
import { ApiError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useHomeTheme } from "@/lib/home-theme";

type Props = { disabled: boolean; acquire: () => boolean; release: () => void };
export function AccountPasswordForm({ disabled, acquire, release }: Props) {
  const theme = useHomeTheme();
  const { request, signOut } = useSession();
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNew] = useState("");
  const [confirmPassword, setConfirm] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [focusError, setFocusError] = useState<{ field: string } | null>(null);
  const currentInput = useRef<TextInput>(null);
  const newInput = useRef<TextInput>(null);
  const confirmInput = useRef<TextInput>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    const target = focusError?.field === "currentPassword" ? currentInput : focusError?.field === "newPassword" ? newInput : focusError?.field === "confirmPassword" ? confirmInput : null;
    target?.current?.focus();
  }, [focusError]);
  const submit = async () => {
    if (!acquire()) return;
    setPending(true); setError(null); setFields({});
    try {
      const result = await request<{ message: string; reauthenticate: boolean }>("/account/password", { method: "POST", body: { currentPassword, newPassword, confirmPassword } });
      if (!alive.current) return;
      setCurrent(""); setNew(""); setConfirm("");
      await signOut({ message: result.message });
    } catch (cause) {
      if (!alive.current) return;
      if (cause instanceof ApiError && cause.fields && Object.keys(cause.fields).length) {
        setFields(cause.fields);
        const first = ["currentPassword", "newPassword", "confirmPassword"].find(field => cause.fields?.[field]);
        if (first) setFocusError({ field: first });
        if (cause.fields.form) setError(cause.fields.form);
      } else setError(cause instanceof Error ? cause.message : "비밀번호를 변경하지 못했습니다. 다시 시도하세요.");
    } finally { if (alive.current) setPending(false); release(); }
  };
  const edit = (name: string, setter: (value: string) => void) => (value: string) => {
    setter(value); setError(null); setFields(before => { const next = { ...before }; delete next[name]; return next; });
  };
  return <AccountSection title="비밀번호 변경">
    <Text style={{ color: theme.secondary, fontSize: 13, lineHeight: 20 }}>변경 후 모든 모바일 기기에서 다시 로그인해야 합니다. 새 비밀번호는 4~128자이고 현재 비밀번호와 달라야 해요.</Text>
    <PasswordField ref={currentInput} label="현재 비밀번호" value={currentPassword} onChangeText={edit("currentPassword", setCurrent)} autoComplete="current-password" error={fields.currentPassword} editable={!disabled} returnKeyType="next" onSubmitEditing={() => newInput.current?.focus()} />
    <PasswordField ref={newInput} label="새 비밀번호" value={newPassword} onChangeText={edit("newPassword", setNew)} autoComplete="new-password" error={fields.newPassword} editable={!disabled} returnKeyType="next" onSubmitEditing={() => confirmInput.current?.focus()} maxLength={128} />
    <PasswordField ref={confirmInput} label="새 비밀번호 확인" value={confirmPassword} onChangeText={edit("confirmPassword", setConfirm)} autoComplete="new-password" error={fields.confirmPassword} editable={!disabled} returnKeyType="done" onSubmitEditing={() => void submit()} maxLength={128} />
    <AccountButton label={pending ? "변경 중..." : "비밀번호 변경"} primary disabled={disabled} onPress={() => void submit()} style={{ minHeight: 48 }} />
    <AccountFeedback error={error} />
  </AccountSection>;
}
function PasswordField({ label, error, ref, ...props }: TextInputProps & { label: string; error?: string; ref: React.Ref<TextInput> }) {
  const theme = useHomeTheme();
  const [focused, setFocused] = useState(false);
  return <View style={{ gap: 4 }}>
    <Text style={{ color: theme.text, fontSize: 13, lineHeight: 19, fontWeight: "700" }}>{label}</Text>
    <TextInput ref={ref} {...props} accessibilityLabel={label} accessibilityHint={error} {...(Platform.OS === "web" ? { "aria-invalid": !!error } : {})} secureTextEntry autoCapitalize="none" autoCorrect={false} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      style={[styles.input, { backgroundColor: theme.surface, color: theme.text, borderColor: error ? theme.danger : focused ? theme.accent : theme.controlBorder, borderWidth: focused ? 2 : 1 }]} />
    {error ? <Text accessibilityRole="alert" style={{ color: theme.danger, fontSize: 13, lineHeight: 19, marginTop: 4 }}>{error}</Text> : null}
  </View>;
}
const styles = StyleSheet.create({
  input: { minHeight: 48, borderRadius: 12, paddingHorizontal: 12, fontSize: 16 },
});
