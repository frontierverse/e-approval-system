import { KeyboardScrollView } from "@/components/keyboard-scroll-view";
import { KeyboardScreen } from "@/components/keyboard-screen";
import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { PrimaryButton } from "@/components/ui";
import { useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";

export default function Login() {
  const theme = useTheme();
  const { signIn, error: sessionError } = useSession();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(sessionError);
  const submit = async () => {
    if (pending) return;
    if (!name.trim() || !password) { setError("이름과 비밀번호를 입력하세요."); return; }
    setPending(true); setError(null);
    try { await signIn(name.trim(), password); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "로그인하지 못했습니다."); }
    finally { setPending(false); }
  };
  return <KeyboardScreen style={{ flex: 1, backgroundColor: theme.background }}>
    <KeyboardScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <View style={styles.brand}>
        <View style={[styles.mark, { backgroundColor: theme.actionFill }]}><Text style={styles.markText}>바</Text></View>
        <Text style={[styles.brandTitle, { color: theme.text }]}>바자울</Text>
        <Text style={[styles.brandSubtitle, { color: theme.secondary }]}>사내 결재를 빠르고 정확하게</Text>
      </View>
      <View style={[styles.form, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.formTitle, { color: theme.text }]}>로그인</Text>
        <Text style={[styles.label, { color: theme.secondary }]}>이름</Text>
        <TextInput accessibilityLabel="이름" value={name} onChangeText={setName} autoCapitalize="none" autoCorrect={false}
          autoComplete="username" returnKeyType="next" style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]} />
        <Text style={[styles.label, { color: theme.secondary }]}>비밀번호</Text>
        <TextInput accessibilityLabel="비밀번호" value={password} onChangeText={setPassword} secureTextEntry
          autoComplete="current-password" returnKeyType="go" onSubmitEditing={submit}
          style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]} />
        {error ? <Text accessibilityRole="alert" style={[styles.error, { color: theme.danger }]}>{error}</Text> : null}
        <View style={{ marginTop: 20 }}><PrimaryButton title={pending ? "로그인 중..." : "로그인"} disabled={pending} onPress={submit} /></View>
      </View>
    </KeyboardScrollView>
  </KeyboardScreen>;
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, justifyContent: "center", padding: 24, maxWidth: 500, width: "100%", alignSelf: "center" },
  brand: { alignItems: "center", marginBottom: 30 },
  mark: { width: 52, height: 52, borderRadius: 13, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  markText: { color: "#FFFFFF", fontSize: 29, fontWeight: "800" },
  brandTitle: { fontSize: 27, fontWeight: "800" },
  brandSubtitle: { fontSize: 14, marginTop: 3 },
  form: { borderWidth: 1, borderRadius: 15, padding: 20 },
  formTitle: { fontSize: 19, fontWeight: "800", marginBottom: 18 },
  label: { fontSize: 13, fontWeight: "700", marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 9, minHeight: 48, paddingHorizontal: 12, marginBottom: 15, fontSize: 16 },
  error: { fontSize: 13, lineHeight: 19 },
});
