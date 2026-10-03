import { Stack } from "expo-router";
import { ActivityIndicator, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { TextAction } from "@/components/ui";
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
        <Stack.Screen name="account" options={{ title: "계정·도장 설정" }} />
      </Stack.Protected>
    </Stack>
  </>;
}

export default function RootLayout() {
  return <SessionProvider><NotificationsProvider><Navigation /></NotificationsProvider></SessionProvider>;
}
