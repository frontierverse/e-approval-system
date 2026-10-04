import { KeyboardScrollView } from "@/components/keyboard-scroll-view";
import { KeyboardScreen } from "@/components/keyboard-screen";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AccountFeedback } from "@/components/account-feedback";
import { AccountImageEditor } from "@/components/account-image-editor";
import { AccountPasswordForm } from "@/components/account-password-form";
import { ErrorState, TextAction } from "@/components/ui";
import { useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";
import type { MobileAccount } from "@/lib/types";

export default function Account() {
  const { token } = useSession();
  return token ? <AccountScreen key={token} /> : null;
}
function AccountScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { request } = useSession();
  const [account, setAccount] = useState<MobileAccount | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const sequence = useRef(0);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const load = useCallback(async () => {
    if (locked.current) return;
    const operation = ++sequence.current;
    setLoading(true); setError(null);
    try {
      const result = await request<{ account: MobileAccount }>("/account");
      if (alive.current && operation === sequence.current) setAccount(result.account);
    } catch (cause) {
      if (alive.current && operation === sequence.current) setError(cause instanceof Error ? cause.message : "계정 정보를 불러오지 못했습니다.");
    } finally { if (alive.current && operation === sequence.current) setLoading(false); }
  }, [request]);
  useFocusEffect(useCallback(() => { void load(); return () => { sequence.current++; }; }, [load]));
  const acquire = () => {
    if (locked.current || !!error || !account) return false;
    locked.current = true; sequence.current++; setLoading(false); setBusy(true); return true;
  };
  const release = () => { locked.current = false; if (alive.current) setBusy(false); };
  const disabled = busy || !!error;
  return <KeyboardScreen style={{ flex: 1, backgroundColor: theme.background }}>
    <KeyboardScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}>
      <View style={styles.heading}><Text accessibilityRole="header" aria-level={2} style={{ color: theme.text, fontSize: 18, fontWeight: "800" }}>계정 정보</Text><TextAction label={loading ? "확인 중..." : "새로고침"} icon="refresh" disabled={busy || loading} onPress={() => void load()} /></View>
      {!account ? error ? <ErrorState message={error} retry={() => void load()} /> : <View style={[styles.panel, { borderColor: theme.border, backgroundColor: theme.surface }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><ActivityIndicator color={theme.accent} /><Text accessibilityLiveRegion="polite" style={{ color: theme.secondary }}>계정 정보를 불러오는 중...</Text></View>
      </View> : <>
        <View style={[styles.panel, { borderColor: theme.border, backgroundColor: theme.surface }]}>
          <Text style={{ color: theme.text, fontSize: 18, lineHeight: 25, fontWeight: "800" }}>{account.name}</Text>
          <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
            <Info label="부서" value={account.departmentName} /><Info label="직급" value={account.positionName} />
          </View>
          <View style={{ marginTop: 8 }}><Info label="이메일" value={account.email ?? "미등록"} /></View>
        </View>
        {error ? <AccountFeedback error={error} /> : null}
        <AccountImageEditor kind="signature" info={account.signatureImage} disabled={disabled} acquire={acquire} release={release} onChange={image => setAccount(before => before ? { ...before, signatureImage: image } : before)} />
        <AccountImageEditor kind="profile" info={account.profileImage} disabled={disabled} acquire={acquire} release={release} onChange={image => setAccount(before => before ? { ...before, profileImage: image } : before)} />
        {account.canChangePassword ? <AccountPasswordForm disabled={disabled} acquire={acquire} release={release} /> : <View style={[styles.panel, { marginTop: 12, borderColor: theme.border, backgroundColor: theme.surface }]}>
          <Text accessibilityRole="header" aria-level={2} style={{ color: theme.text, fontSize: 16, fontWeight: "800" }}>비밀번호 변경</Text>
          <Text style={{ color: theme.secondary, fontSize: 13, lineHeight: 19, marginTop: 4 }}>비밀번호 로그인 계정이 아닙니다. 관리자에게 문의하세요.</Text>
        </View>}
      </>}
    </KeyboardScrollView>
  </KeyboardScreen>;
}
function Info({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return <View style={{ flex: 1, minWidth: 0 }}><Text style={{ color: theme.secondary, fontSize: 12 }}>{label}</Text><Text style={{ color: theme.text, fontSize: 14, lineHeight: 20, marginTop: 2 }}>{value}</Text></View>;
}
const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, maxWidth: 720, width: "100%", alignSelf: "center" },
  heading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, paddingTop: 12, paddingBottom: 8 },
  panel: { borderWidth: 1, borderRadius: 12, padding: 12 },
});
