import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { AccountFeedback } from "@/components/account-feedback";
import { PrimaryButton, TextAction } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { dailyReportStatus, formatDailyReportDate, formatDailyReportTimestamp, isDailyReportDetail, isDailyReportId, isDailyReportMutation } from "@/lib/daily-reports";
import { useTheme } from "@/lib/theme";
import type { MobileDailyReportDetailResponse, MobileDailyReportMutationResponse } from "@/lib/types";

export function DailyReportDetailScreen({ reportId }: { reportId: string }) {
  const { token } = useSession();
  const scopeKey = `${token}:${reportId}`;
  const currentScope = useRef(scopeKey);
  useLayoutEffect(() => { currentScope.current = scopeKey; }, [scopeKey]);
  const isCurrentAccount = useCallback(() => !!token && currentScope.current === scopeKey, [scopeKey, token]);
  return token ? <DailyReportDetailContent key={scopeKey} reportId={reportId} isCurrentAccount={isCurrentAccount} /> : null;
}
function DailyReportDetailContent({ reportId, isCurrentAccount }: { reportId: string; isCurrentAccount: () => boolean }) {
  const { request, user } = useSession();
  const ownId = user?.id;
  const theme = useTheme();
  const [data, setData] = useState<MobileDailyReportDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [privacyPending, setPrivacyPending] = useState(true);
  const scopeVerified = useRef(false);
  const needsRefreshRef = useRef(false);
  useLayoutEffect(() => { needsRefreshRef.current = needsRefresh; }, [needsRefresh]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const focused = useRef(false);
  const alive = useRef(true);
  const generation = useRef(0);
  const sequence = useRef(0);
  const locked = useRef(false);
  const reviewInFlight = useRef(false);
  const latestLoad = useRef<(refresh?: boolean, resolve?: boolean, verifyScope?: boolean) => Promise<void>>(async () => undefined);
  const invalidate = useCallback(() => { generation.current++; sequence.current++; }, []);
  useEffect(() => { alive.current = true; invalidate(); return () => { alive.current = false; invalidate(); locked.current = false; }; }, [invalidate]);
  const active = useCallback((scope: number, operation: number) => alive.current && focused.current && generation.current === scope && sequence.current === operation && isCurrentAccount(), [isCurrentAccount]);
  const load = useCallback(async (refresh = false, resolve = false, verifyScope = false) => {
    if (!focused.current || locked.current || !isCurrentAccount()) return;
    const scope = generation.current; const operation = ++sequence.current;
    locked.current = true; if (verifyScope) { scopeVerified.current = false; setPrivacyPending(true); } setLoading(true); setRefreshing(refresh); setLoadError(null);
    if (!isDailyReportId(reportId)) {
      setData(null); setLoadError("확인할 보고서를 찾을 수 없습니다. 목록에서 다시 선택하세요."); setLoading(false); setRefreshing(false); locked.current = false; return;
    }
    try {
      const response = await request<MobileDailyReportDetailResponse>(`/daily-reports/${encodeURIComponent(reportId)}`);
      if (!active(scope, operation)) return;
      if (!isDailyReportDetail(response, reportId) || (response.mode === "employee" && response.entry.authorId !== ownId)) throw new ApiError("업무보고 응답을 확인하지 못했습니다. 다시 불러오세요.", 200);
      setData(response); setExpanded({}); scopeVerified.current = true; setPrivacyPending(false);
      if (resolve) { setNeedsRefresh(false); setActionError(null); setNotice(response.entry.reviewedAt ? "최신 보고의 확인 완료 상태를 확인했습니다." : "최신 보고를 불러왔습니다. 내용을 확인한 뒤 다시 처리하세요."); }
    } catch (cause) {
      if (!active(scope, operation)) return;
      if (cause instanceof ApiError && (cause.status === 404 || cause.status === 403)) { scopeVerified.current = false; setPrivacyPending(true); setData(null); setExpanded({}); }
      setLoadError(cause instanceof Error ? cause.message : "업무보고를 불러오지 못했습니다. 다시 시도하세요.");
    } finally {
      if (generation.current === scope) locked.current = false;
      if (active(scope, operation)) { setLoading(false); setRefreshing(false); }
    }
  }, [active, isCurrentAccount, reportId, request, ownId]);
  useLayoutEffect(() => { latestLoad.current = load; }, [load]);
  useFocusEffect(useCallback(() => {
    focused.current = true; scopeVerified.current = false; setPrivacyPending(true); void load(false, needsRefreshRef.current, true);
    return () => { focused.current = false; scopeVerified.current = false; setPrivacyPending(true); invalidate(); locked.current = false; if (reviewInFlight.current) { needsRefreshRef.current = true; setNeedsRefresh(true); setActionError("확인 처리 결과를 아직 확인하지 못했습니다. 최신 보고를 확인하세요."); } reviewInFlight.current = false; setBusy(false); };
  }, [invalidate, load]));
  const review = async () => {
    if (locked.current || !scopeVerified.current || loading || loadError || needsRefresh || !data?.canReview || !focused.current || !isCurrentAccount()) return;
    const scope = generation.current; const operation = ++sequence.current;
    locked.current = true; reviewInFlight.current = true; setBusy(true); setActionError(null); setNotice(null);
    let saved = false;
    try {
      const response = await request<MobileDailyReportMutationResponse>(`/daily-reports/${encodeURIComponent(reportId)}/review`, { method: "POST", body: { version: data.entry.version } });
      if (!active(scope, operation)) return;
      if (!isDailyReportMutation(response, data.entry.workDate, reportId) || !response.entry.reviewedAt || response.entry.version !== data.entry.version) throw new ApiError("확인 결과를 확인하지 못했습니다. 최신 보고를 확인하세요.", 200);
      setData({ ...data, entry: response.entry, canReview: false }); setNeedsRefresh(false); setNotice(response.message); saved = true;
    } catch (cause) {
      if (!active(scope, operation)) return;
      if (cause instanceof ApiError && (cause.status === 403 || cause.status === 404)) { scopeVerified.current = false; setPrivacyPending(true); setData(null); setExpanded({}); setLoadError(cause.message); setActionError(null); }
      else { setActionError(cause instanceof Error ? cause.message : "확인 결과를 확인하지 못했습니다. 최신 보고를 확인하세요."); setNeedsRefresh(!(cause instanceof ApiError) || cause.status === 0 || cause.status === 409 || cause.status >= 500 || (cause.status >= 200 && cause.status < 300)); }
    } finally {
      if (generation.current === scope) { locked.current = false; reviewInFlight.current = false; }
      if (alive.current && generation.current === scope && isCurrentAccount()) setBusy(false);
      if (saved && focused.current && generation.current === scope && isCurrentAccount()) void latestLoad.current(true);
    }
  };
  const entry = privacyPending ? undefined : data?.entry;
  const status = dailyReportStatus(entry ?? null);
  const disabled = loading || busy || needsRefresh || !!loadError;
  return <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} tintColor={theme.accent} onRefresh={() => void load(true, needsRefresh)} />}>
    <AccountFeedback message={notice} /><AccountFeedback error={actionError ?? loadError} />
    <View style={styles.actions}><TextAction label={loading ? "불러오는 중..." : needsRefresh ? "최신 보고 확인" : "새로고침"} icon="refresh" disabled={loading || busy} onPress={() => void load(true, needsRefresh)} /><TextAction label="일일 업무보고 목록" icon="arrow-back" disabled={busy} onPress={() => router.push("/daily-reports")} /></View>
    {needsRefresh ? <Text style={[styles.small, { color: theme.secondary }]}>확인 요청을 다시 보내지 않습니다. 최신 보고의 확인 상태를 먼저 확인하세요.</Text> : null}
    {loading ? <View style={styles.actions} accessibilityRole="progressbar" accessibilityLabel="업무보고 불러오는 중"><ActivityIndicator color={theme.accent} /><Text style={[styles.small, { color: theme.secondary }]}>업무보고 불러오는 중...</Text></View> : null}
    {entry && data ? <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Text accessibilityRole="header" aria-level={2} style={[styles.title, { color: theme.text }]}>{formatDailyReportDate(entry.workDate)}</Text>
      <View style={styles.meta}><Text style={[styles.status, { color: theme[status.tone] }]}>{status.label}</Text><Text style={[styles.small, { color: theme.secondary }]}>{entry.authorName} · {entry.departmentName}</Text></View>
      <Text style={[styles.small, { color: theme.secondary }]}>최근 저장 · {formatDailyReportTimestamp(entry.updatedAt)}</Text>
      {entry.submittedAt ? <Text style={[styles.small, { color: theme.secondary }]}>최초 제출 · {formatDailyReportTimestamp(entry.submittedAt)}</Text> : <Text style={[styles.small, { color: theme.secondary }]}>본인만 볼 수 있는 임시저장 보고입니다.</Text>}
      {entry.reviewedAt ? <Text style={[styles.small, { color: theme.secondary }]}>확인 · {entry.reviewedByName || "시설장"} · {formatDailyReportTimestamp(entry.reviewedAt)}</Text> : null}
      <Text accessibilityRole="header" aria-level={3} style={[styles.sectionTitle, { color: theme.text }]}>주요 업무보고</Text>
      <Text selectable style={[styles.body, { color: theme.text }]}>{entry.mainContent || "작성한 주요 업무가 없습니다."}</Text>
      <Text accessibilityRole="header" aria-level={3} style={[styles.sectionTitle, { color: theme.text }]}>청소년별 보고 {entry.youthReports.length}건</Text>
      {entry.youthReports.length ? <View role="list" accessibilityLabel="청소년별 보고">{entry.youthReports.map(note => <View key={note.youthId} role="listitem" style={[styles.note, { borderColor: theme.border }]}>
        <TextAction label={note.youthName} icon={expanded[note.youthId] ? "chevron-up" : "chevron-down"} accessibilityLabel={`${note.youthName} 보고 ${expanded[note.youthId] ? "접기" : "펼치기"}`} accessibilityState={{ expanded: !!expanded[note.youthId] }} onPress={() => setExpanded(previous => ({ ...previous, [note.youthId]: !previous[note.youthId] }))} />
        {expanded[note.youthId] ? <Text selectable style={[styles.body, { color: theme.text }]}>{note.content}</Text> : null}
      </View>)}</View> : <Text style={[styles.small, { color: theme.secondary }]}>작성한 청소년별 보고가 없습니다.</Text>}
      {data.mode === "employee" && data.canWrite ? <TextAction label={entry.submittedAt ? "보고서 수정" : "이어서 작성"} icon="create-outline" disabled={disabled} onPress={() => router.push({ pathname: "/daily-reports/edit", params: { date: entry.workDate } })} /> : data.mode === "employee" ? <Text style={[styles.small, { color: theme.secondary }]}>현재 작성 자격이 없어 수정할 수 없습니다.</Text> : null}
      {data.canReview ? <PrimaryButton title={busy ? "확인 중..." : "확인 완료로 표시"} disabled={disabled} onPress={() => void review()} /> : null}
    </View> : null}
  </ScrollView>;
}
const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 24, maxWidth: 720, width: "100%", alignSelf: "center", gap: 8 }, panel: { borderWidth: 1, borderRadius: 10, padding: 12, gap: 8 },
  title: { fontSize: 19, lineHeight: 27, fontWeight: "800" }, sectionTitle: { fontSize: 16, fontWeight: "800", marginTop: 6 }, status: { fontSize: 13, fontWeight: "700" },
  small: { fontSize: 12, lineHeight: 18, fontVariant: ["tabular-nums"] }, body: { fontSize: 14, lineHeight: 22 }, meta: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center" }, note: { borderBottomWidth: 1, paddingVertical: 4, gap: 4 },
});
