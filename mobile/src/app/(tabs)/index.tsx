import { router } from "expo-router";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { EmptyState, ErrorState, ScreenHeading, TextAction } from "@/components/ui";
import { InboxList } from "@/components/inbox-list";
import { useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";
import type { InboxResponse } from "@/lib/types";

export default function Home() {
  const theme = useTheme();
  const { user } = useSession();
  const { data, loading, refreshing, error, reload } = useLoad<InboxResponse>("/inbox");
  return <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content}
    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={theme.accent} />}>
    <ScreenHeading title="홈" subtitle={(user?.name ?? "") + "님의 결재 업무"} />
    <View style={[styles.summary, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View><Text style={[styles.summaryLabel, { color: theme.secondary }]}>처리할 결재</Text>
        <Text style={[styles.count, { color: theme.text }]}>{data?.total ?? "—"}<Text style={styles.unit}>건</Text></Text></View>
      <TextAction label="전체 보기" icon="arrow-forward" onPress={() => router.push("/inbox")} />
    </View>
    <View style={styles.sectionHeader}><Text style={[styles.sectionTitle, { color: theme.text }]}>바로 처리할 문서</Text></View>
    {loading && !data ? <ActivityIndicator style={styles.state} color={theme.accent} /> :
      error && !data ? <ErrorState message={error} retry={reload} /> :
      data?.documents.length ? <InboxList documents={data.documents.slice(0, 5)} /> :
      <EmptyState title="처리할 결재가 없습니다" detail="새로운 결재가 오면 여기에 표시됩니다." />}
    {error && data ? <Text style={{ color: theme.danger, marginTop: 10 }}>{error}</Text> : null}
  </ScrollView>;
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingBottom: 24, maxWidth: 720, width: "100%", alignSelf: "center" },
  summary: { borderWidth: 1, borderRadius: 12, minHeight: 77, paddingHorizontal: 16, paddingVertical: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  summaryLabel: { fontSize: 13 },
  count: { fontSize: 26, fontWeight: "800", marginTop: 1, fontVariant: ["tabular-nums"] },
  unit: { fontSize: 14, fontWeight: "600" },
  sectionHeader: { marginTop: 17, marginBottom: 9 },
  sectionTitle: { fontSize: 17, fontWeight: "800" },
  state: { height: 90 },
});
