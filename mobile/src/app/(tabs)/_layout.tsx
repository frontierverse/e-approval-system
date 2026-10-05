import { Feather } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { StyleSheet, View, type ColorValue } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHomeTheme as useTheme } from "@/lib/home-theme";
import { useSession } from "@/lib/session";
import { notificationBadge, useNotifications } from "@/lib/notifications";

export default function TabsLayout() {
  const theme = useTheme();
  const { user } = useSession();
  const insets = useSafeAreaInsets();
  const { unreadCount, refreshUnreadCount } = useNotifications();
  return <Tabs screenListeners={{ focus: () => { void refreshUnreadCount().catch(() => undefined); } }} screenOptions={{
    headerShown: false,
    tabBarActiveTintColor: theme.accent,
    tabBarInactiveTintColor: theme.muted,
    tabBarShowLabel: false,
    tabBarStyle: { backgroundColor: theme.tab, borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth, height: 56 + insets.bottom, paddingHorizontal: 8, paddingTop: 0, paddingBottom: insets.bottom, elevation: 0 },
    tabBarIconStyle: { width: "100%", maxWidth: 56, height: 32 },
    tabBarItemStyle: { minHeight: 48 },
  }}>
    <Tabs.Screen name="index" options={{ title: "홈", tabBarAccessibilityLabel: "홈", tabBarIcon: ({ color, focused }) => <TabIcon name="home" color={color} focused={focused} /> }} />
    <Tabs.Protected guard={user?.canApproveDocuments === true}>
      <Tabs.Screen name="inbox" options={{ title: "받은결재", tabBarAccessibilityLabel: "받은결재", tabBarIcon: ({ color, focused }) => <TabIcon name="inbox" color={color} focused={focused} /> }} />
    </Tabs.Protected>
    <Tabs.Screen name="drafts" options={{ title: "문서함", tabBarAccessibilityLabel: "문서함", tabBarIcon: ({ color, focused }) => <TabIcon name="folder" color={color} focused={focused} /> }} />
    <Tabs.Screen name="notifications" options={{ title: "알림", tabBarBadge: notificationBadge(unreadCount), tabBarBadgeStyle: { backgroundColor: theme.dangerFill, color: "#FFFFFF", fontSize: 10 }, tabBarAccessibilityLabel: unreadCount ? "알림, 읽지 않은 알림 " + unreadCount.toLocaleString("ko-KR") + "건" : "알림", tabBarIcon: ({ color, focused }) => <TabIcon name="bell" color={color} focused={focused} /> }} />
    <Tabs.Screen name="profile" options={{ title: "내 정보", tabBarAccessibilityLabel: "내 정보", tabBarIcon: ({ color, focused }) => <TabIcon name="user" color={color} focused={focused} /> }} />
  </Tabs>;
}

function TabIcon({ name, color, focused }: { name: keyof typeof Feather.glyphMap; color: ColorValue; focused: boolean }) {
  const theme = useTheme();
  return <View style={{ width: "100%", maxWidth: 56, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: focused ? theme.accentSoft : "transparent" }}>
    <Feather aria-hidden accessible={false} name={name} size={24} color={color} />
  </View>;
}
