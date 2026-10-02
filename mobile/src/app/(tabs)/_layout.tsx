import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/lib/theme";
import { useSession } from "@/lib/session";

export default function TabsLayout() {
  const theme = useTheme();
  const { user } = useSession();
  const insets = useSafeAreaInsets();
  return <Tabs screenOptions={{
    headerShown: false,
    tabBarActiveTintColor: theme.accent,
    tabBarInactiveTintColor: theme.muted,
    tabBarStyle: { backgroundColor: theme.tab, borderTopColor: theme.border, height: 59 + insets.bottom, paddingTop: 5, paddingBottom: Math.max(insets.bottom, 6) },
    tabBarLabelStyle: { fontSize: 12, fontWeight: "700" },
    tabBarItemStyle: { minHeight: 48 },
  }}>
    <Tabs.Screen name="index" options={{ title: "홈", tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "home" : "home-outline"} size={22} color={color} /> }} />
    <Tabs.Protected guard={user?.canApproveDocuments === true}>
      <Tabs.Screen name="inbox" options={{ title: "받은결재", tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "file-tray-full" : "file-tray-full-outline"} size={22} color={color} /> }} />
    </Tabs.Protected>
    <Tabs.Screen name="drafts" options={{ title: "문서함", tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "folder" : "folder-outline"} size={22} color={color} /> }} />
    <Tabs.Screen name="notifications" options={{ title: "알림", tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "notifications" : "notifications-outline"} size={22} color={color} /> }} />
    <Tabs.Screen name="profile" options={{ title: "내 정보", tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "person" : "person-outline"} size={22} color={color} /> }} />
  </Tabs>;
}
