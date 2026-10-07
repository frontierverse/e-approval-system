import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

if (Platform.OS !== "web") Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});
export class PushPermissionError extends Error {
  constructor() { super("기기 설정에서 바자울 알림 권한을 허용한 뒤 다시 등록하세요."); }
}
function checkActive(isActive: () => boolean) {
  if (!isActive()) { const error = new Error("알림 작업을 취소했습니다."); error.name = "AbortError"; throw error; }
}
function allowsNotifications(permission: Notifications.NotificationPermissionsStatus) {
  return permission.granted || permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL || permission.ios?.status === Notifications.IosAuthorizationStatus.EPHEMERAL;
}
export async function getPushToken(requestPermission = true, devicePushToken?: Notifications.DevicePushToken, isActive: () => boolean = () => true) {
  checkActive(isActive);
  if (Platform.OS === "web") throw new Error("푸시 알림은 설치한 모바일 앱에서 설정할 수 있습니다.");
  const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
  if (typeof projectId !== "string" || !projectId) throw new Error("앱의 EAS 프로젝트 ID가 설정되지 않았습니다.");
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("approvals", { name: "결재 알림", importance: Notifications.AndroidImportance.HIGH });
    await Notifications.setNotificationChannelAsync("work", { name: "업무 알림", importance: Notifications.AndroidImportance.HIGH, sound: "default" });
    checkActive(isActive);
  }
  let permission = await Notifications.getPermissionsAsync();
  checkActive(isActive);
  // Only an explicit first-time user action may prompt. A denial goes through device settings.
  if (!allowsNotifications(permission) && requestPermission && permission.status === "undetermined" && permission.canAskAgain) {
    permission = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: true, allowSound: true } });
    checkActive(isActive);
  }
  if (!allowsNotifications(permission)) {
    if (!requestPermission) return null;
    throw new PushPermissionError();
  }
  try {
    // The rollover listener passes its token directly: fetching a device token inside it can loop.
    const token = (await Notifications.getExpoPushTokenAsync({ projectId, ...(devicePushToken ? { devicePushToken } : {}) })).data;
    checkActive(isActive);
    if (!/^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]{10,200}\]$/.test(token)) throw new Error("invalid push token");
    return token;
  } catch (error) {
    checkActive(isActive);
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new Error("알림을 등록하지 못했습니다. 연결을 확인하고 다시 시도하세요.");
  }
}
export function validNotificationDocumentId(value: unknown) { return typeof value === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(value) ? value : null; }
export function notificationDocumentId(response: Notifications.NotificationResponse | null) { return validNotificationDocumentId(response?.notification.request.content.data?.documentId); }
