import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function getPushToken(requestPermission = true) {
  if (Platform.OS === "web") throw new Error("푸시 알림은 설치한 모바일 앱에서 설정할 수 있습니다.");
  const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
  if (typeof projectId !== "string" || !projectId) {
    throw new Error("앱의 EAS 프로젝트 ID가 설정되지 않았습니다.");
  }
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("approvals", {
      name: "결재 알림",
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  const existing = await Notifications.getPermissionsAsync();
  const permission = existing.granted || !requestPermission
    ? existing
    : await Notifications.requestPermissionsAsync();
  if (!permission.granted) {
    if (!requestPermission) return null;
    throw new Error("기기 설정에서 바자울 알림 권한을 허용하세요.");
  }
  return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
}

export function notificationDocumentId(response: Notifications.NotificationResponse | null) {
  const value = response?.notification.request.content.data?.documentId;
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(value) ? value : null;
}
