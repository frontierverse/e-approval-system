import { useState } from "react";
import { Alert, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { PrimaryButton, ScreenHeading, TextAction } from "@/components/ui";
import { getPushToken } from "@/lib/push";
import { useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";

export default function Profile() {
  const theme = useTheme();
  const { user, signOut, request } = useSession();
  const { data: pushStatus, loading: pushLoading, error: pushLoadError, reload: reloadPushStatus, setData: setPushStatus } =
    useLoad<{ enabled: boolean }>("/push-subscription");
  const [pushPending, setPushPending] = useState(false);
  const [pushMessage, setPushMessage] = useState<string | null>(null);
  const enablePush = async () => {
    if (pushPending) return;
    setPushPending(true); setPushMessage(null);
    try {
      const expoPushToken = await getPushToken();
      if (!expoPushToken) throw new Error("알림 권한이 필요합니다.");
      await request("/push-subscription", { method: "POST", body: { expoPushToken } });
      setPushStatus({ enabled: true });
      setPushMessage("이 기기에서 결재 알림을 받습니다.");
    } catch (cause) {
      setPushMessage(cause instanceof Error ? cause.message : "알림을 설정하지 못했습니다.");
    } finally {
      setPushPending(false);
    }
  };
  const disablePush = async () => {
    if (pushPending) return;
    setPushPending(true); setPushMessage(null);
    try {
      await request("/push-subscription", { method: "DELETE" });
      setPushStatus({ enabled: false });
      setPushMessage("이 기기의 결재 알림을 껐습니다.");
    } catch (cause) {
      setPushMessage(cause instanceof Error ? cause.message : "알림 설정을 변경하지 못했습니다.");
    } finally {
      setPushPending(false);
    }
  };
  const confirmSignOut = () => {
    const logout = () => void signOut().catch(() => {
      if (Platform.OS === "web") window.alert("로그아웃하지 못했습니다. 다시 시도하세요.");
      else Alert.alert("로그아웃 실패", "다시 시도하세요.");
    });
    if (Platform.OS === "web") { logout(); return; }
    Alert.alert("로그아웃", "이 기기에서 로그아웃하시겠습니까?", [
      { text: "취소", style: "cancel" },
      { text: "로그아웃", style: "destructive", onPress: logout },
    ]);
  };
  return <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content}>
    <ScreenHeading title="내 정보" />
    <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Text style={{ color: theme.muted, fontSize: 12 }}>로그인 계정</Text>
      <Text style={{ color: theme.text, fontSize: 20, fontWeight: "800", marginTop: 4 }}>{user?.name}</Text>
      <Text style={{ color: theme.secondary, fontSize: 13, marginTop: 4 }}>{user?.positionName ?? "직원"}</Text>
    </View>
    <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border, marginTop: 12 }]}>
      <Text style={{ color: theme.text, fontSize: 16, fontWeight: "800" }}>기기 알림</Text>
      <Text style={{ color: theme.secondary, fontSize: 13, lineHeight: 19, marginTop: 5, marginBottom: 12 }}>
        {pushLoading && !pushStatus ? "알림 설정 확인 중..." :
          pushStatus?.enabled ? "새 결재와 진행 소식을 이 기기로 받습니다." :
          "새 결재와 진행 소식을 기기로 받아보세요."}
      </Text>
      {Platform.OS === "web" ? <Text style={{ color: theme.secondary, fontSize: 13 }}>설치한 모바일 앱에서 설정할 수 있습니다.</Text> :
        pushStatus?.enabled ? <TextAction label={pushPending ? "변경 중..." : "이 기기 알림 끄기"} icon="notifications-off-outline"
          disabled={pushPending} onPress={() => void disablePush()} /> :
        <PrimaryButton title={pushPending ? "설정 중..." : "이 기기에서 알림 받기"}
          disabled={pushPending} onPress={() => void enablePush()} />}
      {pushLoadError ? <View style={{ marginTop: 8 }}>
        <Text accessibilityRole="alert" style={{ color: theme.danger, fontSize: 13 }}>알림 설정을 불러오지 못했습니다.</Text>
        <TextAction label="다시 시도" icon="refresh" onPress={reloadPushStatus} />
      </View> : null}
      {pushMessage ? <Text accessibilityRole="alert" style={{ color: theme.secondary, fontSize: 13, marginTop: 8 }}>{pushMessage}</Text> : null}
    </View>
    <View style={{ marginTop: 12 }}><TextAction label="로그아웃" icon="log-out-outline" onPress={confirmSignOut} /></View>
  </ScrollView>;
}
const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingBottom: 24, maxWidth: 720, width: "100%", alignSelf: "center" },
  panel: { borderWidth: 1, borderRadius: 12, padding: 16 },
});
