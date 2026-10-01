import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { EmptyState, ErrorState, ScreenHeading } from "@/components/ui";
import { InboxList } from "@/components/inbox-list";
import { useTheme } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";
import type { InboxResponse } from "@/lib/types";

export default function Inbox() {
  const theme = useTheme();
  const { data, loading, refreshing, error, reload } = useLoad<InboxResponse>("/inbox");
  return <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content}
    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={theme.accent} />}>
    <ScreenHeading title="받은결재" subtitle="내가 처리할 문서" />
    <View style={styles.countRow}><Text style={{ color: theme.secondary }}>대기 중</Text>
      <Text style={{ color: theme.text, fontWeight: "800", fontVariant: ["tabular-nums"] }}>{data?.total ?? "—"}건</Text></View>
    {loading && !data ? <ActivityIndicator style={styles.state} color={theme.accent} /> :
      error && !data ? <ErrorState message={error} retry={reload} /> :
      data?.documents.length ? <InboxList documents={data.documents} /> :
      <EmptyState title="대기 중인 결재가 없습니다" detail="새 결재가 도착하면 이 목록에 나타납니다." />}
    {data && data.total > data.documents.length ? <Text style={{ color: theme.secondary, marginTop: 12, textAlign: "center" }}>최근 {data.documents.length}건을 표시합니다.</Text> : null}
    {error && data ? <Text style={{ color: theme.danger, marginTop: 10 }}>{error}</Text> : null}
  </ScrollView>;
}
const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingBottom: 24, maxWidth: 720, width: "100%", alignSelf: "center" },
  countRow: { flexDirection: "row", gap: 7, alignItems: "center", marginBottom: 10, minHeight: 26 },
  state: { height: 90 },
});
