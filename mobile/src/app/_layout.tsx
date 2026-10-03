import { router, Stack } from "expo-router";
import * as Notifications from "expo-notifications";
import { useEffect } from "react";
import { ActivityIndicator, Platform, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { apiRequest } from "@/lib/api";
import { getPushToken, notificationDocumentId } from "@/lib/push";
import { SessionProvider, useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";

function Navigation() {
  const { user, token, loading } = useSession();
  const theme = useTheme();
  useEffect(() => {
    if (!user || Platform.OS === "web") return;
    const open = (response: Notifications.NotificationResponse | null) => {
      const documentId = notificationDocumentId(response);
      if (!documentId) return;
      Notifications.clearLastNotificationResponse();
      router.push("/documents/" + documentId);
    };
    const listener = Notifications.addNotificationResponseReceivedListener(open);
    void Notifications.getLastNotificationResponseAsync().then(open).catch(() => undefined);
    return () => listener.remove();
  }, [user]);

  useEffect(() => {
    if (!user || !token || Platform.OS === "web") return;
    let active = true;
    void (async () => {
      const status = await apiRequest<{ enabled: boolean }>("/push-subscription", { token });
      if (!status.enabled || !active) return;
      const pushToken = await getPushToken(false);
      if (!active) return;
      if (pushToken) {
        await apiRequest("/push-subscription", {
          token, method: "POST", body: { expoPushToken: pushToken },
        });
      } else {
        await apiRequest("/push-subscription", { token, method: "DELETE" });
      }
    })().catch(() => undefined);
    return () => { active = false; };
  }, [user, token]);
  if (loading) return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.background }}><ActivityIndicator color={theme.accent} /></View>;
  return <>
    <StatusBar style="auto" />
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
  return <SessionProvider><Navigation /></SessionProvider>;
}
