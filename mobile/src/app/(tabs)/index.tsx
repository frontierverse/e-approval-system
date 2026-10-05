import { router, useFocusEffect } from "expo-router";
import { HomeDashboard } from "@/components/home-dashboard";
import { useSession } from "@/lib/session";
import { useCallback, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useHomeTheme as useTheme } from "@/lib/home-theme";
import type { HomeResponse } from "@/lib/types";

export default function Home() {
  const { token } = useSession();
  return <HomeContent key={token} />;
}

function HomeContent() {
  const { user } = useSession();
  const { data, loading, refreshing, error, reload } = useHomeData();
  const openSent = (status: "all" | "active") => router.push({
    pathname: "/(tabs)/drafts",
    params: { folder: "sent", status, q: "", dateFrom: "", dateTo: "", page: "1" },
  });
  return <HomeDashboard user={user} data={data} loading={loading} refreshing={refreshing} error={error}
    reload={reload} openNew={() => router.push("/drafts/new")}
    openInbox={() => router.push("/inbox")} openSent={() => openSent("all")} openActiveSent={() => openSent("active")}
    openRecalled={() => router.push({ pathname: "/(tabs)/drafts", params: { folder: "drafts", status: "recalled", q: "", dateFrom: "", dateTo: "", page: "1" } })}
    openDocument={id => router.push(`/documents/${id}`)} workShortcuts={data ? <HomeWorkShortcuts data={data} /> : null} />;
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

const styles = StyleSheet.create({
  shortcutRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  shortcut: { flex: 1, minWidth: 130, minHeight: 64, paddingHorizontal: 8, paddingVertical: 8, borderRadius: 10, borderWidth: 2, justifyContent: "center" },
});
