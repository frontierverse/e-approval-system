import { useCallback } from "react";
import { router, useFocusEffect } from "expo-router";
import { Alert, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { PrimaryButton, ScreenHeading, TextAction } from "@/components/ui";
import { AccountFeedback } from "@/components/account-feedback";
import { useChat } from "@/lib/chat-provider";
import { useYouth } from "@/components/youth-provider";
import { useResources } from "@/providers/ResourceProvider";
import { useNotifications } from "@/lib/notifications";
import { useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";

export default function Profile() {
  const theme = useTheme();
  const { user, signOut } = useSession();
  const chat = useChat();
  const resources = useResources();
  const youth = useYouth();
  const { pushStatus, pushLoading, pushPending, pushError, pushMessage, pushNeedsSettings,
    enablePush, disablePush, retryPushRegistration, refreshPushStatus, openPushSettings } = useNotifications();
  useFocusEffect(useCallback(() => { void refreshPushStatus(); }, [refreshPushStatus]));
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
      <Text style={{ color: theme.text, fontSize: 16, fontWeight: "800" }}>업무 기능</Text>
      <TextAction label={chat.unreadCount === null ? chat.error ? "직원 채팅 · 확인 필요" : "직원 채팅 · 확인 중" : chat.unreadCount > 0 ? `직원 채팅 · 안 읽음 ${chat.unreadCount > 99 ? "99+" : chat.unreadCount}개` : "직원 채팅"} icon="chatbubbles-outline" onPress={() => { if(chat.isCurrentAccount()) router.push("/chat"); }} />
      <TextAction label="청소년 관리" icon="people-outline" onPress={() => { if (youth.isCurrentAccount()) router.push("/youth"); }} />
      <TextAction label="자료실" icon="folder-open-outline" onPress={() => { if (resources.isCurrentAccount()) router.push("/resources"); }} />
      <TextAction label="업무일지" icon="journal-outline" onPress={() => router.push("/work-logs")} />
      <TextAction label="업무 일정" icon="calendar-outline" onPress={() => router.push("/work-schedules")} />
    </View>
    <View style={{ marginVertical: 8 }}>
      <TextAction label="계정·도장 설정" icon="settings-outline" onPress={() => router.push("/account")} />
    </View>
    <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Text style={{ color: theme.text, fontSize: 16, fontWeight: "800" }}>기기 알림</Text>
      <Text style={{ color: theme.secondary, fontSize: 13, lineHeight: 19, marginTop: 5, marginBottom: 8 }}>
        {pushLoading || (!pushStatus && !pushError && Platform.OS !== "web") ? "알림 설정 확인 중..." :
          pushNeedsSettings ? "기기 알림 권한이 꺼져 있습니다." : pushError ? "알림 설정을 완료하지 못했습니다. 아래에서 다시 시도하세요." :
          pushStatus?.enabled ? "새 결재와 진행 소식을 이 기기로 받습니다." : "새 결재와 진행 소식을 기기로 받아보세요."}
      </Text>
      {Platform.OS === "web" ? <Text style={{ color: theme.secondary, fontSize: 13 }}>설치한 모바일 앱에서 설정할 수 있습니다.</Text> : <>
        {pushNeedsSettings ? <View style={{ gap: 4 }}>
          <PrimaryButton title="기기 알림 설정 열기" disabled={pushPending} onPress={() => void openPushSettings()} />
          <TextAction label={pushPending ? "등록 중..." : "알림 등록 다시 시도"} icon="refresh" disabled={pushPending} onPress={() => void retryPushRegistration()} />
        </View> : pushStatus?.enabled ? null : pushStatus ?
          <PrimaryButton title={pushPending ? "설정 중..." : pushError ? "알림 설정 다시 시도" : "이 기기에서 알림 받기"} disabled={pushPending} onPress={() => void (pushError ? retryPushRegistration() : enablePush())} /> : null}
        {pushStatus?.enabled ? <TextAction label={pushPending ? "변경 중..." : "이 기기 알림 끄기"} icon="notifications-off-outline" disabled={pushPending} onPress={() => void disablePush()} /> : null}
        {pushError && !pushNeedsSettings && (pushStatus?.enabled || !pushStatus) ? <TextAction label={pushPending ? "확인 중..." : "알림 설정 다시 시도"} icon="refresh" disabled={pushPending} onPress={() => void retryPushRegistration()} /> : null}
        <AccountFeedback error={pushError} message={pushMessage} />
      </>}
    </View>
    <View style={{ marginTop: 12 }}><TextAction label="로그아웃" icon="log-out-outline" onPress={confirmSignOut} /></View>
  </ScrollView>;
}
const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingBottom: 24, maxWidth: 720, width: "100%", alignSelf: "center" },
  panel: { borderWidth: 1, borderRadius: 12, padding: 12 },
});
