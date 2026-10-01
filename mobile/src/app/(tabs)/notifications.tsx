import { router } from "expo-router";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { EmptyState, ErrorState, ScreenHeading } from "@/components/ui";
import { useSession } from "@/lib/session";
import { formatDate, useTheme } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";
import type { NotificationsResponse } from "@/lib/types";

export default function NotificationsScreen() {
  const theme = useTheme();
  const { request } = useSession();
  const { data, loading, refreshing, error, reload } = useLoad<NotificationsResponse>("/notifications");
  const open = async (documentId: string) => {
    await request("/notifications/read-document", { method: "POST", body: { documentId } }).catch(() => undefined);
    router.push("/documents/" + documentId);
  };
  return <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content}
    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={theme.accent} />}>
    <ScreenHeading title="알림" subtitle={data ? "읽지 않은 알림 " + data.unreadCount + "건" : "결재 진행 알림"} />
    {loading && !data ? <ActivityIndicator style={styles.state} color={theme.accent} /> :
      error && !data ? <ErrorState message={error} retry={reload} /> :
      data?.notifications.length ? <View style={[styles.list, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        {data.notifications.map((item, index) => <Pressable key={item.id} onPress={() => void open(item.documentId)}
          accessibilityRole="link" accessibilityLabel={item.title + ", 문서 열기"}
          style={({ pressed }) => [styles.row, index > 0 && { borderTopWidth: 1, borderTopColor: theme.border }, pressed && { backgroundColor: theme.surfaceMuted }]}>
          <View style={{ flex: 1 }}>
            <View style={styles.titleRow}>{!item.readAt ? <View style={[styles.dot, { backgroundColor: theme.accent }]} /> : null}
              <Text style={{ color: theme.text, fontSize: 15, fontWeight: item.readAt ? "600" : "800", flex: 1 }} numberOfLines={2}>{item.title}</Text></View>
            <Text style={{ color: theme.secondary, fontSize: 13, marginTop: 4 }} numberOfLines={2}>{item.message}</Text>
            <Text style={{ color: theme.muted, fontSize: 12, marginTop: 5 }}>{formatDate(item.createdAt)}</Text>
          </View>
        </Pressable>)}
      </View> : <EmptyState title="알림이 없습니다" detail="결재 진행 소식이 여기에 표시됩니다." />}
    {error && data ? <Text style={{ color: theme.danger, marginTop: 10 }}>{error}</Text> : null}
  </ScrollView>;
}
const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingBottom: 24, maxWidth: 720, width: "100%", alignSelf: "center" },
  list: { borderWidth: 1, borderRadius: 12, overflow: "hidden" },
  row: { minHeight: 78, paddingHorizontal: 14, paddingVertical: 12 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  state: { height: 90 },
});
