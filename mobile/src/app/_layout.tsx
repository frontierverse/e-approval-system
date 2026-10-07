import { Stack } from "expo-router";
import { ActivityIndicator, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { AppUpdateStatus } from "@/components/app-update-status";
import { AppUpdatesProvider } from "@/providers/AppUpdatesProvider";
import { DailyReportBackButton } from "@/components/daily-report-back-button";
import { TextAction } from "@/components/ui";
import { ChatProvider } from "@/lib/chat-provider";
import { YouthProvider } from "@/components/youth-provider";
import { ResourceProvider } from "@/providers/ResourceProvider";
import { LunchCafeProvider } from "@/providers/LunchCafeProvider";
import { DraftRecoveryProvider } from "@/providers/DraftRecoveryProvider";
import { NotificationsProvider, useNotifications } from "@/lib/notifications";
import { SessionProvider, useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";
import { useHomeTheme } from "@/lib/home-theme";

function Navigation() {
  const { user, loading } = useSession();
  const theme = useTheme(), draftTheme = useHomeTheme();
  const { notificationOpenError, retryNotificationOpen, dismissNotificationOpenError } = useNotifications();
  if (loading) return <View style={{ flex: 1, backgroundColor: theme.background }}><View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={theme.accent} /></View><AppUpdateStatus canNavigate={false} /></View>;
  return <View style={{ flex: 1, backgroundColor: theme.background }}>
    <StatusBar style="auto" />
    {notificationOpenError ? <View style={{ paddingHorizontal: 16, paddingTop: 8, backgroundColor: theme.dangerSoft, borderBottomWidth: 1, borderBottomColor: theme.border }}>
      <Text accessibilityRole="alert" style={{ color: theme.danger, fontSize: 13, lineHeight: 19 }}>{notificationOpenError}</Text>
      <View style={{ flexDirection: "row", gap: 8 }}><TextAction label="알림 문서 다시 열기" icon="refresh" onPress={() => void retryNotificationOpen()} /><TextAction label="닫기" onPress={dismissNotificationOpenError} /></View>
    </View> : null}
    <View style={{ flex: 1 }}><Stack screenOptions={{ headerStyle: { backgroundColor: theme.surface }, headerTintColor: theme.text, contentStyle: { backgroundColor: theme.background }, headerShadowVisible: false }}>
      <Stack.Protected guard={!user}><Stack.Screen name="login" options={{ headerShown: false }} /></Stack.Protected>
      <Stack.Protected guard={!!user}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="drafts/new" options={{ title: "새 기안", headerTintColor: draftTheme.text, headerStyle: { backgroundColor: draftTheme.surface }, headerTitleStyle: { fontSize: 17, fontWeight: "700" }, contentStyle: { backgroundColor: draftTheme.background } }} />
        <Stack.Screen name="drafts/recovery" options={{ title: "작성 복구", headerBackVisible: false, headerLeft: ({ canGoBack }) => canGoBack ? <DailyReportBackButton label="작성 복구 뒤로" /> : null }} />
        <Stack.Screen name="drafts/[id]" options={{ title: "기안 수정", headerTintColor: draftTheme.text, headerStyle: { backgroundColor: draftTheme.surface }, headerTitleStyle: { fontSize: 17, fontWeight: "700" }, contentStyle: { backgroundColor: draftTheme.background } }} />
        <Stack.Screen name="documents/[id]" options={{ title: "결재 문서" }} />
        <Stack.Screen name="attachments/[id]" options={{ title: "첨부파일" }} />
        <Stack.Screen name="chat/index" options={{ title: "직원 채팅", headerBackVisible: false, headerLeft: ({ canGoBack }) => canGoBack ? <DailyReportBackButton label="직원 채팅 뒤로" /> : null }} />
        <Stack.Screen name="chat/[peerId]" options={{ title: "직원 대화", headerBackVisible: false, headerLeft: ({ canGoBack }) => canGoBack ? <DailyReportBackButton label="직원 채팅 뒤로" /> : null }} />
        <Stack.Screen name="chat/file-preview" options={{ title: "채팅 파일 미리보기", headerBackVisible: false, headerLeft: ({ canGoBack }) => canGoBack ? <DailyReportBackButton label="직원 채팅 뒤로" /> : null }} />
        <Stack.Screen name="resources/index" options={{ title: "자료실", headerBackVisible: false, headerLeft: ({ canGoBack }) => canGoBack ? <DailyReportBackButton label="자료실 뒤로" /> : null }} />
        <Stack.Screen name="resources/new" options={{ title: "자료 등록", headerBackVisible: false, headerLeft: ({ canGoBack }) => canGoBack ? <DailyReportBackButton label="자료실 뒤로" /> : null }} />
        <Stack.Screen name="resources/[id]" options={{ title: "자료 상세", headerBackVisible: false, headerLeft: ({ canGoBack }) => canGoBack ? <DailyReportBackButton label="자료실 뒤로" /> : null }} />
        <Stack.Screen name="resources/[id]/edit" options={{ title: "자료 수정", headerBackVisible: false, headerLeft: ({ canGoBack }) => canGoBack ? <DailyReportBackButton label="자료실 뒤로" /> : null }} />
        <Stack.Screen name="resources/[id]/viewers" options={{ title: "자료 열람 현황", headerBackVisible: false, headerLeft: ({ canGoBack }) => canGoBack ? <DailyReportBackButton label="자료실 뒤로" /> : null }} />
        <Stack.Screen name="resources/attachments/[id]" options={{ title: "자료 첨부파일", headerBackVisible: false, headerLeft: ({ canGoBack }) => canGoBack ? <DailyReportBackButton label="자료실 뒤로" /> : null }} />
        <Stack.Screen name="youth/index" options={{ title: "청소년 관리", headerBackVisible: false, headerLeft: ({ canGoBack }) => canGoBack ? <DailyReportBackButton label="청소년 관리 뒤로" /> : null }} />
        <Stack.Screen name="youth/new" options={{ title: "청소년 등록", headerBackVisible: false, headerLeft: ({ canGoBack }) => canGoBack ? <DailyReportBackButton label="청소년 관리 뒤로" /> : null }} />
        <Stack.Screen name="youth/[id]" options={{ title: "청소년 상세", headerBackVisible: false, headerLeft: ({ canGoBack }) => canGoBack ? <DailyReportBackButton label="청소년 관리 뒤로" /> : null }} />
        <Stack.Screen name="youth/[id]/edit" options={{ title: "청소년 수정", headerBackVisible: false, headerLeft: ({ canGoBack }) => canGoBack ? <DailyReportBackButton label="청소년 관리 뒤로" /> : null }} />
        <Stack.Screen name="youth/[id]/extension" options={{ title: "퇴소 연장", headerBackVisible: false, headerLeft: ({ canGoBack }) => canGoBack ? <DailyReportBackButton label="청소년 관리 뒤로" /> : null }} />
        <Stack.Screen name="youth/[id]/personal-schedule" options={{ title: "개인 일정", headerBackVisible: false, headerLeft: ({ canGoBack }) => canGoBack ? <DailyReportBackButton label="청소년 관리 뒤로" /> : null }} />
        <Stack.Screen name="youth/[id]/learning" options={{ title: "학습 관리", headerBackVisible: false, headerLeft: ({ canGoBack }) => canGoBack ? <DailyReportBackButton label="청소년 관리 뒤로" /> : null }} />
        <Stack.Screen name="youth/[id]/history" options={{ title: "청소년 변경 이력", headerBackVisible: false, headerLeft: ({ canGoBack }) => canGoBack ? <DailyReportBackButton label="청소년 관리 뒤로" /> : null }} />
        <Stack.Screen name="youth/common-schedule" options={{ title: "공통 시간표", headerBackVisible: false, headerLeft: ({ canGoBack }) => canGoBack ? <DailyReportBackButton label="청소년 관리 뒤로" /> : null }} />
        <Stack.Screen name="youth/rules" options={{ title: "청소년 규칙", headerBackVisible: false, headerLeft: ({ canGoBack }) => canGoBack ? <DailyReportBackButton label="청소년 관리 뒤로" /> : null }} />
        <Stack.Screen name="youth/[id]/documents" options={{ title: "결정문", headerBackVisible: false, headerLeft: ({ canGoBack }) => canGoBack ? <DailyReportBackButton label="청소년 관리 뒤로" /> : null }} />
        <Stack.Screen name="youth/activity-history" options={{ title: "처리 이력", headerBackVisible: false, headerLeft: ({ canGoBack }) => canGoBack ? <DailyReportBackButton label="청소년 관리 뒤로" /> : null }} />
        <Stack.Screen name="youth/study-concepts" options={{ title: "공용 학습 개념", headerBackVisible: false, headerLeft: ({ canGoBack }) => canGoBack ? <DailyReportBackButton label="청소년 관리 뒤로" /> : null }} />
        <Stack.Screen name="youth/decision-documents/[id]" options={{ title: "결정문 다운로드", headerBackVisible: false, headerLeft: ({ canGoBack }) => canGoBack ? <DailyReportBackButton label="청소년 관리 뒤로" /> : null }} />
        <Stack.Screen name="meal-menu/index" options={{ title: "급식 메뉴", headerBackVisible: false, headerLeft: ({ canGoBack }) => canGoBack ? <DailyReportBackButton label="급식 메뉴 뒤로" /> : null }} />
        <Stack.Screen name="cafe/index" options={{ title: "카페 물품", headerBackVisible: false, headerLeft: ({ canGoBack }) => canGoBack ? <DailyReportBackButton label="카페 뒤로" /> : null }} />
        <Stack.Screen name="cafe/items/new" options={{ title: "물품 등록", headerBackVisible: false, headerLeft: ({ canGoBack }) => canGoBack ? <DailyReportBackButton label="카페 뒤로" /> : null }} />
        <Stack.Screen name="cafe/items/[id]" options={{ title: "물품 상세", headerBackVisible: false, headerLeft: ({ canGoBack }) => canGoBack ? <DailyReportBackButton label="카페 뒤로" /> : null }} />
        <Stack.Screen name="cafe/items/[id]/edit" options={{ title: "물품 수정", headerBackVisible: false, headerLeft: ({ canGoBack }) => canGoBack ? <DailyReportBackButton label="카페 뒤로" /> : null }} />
        <Stack.Screen name="cafe/items/[id]/hold" options={{ title: "유통기한 보류", headerBackVisible: false, headerLeft: ({ canGoBack }) => canGoBack ? <DailyReportBackButton label="카페 뒤로" /> : null }} />
        <Stack.Screen name="cafe/history" options={{ title: "물품 변경 이력", headerBackVisible: false, headerLeft: ({ canGoBack }) => canGoBack ? <DailyReportBackButton label="카페 뒤로" /> : null }} />
        <Stack.Screen name="cafe/notes" options={{ title: "카페 준수사항", headerBackVisible: false, headerLeft: ({ canGoBack }) => canGoBack ? <DailyReportBackButton label="카페 뒤로" /> : null }} />
        <Stack.Screen name="cafe/notes/new" options={{ title: "준수사항 등록", headerBackVisible: false, headerLeft: ({ canGoBack }) => canGoBack ? <DailyReportBackButton label="카페 뒤로" /> : null }} />
        <Stack.Screen name="account" options={{ title: "계정·도장 설정" }} />
        <Stack.Screen name="tasks/index" options={{ title: "내 할 일" }} />
        <Stack.Screen name="tasks/new" options={{ title: "할 일 등록" }} />
        <Stack.Screen name="tasks/[id]" options={{ title: "할 일 상세·이력" }} />
        <Stack.Screen name="work-schedules/index" options={{ title: "업무 일정", headerBackVisible: false, headerLeft: ({ canGoBack }) => canGoBack ? <DailyReportBackButton label="업무 일정 뒤로" /> : null }} />
        <Stack.Screen name="work-schedules/edit" options={{ title: "일정 작성", headerBackVisible: false, headerLeft: ({ canGoBack }) => canGoBack ? <DailyReportBackButton label="업무 일정 뒤로" /> : null }} />
        <Stack.Screen name="work-schedules/[id]" options={{ title: "일정 상세", headerBackVisible: false, headerLeft: ({ canGoBack }) => canGoBack ? <DailyReportBackButton label="업무 일정 뒤로" /> : null }} />
        <Stack.Screen name="work-schedules/history" options={{ title: "일정 변경 내역", headerBackVisible: false, headerLeft: ({ canGoBack }) => canGoBack ? <DailyReportBackButton label="업무 일정 뒤로" /> : null }} />
        <Stack.Screen name="work-logs/index" options={{ title: "업무일지", headerBackVisible: false, headerLeft: ({ canGoBack }) => canGoBack ? <DailyReportBackButton label="업무일지 뒤로" /> : null }} />
        <Stack.Screen name="work-logs/edit" options={{ title: "업무일지 작성", headerBackVisible: false, headerLeft: ({ canGoBack }) => canGoBack ? <DailyReportBackButton label="업무일지 뒤로" /> : null }} />
        <Stack.Screen name="work-logs/[date]" options={{ title: "업무일지 상세", headerBackVisible: false, headerLeft: ({ canGoBack }) => canGoBack ? <DailyReportBackButton label="업무일지 뒤로" /> : null }} />
        <Stack.Screen name="daily-reports/index" options={{ title: "일일 업무보고", headerBackVisible: false, headerLeft: ({ canGoBack }) => canGoBack ? <DailyReportBackButton /> : null }} />
        <Stack.Screen name="daily-reports/edit" options={{ title: "업무보고 작성", headerBackVisible: false, headerLeft: ({ canGoBack }) => canGoBack ? <DailyReportBackButton /> : null }} />
        <Stack.Screen name="daily-reports/[id]" options={{ title: "업무보고 상세", headerBackVisible: false, headerLeft: ({ canGoBack }) => canGoBack ? <DailyReportBackButton /> : null }} />
      </Stack.Protected>
      <Stack.Screen name="public-information/privacy" options={{ headerShown: false }} />
      <Stack.Screen name="public-information/support" options={{ headerShown: false }} />
      <Stack.Screen name="app-updates" options={{ title: "앱 업데이트" }} />
    </Stack></View>
    <AppUpdateStatus />
  </View>;
}

export default function RootLayout() {
  return <AppUpdatesProvider><SessionProvider><NotificationsProvider><ChatProvider><ResourceProvider><YouthProvider><LunchCafeProvider><DraftRecoveryProvider><Navigation /></DraftRecoveryProvider></LunchCafeProvider></YouthProvider></ResourceProvider></ChatProvider></NotificationsProvider></SessionProvider></AppUpdatesProvider>;
}
