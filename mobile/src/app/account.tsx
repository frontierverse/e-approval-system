import { KeyboardScrollView } from "@/components/keyboard-scroll-view";
import { KeyboardScreen } from "@/components/keyboard-screen";
import { router, Stack, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { AccountFeedback } from "@/components/account-feedback";
import { AccountImageEditor } from "@/components/account-image-editor";
import { AccountPasswordForm } from "@/components/account-password-form";
import { AccountButton, AccountSection } from "@/components/account-ui";
import { DetailText as Text } from "@/components/document-detail-ui";
import { useSession } from "@/lib/session";
import { useHomeTheme } from "@/lib/home-theme";
import type { MobileAccount } from "@/lib/types";

export default function Account() {
  const { token } = useSession();
  return token ? <AccountScreen key={token} /> : null;
}
function AccountScreen() {
  const theme = useHomeTheme();
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
    if (locked.current || loading || !!error || !account) return false;
    locked.current = true; sequence.current++; setLoading(false); setBusy(true); return true;
  };
  const release = () => { locked.current = false; if (alive.current) setBusy(false); };
  const disabled = busy || loading || !!error;
  return <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: theme.surface }}>
    <Stack.Screen options={{ headerShown: false }} />
    <View style={[styles.heading, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
      <AccountButton label="뒤로, 내 정보" icon="chevron-left" iconOnly onPress={() => router.canGoBack() ? router.back() : router.replace("/profile")} />
      <Text accessibilityRole="header" aria-level={1} style={{ flex: 1, color: theme.text, fontSize: 17, lineHeight: 24, fontWeight: "700" }}>계정·도장 설정</Text>
      <AccountButton label={loading ? "계정 정보 확인 중" : "계정 정보 새로고침"} icon="refresh-cw" iconOnly disabled={busy || loading} onPress={() => void load()} />
    </View>
    <KeyboardScreen style={{ flex: 1, backgroundColor: theme.background }}>
      <KeyboardScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 16) + 24 }]}>
        {!account ? error ? <AccountSection title="계정 정보">
          <AccountFeedback error={error} />
          <Text style={{ color: theme.secondary, fontSize: 13, lineHeight: 20 }}>연결을 확인한 뒤 다시 시도해 주세요. 확인 전에는 이미지·비밀번호를 변경할 수 없어요.</Text>
          <AccountButton label="다시 시도" disabled={loading} onPress={() => void load()} />
        </AccountSection> : <View accessibilityLabel="계정 정보를 불러오는 중" accessibilityLiveRegion="polite" style={{ gap: 16 }}>
          <ActivityIndicator color={theme.accent} />
          {[140, 210, 150].map((height, index) => <View key={index} accessible={false} aria-hidden style={[styles.panel, { height, backgroundColor: theme.surface, borderColor: theme.border, gap: 10 }]}>
            {[40, 70, 55].map(width => <View key={width} style={{ width: `${width}%`, height: 12, backgroundColor: theme.surfaceMuted, borderRadius: 6 }} />)}
          </View>)}
        </View> : <>
          {error ? <AccountSection title="새로고침 실패">
            <AccountFeedback error={error} />
            <Text style={{ color: theme.secondary, fontSize: 13, lineHeight: 20 }}>마지막으로 불러온 계정 정보예요. 최신 상태를 확인할 때까지 이미지·비밀번호를 변경할 수 없어요.</Text>
            <AccountButton label="다시 시도" disabled={loading || busy} onPress={() => void load()} />
          </AccountSection> : null}
          <AccountSection title="계정 정보 · 읽기 전용">
            <Text style={{ color: theme.text, fontSize: 17, lineHeight: 24, fontWeight: "700" }}>{account.name}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16 }}>
              <Info inline label="부서" value={account.departmentName} /><Info inline label="직급" value={account.positionName} />
            </View>
            <Info label="이메일" value={account.email ?? "미등록"} />
          </AccountSection>
          <AccountImageEditor kind="signature" info={account.signatureImage} disabled={disabled} acquire={acquire} release={release} onChange={image => setAccount(before => before ? { ...before, signatureImage: image } : before)} />
          <AccountImageEditor kind="profile" info={account.profileImage} disabled={disabled} acquire={acquire} release={release} onChange={image => setAccount(before => before ? { ...before, profileImage: image } : before)} />
          {account.canChangePassword ? <AccountPasswordForm disabled={disabled} acquire={acquire} release={release} /> : <AccountSection title="비밀번호 변경">
            <Text style={{ color: theme.secondary, fontSize: 14, lineHeight: 21 }}>비밀번호 로그인 계정이 아닙니다. 관리자에게 문의하세요.</Text>
          </AccountSection>}
        </>}
      </KeyboardScrollView>
    </KeyboardScreen>
  </SafeAreaView>;
}
function Info({ label, value, inline }: { label: string; value: string; inline?: boolean }) {
  const theme = useHomeTheme();
  return <View style={{ minWidth: 0, ...(inline ? { flexGrow: 1, flexBasis: 120 } : {}) }}><Text style={{ color: theme.secondary, fontSize: 12, lineHeight: 17 }}>{label}</Text><Text style={{ color: theme.text, fontSize: 14, lineHeight: 20, marginTop: 0 }}>{value}</Text></View>;
}
const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 12, gap: 16, maxWidth: 720, width: "100%", alignSelf: "center" },
  heading: { flexDirection: "row", alignItems: "center", gap: 4, padding: 4, minHeight: 52, borderBottomWidth: 1 },
  panel: { borderWidth: 1, borderRadius: 16, padding: 14 },
});
