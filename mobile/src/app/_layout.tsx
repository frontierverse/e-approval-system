import { Stack } from "expo-router";
import { ActivityIndicator, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { DailyReportBackButton } from "@/components/daily-report-back-button";
import { TextAction } from "@/components/ui";
import { ChatProvider } from "@/lib/chat-provider";
import { YouthProvider } from "@/components/youth-provider";
import { ResourceProvider } from "@/providers/ResourceProvider";
import { NotificationsProvider, useNotifications } from "@/lib/notifications";
import { SessionProvider, useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";

function Navigation() {
  const { user, loading } = useSession();
  const theme = useTheme();
  const { notificationOpenError, retryNotificationOpen, dismissNotificationOpenError } = useNotifications();
  if (loading) return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.background }}><ActivityIndicator color={theme.accent} /></View>;
  return <>
    <StatusBar style="auto" />
    {notificationOpenError ? <View style={{ paddingHorizontal: 16, paddingTop: 8, backgroundColor: theme.dangerSoft, borderBottomWidth: 1, borderBottomColor: theme.border }}>
      <Text accessibilityRole="alert" style={{ color: theme.danger, fontSize: 13, lineHeight: 19 }}>{notificationOpenError}</Text>
      <View style={{ flexDirection: "row", gap: 8 }}><TextAction label="알림 문서 다시 열기" icon="refresh" onPress={() => void retryNotificationOpen()} /><TextAction label="닫기" onPress={dismissNotificationOpenError} /></View>
    </View> : null}
    <Stack screenOptions={{ headerStyle: { backgroundColor: theme.surface }, headerTintColor: theme.text, contentStyle: { backgroundColor: theme.background }, headerShadowVisible: false }}>
      <Stack.Protected guard={!user}><Stack.Screen name="login" options={{ headerShown: false }} /></Stack.Protected>
      <Stack.Protected guard={!!user}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="drafts/new" options={{ title: "새 기안" }} />
        <Stack.Screen name="drafts/[id]" options={{ title: "기안 수정" }} />
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
    </Stack>
  </>;
}

export default function RootLayout() {
  return <SessionProvider><NotificationsProvider><ChatProvider><ResourceProvider><YouthProvider><Navigation /></YouthProvider></ResourceProvider></ChatProvider></NotificationsProvider></SessionProvider>;
}
