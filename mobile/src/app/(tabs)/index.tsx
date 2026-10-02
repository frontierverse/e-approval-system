import { router } from "expo-router";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { EmptyState, ErrorState, ScreenHeading, TextAction } from "@/components/ui";
import { InboxList } from "@/components/inbox-list";
import { useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";
import type { HomeResponse } from "@/lib/types";

export default function Home() {
  const theme = useTheme();
  const { user } = useSession();
  const { data, loading, refreshing, error, reload } = useLoad<HomeResponse>("/home");
  const showApprovalQueue = user?.canApproveDocuments === true && data?.canApproveDocuments === true;
  return <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content}
    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={theme.accent} />}>
    <ScreenHeading title="오늘의 업무" subtitle={[user?.name, user?.positionName].filter(Boolean).join(" · ")} action={<TextAction label="새 기안" icon="add" onPress={() => router.push("/drafts/new")} />} />
    {loading && !data ? <HomeLoading /> :
      error && !data ? <ErrorState message={error} retry={reload} /> :
      data ? <>
        <View style={styles.summaryRow}>
          <View style={[styles.summary, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.summaryLabel, { color: theme.secondary }]}>{showApprovalQueue ? "처리할 결재" : "내 상신 진행"}</Text>
            <Text style={[styles.count, { color: theme.text }]}>{showApprovalQueue ? data.counts.activeInbox : data.counts.activeSent}<Text style={styles.unit}>건</Text></Text>
          </View>
          <View style={[styles.summary, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.summaryLabel, { color: theme.secondary }]}>{showApprovalQueue ? "내 상신 진행" : "회수 문서"}</Text>
            <Text style={[styles.count, { color: theme.text }]}>{showApprovalQueue ? data.counts.activeSent : data.counts.recalled}<Text style={styles.unit}>건</Text></Text>
          </View>
        </View>
        {showApprovalQueue ? <>
          <View style={styles.sectionHeader}>
            <Text accessibilityRole="header" style={[styles.sectionTitle, { color: theme.text }]}>받은결재</Text>
            <TextAction label="받은결재 전체 보기" icon="arrow-forward" onPress={() => router.push("/inbox")} />
          </View>
          {data.inboxDocuments?.length ? <InboxList documents={data.inboxDocuments} /> :
            <EmptyState title="처리할 결재가 없습니다" detail="본인에게 배정된 결재만 표시됩니다." />}
        </> : null}
        <View style={styles.sectionHeader}>
          <Text accessibilityRole="header" style={[styles.sectionTitle, { color: theme.text }]}>내가 올린 문서</Text>
          <Text style={{ color: theme.secondary, fontSize: 12 }}>{data.counts.activeSent}건 진행 중</Text>
        </View>
        {data.sentDocuments.length ? <InboxList documents={data.sentDocuments} showProgress /> :
          <EmptyState title="진행 중인 내 문서가 없습니다" detail="새 기안을 작성해 상신하면 진행 상황을 여기서 확인할 수 있습니다." />}
        {data.counts.activeSent > data.sentDocuments.length ? <Text style={{ color: theme.secondary, marginTop: 10, fontSize: 12 }}>
          진행 중인 {data.counts.activeSent}건 중 {data.sentDocuments.length}건 표시 · 전체 문서는 웹에서 확인할 수 있습니다.
        </Text> : null}
      </> : null}
    {error && data ? <Text style={{ color: theme.danger, marginTop: 10 }}>{error}</Text> : null}
  </ScrollView>;
}

function HomeLoading() {
  const theme = useTheme();
  return <>
    <View style={styles.summaryRow}>
      {[0, 1].map(index => <View key={index} style={[styles.summary, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={{ width: 70, height: 12, marginTop: 3, backgroundColor: theme.surfaceMuted }} />
        <View style={{ width: 50, height: 28, marginTop: 6, backgroundColor: theme.surfaceMuted }} />
      </View>)}
    </View>
    <View style={styles.sectionHeader}>
      <Text style={{ color: theme.secondary }}>문서 불러오는 중</Text>
      <ActivityIndicator color={theme.accent} />
    </View>
    <View style={{ borderWidth: 1, borderColor: theme.border, borderRadius: 12, overflow: "hidden" }}>
      {[0, 1].map(index => <View key={index} style={{ minHeight: 74, padding: 14, backgroundColor: theme.surface,
        borderTopWidth: index ? 1 : 0, borderTopColor: theme.border }}>
        <View style={{ width: "75%", height: 16, backgroundColor: theme.surfaceMuted }} />
        <View style={{ width: "50%", height: 12, marginTop: 8, backgroundColor: theme.surfaceMuted }} />
      </View>)}
    </View>
  </>;
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingBottom: 24, maxWidth: 720, width: "100%", alignSelf: "center" },
  summaryRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  summary: { flex: 1, minWidth: 140, borderWidth: 1, borderRadius: 12, minHeight: 77, paddingHorizontal: 16, paddingVertical: 10 },
  summaryLabel: { fontSize: 13 },
  count: { fontSize: 26, fontWeight: "800", marginTop: 1, fontVariant: ["tabular-nums"] },
  unit: { fontSize: 14, fontWeight: "600" },
  sectionHeader: { marginTop: 12, marginBottom: 6, minHeight: 44, flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 },
  sectionTitle: { flexShrink: 0, fontSize: 17, fontWeight: "800" },
});
