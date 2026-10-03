import { router, useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { EmptyState, ErrorState, ScreenHeading, TextAction } from "@/components/ui";
import { InboxList } from "@/components/inbox-list";
import { useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";
import type { HomeResponse } from "@/lib/types";

export default function Home() {
  const { token } = useSession();
  return <HomeContent key={token} />;
}

function HomeContent() {
  const theme = useTheme();
  const { user } = useSession();
  const { height, fontScale } = useWindowDimensions();
  const prioritizeWork = height < 500 || fontScale > 1.4;
  const { data, loading, refreshing, error, reload } = useHomeData();
  const showApprovalQueue = user?.canApproveDocuments === true && data?.canApproveDocuments === true;
  return <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content}
    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={theme.accent} />}>
    {prioritizeWork ? <View style={styles.compactHeading}><View style={{ flex: 1, minWidth: 0 }}>
      <Text accessibilityRole="header" aria-level={1} style={[styles.compactTitle, { color: theme.text }]}>오늘의 업무</Text>
      <Text style={{ color: theme.secondary, fontSize: 12, marginTop: 1 }}>{[user?.name, user?.positionName].filter(Boolean).join(" · ")}</Text>
    </View><TextAction label="새 기안" icon="add" onPress={() => router.push("/drafts/new")} /></View> :
      <ScreenHeading title="오늘의 업무" subtitle={[user?.name, user?.positionName].filter(Boolean).join(" · ")} action={<TextAction label="새 기안" icon="add" onPress={() => router.push("/drafts/new")} />} />}
    {loading && !data ? <HomeLoading prioritizeWork={prioritizeWork} /> :
      error && !data ? <ErrorState message={error} retry={reload} /> :
      data ? <>
        <View style={styles.summaryRow}>
          <View style={[styles.summary, prioritizeWork && styles.compactSummary, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.summaryLabel, { color: theme.secondary }]}>{showApprovalQueue ? "처리할 결재" : "내 상신 진행"}</Text>
            <Text style={[styles.count, { color: theme.text }]}>{showApprovalQueue ? data.counts.activeInbox : data.counts.activeSent}<Text style={styles.unit}>건</Text></Text>
          </View>
          <View style={[styles.summary, prioritizeWork && styles.compactSummary, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.summaryLabel, { color: theme.secondary }]}>{showApprovalQueue ? "내 상신 진행" : "회수 문서"}</Text>
            <Text style={[styles.count, { color: theme.text }]}>{showApprovalQueue ? data.counts.activeSent : data.counts.recalled}<Text style={styles.unit}>건</Text></Text>
          </View>
        </View>
        {!prioritizeWork ? <HomeWorkShortcuts data={data} /> : null}
        {showApprovalQueue ? <>
          <View style={[styles.sectionHeader, prioritizeWork && styles.compactSectionHeader]}>
            <Text accessibilityRole="header" aria-level={2} style={[styles.sectionTitle, { color: theme.text }]}>받은결재</Text>
            <TextAction label="받은결재 전체 보기" icon="arrow-forward" onPress={() => router.push("/inbox")} />
          </View>
          {data.inboxDocuments?.length ? <InboxList documents={data.inboxDocuments} /> :
            <EmptyState title="처리할 결재가 없습니다" detail="본인에게 배정된 결재만 표시됩니다." />}
          {prioritizeWork ? <HomeWorkShortcuts data={data} /> : null}
        </> : null}
        <View style={[styles.sectionHeader, prioritizeWork && styles.compactSectionHeader]}>
          <Text accessibilityRole="header" aria-level={2} style={[styles.sectionTitle, { color: theme.text }]}>내가 올린 문서</Text>
          <TextAction label="내 문서 전체 보기" icon="arrow-forward" onPress={() => router.push({ pathname: "/(tabs)/drafts", params: { folder: "sent", status: "all", q: "", dateFrom: "", dateTo: "", page: "1" } })} />
        </View>
        {data.sentDocuments.length ? <InboxList documents={data.sentDocuments} showProgress /> :
          <EmptyState title="진행 중인 내 문서가 없습니다" detail="새 기안을 작성해 상신하면 진행 상황을 여기서 확인할 수 있습니다." />}
        {prioritizeWork && !showApprovalQueue ? <HomeWorkShortcuts data={data} /> : null}
        {data.counts.activeSent > data.sentDocuments.length ? <Text style={{ color: theme.secondary, marginTop: 10, fontSize: 12 }}>
          진행 중인 {data.counts.activeSent}건 중 {data.sentDocuments.length}건 표시 · 문서함에서 모두 볼 수 있습니다.
        </Text> : null}
      </> : null}
    {error && data ? <Text style={{ color: theme.danger, marginTop: 10 }}>{error}</Text> : null}
  </ScrollView>;
}

function HomeWorkShortcuts({ data }: { data: HomeResponse }) {
  return <View style={styles.shortcutRow}><TaskHomeEntry counts={data.taskCounts} />
    <DailyReportHomeEntry summary={data.dailyReportSummary} /></View>;
}

function TaskHomeEntry({ counts }: { counts: HomeResponse["taskCounts"] }) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const known = counts && Number.isSafeInteger(counts.pending) && counts.pending >= 0 && Number.isSafeInteger(counts.overdue) && counts.overdue >= 0 && counts.overdue <= counts.pending ? counts : null;
  const label = known ? `미완료 ${known.pending.toLocaleString("ko-KR")}건 · 기한 초과 ${known.overdue.toLocaleString("ko-KR")}건` : "할 일 목록 보기";
  return <Pressable accessibilityRole="link" accessibilityLabel={`내 할 일, ${label}`} onPress={() => router.push("/tasks")}
    onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={({ pressed }) => [styles.shortcut, {
      borderColor: focused ? theme.accent : theme.border, backgroundColor: pressed || focused ? theme.accentSoft : theme.surface }]}>
    <Text style={{ color: theme.text, fontSize: 14, fontWeight: "800" }}>내 할 일</Text>
    <Text style={{ color: known?.overdue ? theme.danger : theme.secondary, fontSize: 12, lineHeight: 17, marginTop: 3, fontVariant: ["tabular-nums"] }}>
      {known ? `미완료 ${known.pending.toLocaleString("ko-KR")} · 초과 ${known.overdue.toLocaleString("ko-KR")}` : "목록 보기"}
    </Text>
  </Pressable>;
}

function DailyReportHomeEntry({ summary }: { summary: HomeResponse["dailyReportSummary"] }) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const states = { missing: "오늘 미작성", draft: "임시저장 · 미제출", submitted: "제출 완료", reviewed: "확인 완료" };
  const label = summary?.mode === "employee" ? (typeof states[summary.status] === "string" ? states[summary.status] : "상태 확인 필요") : summary?.mode === "director" ?
    Number.isSafeInteger(summary.submitted) && summary.submitted >= 0 && Number.isSafeInteger(summary.unreviewed) && summary.unreviewed >= 0 && summary.unreviewed <= summary.submitted ? `미확인 ${summary.unreviewed.toLocaleString("ko-KR")} · 제출 ${summary.submitted.toLocaleString("ko-KR")}` : "상태 확인 필요" : summary?.mode === "unavailable" ? "상태 확인 필요" : "보관함 보기";
  return <Pressable accessibilityRole="link" accessibilityLabel={`일일 업무보고, ${label}`} onPress={() => router.push("/daily-reports")}
    onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={({ pressed }) => [styles.shortcut, {
      borderColor: focused ? theme.accent : theme.border, backgroundColor: pressed || focused ? theme.accentSoft : theme.surface }]}>
    <Text style={{ color: theme.text, fontSize: 14, fontWeight: "800" }}>일일 업무보고</Text>
    <Text style={{ color: summary?.mode === "unavailable" ? theme.danger : theme.secondary, fontSize: 12, lineHeight: 17, marginTop: 3, fontVariant: ["tabular-nums"] }}>{label}</Text>
  </Pressable>;
}

function useHomeData() {
  const { request } = useSession();
  const [data, setData] = useState<HomeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sequence = useRef(0);
  const focused = useRef(false);
  const load = useCallback(async (refresh = false) => {
    if (!focused.current) return;
    const id = ++sequence.current;
    setLoading(true); setRefreshing(refresh);
    try {
      const response = await request<HomeResponse>("/home");
      if (id !== sequence.current || !focused.current) return;
      setData(response); setError(null);
    } catch (cause) {
      if (id === sequence.current && focused.current) setError(cause instanceof Error ? cause.message : "오늘의 업무를 불러오지 못했습니다.");
    } finally {
      if (id === sequence.current && focused.current) { setLoading(false); setRefreshing(false); }
    }
  }, [request]);
  useFocusEffect(useCallback(() => {
    focused.current = true; void load();
    return () => { focused.current = false; sequence.current++; };
  }, [load]));
  return { data, loading, refreshing, error, reload: () => load(true) };
}

function HomeLoading({ prioritizeWork }: { prioritizeWork: boolean }) {
  const theme = useTheme();
  return <>
    <View style={styles.summaryRow}>
      {[0, 1].map(index => <View key={index} style={[styles.summary, prioritizeWork && styles.compactSummary, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={{ width: 70, height: 12, marginTop: 3, backgroundColor: theme.surfaceMuted }} />
        <View style={{ width: 50, height: 28, marginTop: 6, backgroundColor: theme.surfaceMuted }} />
      </View>)}
    </View>
    {!prioritizeWork ? <HomeLoadingShortcuts /> : null}
    <View style={[styles.sectionHeader, prioritizeWork && styles.compactSectionHeader]}>
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
    {prioritizeWork ? <HomeLoadingShortcuts /> : null}
  </>;
}

function HomeLoadingShortcuts() {
  const theme = useTheme();
  return <View style={styles.shortcutRow}>{["내 할 일", "일일 업무보고"].map(label => <View key={label} style={[styles.shortcut, { borderColor: theme.border, backgroundColor: theme.surface }]}>
    <Text style={{ color: theme.secondary, fontSize: 14, fontWeight: "800" }}>{label}</Text>
    <Text style={{ color: theme.secondary, fontSize: 12, marginTop: 3 }}>상태 불러오는 중…</Text>
  </View>)}</View>;
}

const styles = StyleSheet.create({
  compactHeading: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 8, paddingBottom: 4 },
  compactTitle: { fontSize: 20, fontWeight: "800", letterSpacing: -0.4 },
  compactSummary: { minHeight: 64, paddingVertical: 6 },
  compactSectionHeader: { marginTop: 4, marginBottom: 4 },
  content: { paddingHorizontal: 16, paddingBottom: 24, maxWidth: 720, width: "100%", alignSelf: "center" },
  shortcutRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  shortcut: { flex: 1, minWidth: 0, minHeight: 64, paddingHorizontal: 8, paddingVertical: 8, borderRadius: 10, borderWidth: 2, justifyContent: "center" },
  summaryRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  summary: { flex: 1, minWidth: 0, borderWidth: 1, borderRadius: 12, minHeight: 77, paddingHorizontal: 16, paddingVertical: 10 },
  summaryLabel: { fontSize: 13 },
  count: { fontSize: 26, fontWeight: "800", marginTop: 1, fontVariant: ["tabular-nums"] },
  unit: { fontSize: 14, fontWeight: "600" },
  sectionHeader: { marginTop: 12, marginBottom: 6, minHeight: 44, flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 },
  sectionTitle: { flexShrink: 0, fontSize: 17, fontWeight: "800" },
});
