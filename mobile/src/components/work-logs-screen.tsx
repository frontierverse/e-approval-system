import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { AccountFeedback } from "@/components/account-feedback";
import { TextAction } from "@/components/ui";
import { WorkLogContent, WorkLogField, WorkLogRowLink } from "@/components/work-log-content";
import { ApiError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { formatWorkLogDate, formatWorkLogTimestamp, isWorkLogDate, isWorkLogPage, workLogHeatmap } from "@/lib/work-logs";
import { useTheme } from "@/lib/theme";
import type { MobileWorkLogPage } from "@/lib/types";

export function WorkLogsScreen({ date }: { date?: string }) {
  const { token } = useSession(); const key = `${token}:${date ?? "today"}`; const scope = useRef(key);
  useLayoutEffect(() => { scope.current = key; }, [key]);
  const isCurrentAccount = useCallback(() => !!token && scope.current === key, [key, token]);
  return token ? <WorkLogsScreenContent key={key} date={date} isCurrentAccount={isCurrentAccount} /> : null;
}
function WorkLogsScreenContent({ date, isCurrentAccount }: { date?: string; isCurrentAccount: () => boolean }) {
  const { request } = useSession(); const theme = useTheme(); const [data, setData] = useState<MobileWorkLogPage | null>(null);
  const [loading, setLoading] = useState(true); const [privatePending, setPrivatePending] = useState(true); const [error, setError] = useState<string | null>(null);
  const [dateInput, setDateInput] = useState(date ?? ""); const [conditions, setConditions] = useState(false); const [annual, setAnnual] = useState(false);
  const alive = useRef(true); const focused = useRef(false); const generation = useRef(0); const locked = useRef(false); const verified = useRef(false);
  const invalidate = useCallback(() => { generation.current++; }, []);
  useEffect(() => { alive.current = true; invalidate(); return () => { alive.current = false; invalidate(); locked.current = false; }; }, [invalidate]);
  const load = useCallback(async () => {
    if (locked.current || !focused.current || !isCurrentAccount()) return;
    if (date !== undefined && !isWorkLogDate(date)) { setData(null); setLoading(false); setError("기록일을 YYYY-MM-DD 형식으로 입력하세요. 다른 날짜로 자동 변경하지 않습니다."); setConditions(true); return; }
    const op = ++generation.current; locked.current = true; setLoading(true); setError(null);
    try {
      const result = await request<MobileWorkLogPage>(`/work-logs${date === undefined ? "" : `?date=${encodeURIComponent(date)}`}`);
      if (!alive.current || !focused.current || generation.current !== op || !isCurrentAccount()) return;
      if (!isWorkLogPage(result, date)) throw new ApiError("업무일지 응답을 확인하지 못했습니다. 다시 불러오세요.", 200);
      setData(result); setDateInput(result.selectedDate); verified.current = true; setPrivatePending(false);
    } catch (cause) {
      if (!alive.current || !focused.current || generation.current !== op || !isCurrentAccount()) return;
      if (cause instanceof ApiError && (cause.status === 403 || cause.status === 404)) { verified.current = false; setPrivatePending(true); setData(null); }
      setError(cause instanceof Error ? cause.message : "업무일지를 불러오지 못했습니다. 다시 시도하세요."); setConditions(true);
    } finally { if (generation.current === op) { locked.current = false; if (alive.current && focused.current && isCurrentAccount()) setLoading(false); } }
  }, [date, isCurrentAccount, request]);
  useFocusEffect(useCallback(() => { focused.current = true; verified.current = false; setPrivatePending(true); void load(); return () => { focused.current = false; verified.current = false; generation.current++; locked.current = false; setPrivatePending(true); }; }, [load]));
  const changeDate = (next = dateInput) => {
    if (locked.current || !focused.current || !isCurrentAccount()) return;
    if (!isWorkLogDate(next) || (data && next > data.today)) { setError("기록일을 YYYY-MM-DD 형식으로 오늘까지 입력하세요."); return; }
    if (next === (data?.selectedDate ?? date) && !error) return;
    router.setParams({ date: next });
  };
  const navigate = (target: Parameters<typeof router.push>[0]) => { if (alive.current && !locked.current && verified.current && focused.current && isCurrentAccount()) router.push(target); };
  const visible = privatePending ? null : data; const entry = visible?.selectedEntry;
  return <ScrollView style={{ flex: 1, backgroundColor: theme.background }} contentContainerStyle={styles.container} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={theme.accent} />}>
    <View style={styles.actions}><TextAction label={visible ? `${visible.selectedDate} 조회 조건` : "날짜 조회 조건"} icon="calendar-outline" onPress={() => setConditions(value => !value)} accessibilityState={{ expanded: conditions }} /><TextAction label="새로고침" icon="refresh" disabled={loading} onPress={() => void load()} /></View>
    {conditions ? <View style={styles.group}><WorkLogField name="workDate" label="기록일" value={dateInput} placeholder="YYYY-MM-DD" maxLength={10} disabled={loading} onChange={(_, value) => setDateInput(value)} /><View style={styles.actions}><TextAction label="날짜 조회" disabled={loading} onPress={() => changeDate()} />{data ? <TextAction label="오늘" disabled={loading} onPress={() => changeDate(data.today)} /> : null}</View></View> : null}
    <AccountFeedback error={error} />
    {loading && !visible ? <View style={styles.loading} accessibilityRole="progressbar" accessibilityLabel="업무일지 불러오는 중"><ActivityIndicator color={theme.accent} /><Text style={{ color: theme.secondary }}>업무일지 불러오는 중...</Text></View> : null}
    {visible ? <>
      <View style={[styles.summary, { backgroundColor: theme.surface, borderColor: theme.border }]}><Text style={[styles.small, { color: theme.text }]}>직접 기록 {entry?.manualLogId ? "있음" : "없음"} · 완료 {entry?.completedTasks.length ?? 0}건 · 회의록 {entry?.meetingDocuments.length ?? 0}건 · 첨부 {entry?.meetingDocuments.reduce((sum, meeting) => sum + meeting.attachments.length, 0) ?? 0}개</Text><TextAction label={entry?.manualLogId ? "직접 작성 기록 수정" : "직접 작성 기록 작성"} icon="create-outline" disabled={loading} onPress={() => navigate({ pathname: "/work-logs/edit", params: { date: visible.selectedDate } })} /></View>
      <WorkLogContent key={visible.selectedDate} entry={entry ?? null} onNavigate={navigate} disabled={loading} />
      <View style={styles.group}><Text accessibilityRole="header" aria-level={2} style={[styles.label, { color: theme.text }]}>직접 작성 업무 기록</Text>{entry?.manualLogId ? <><WorkLogRowLink label={entry.keyword} accessibilityLabel={`${entry.keyword} 업무일지 상세`} disabled={loading} onPress={() => navigate({ pathname: "/work-logs/[date]", params: { date: visible.selectedDate } })} /><Text style={[styles.small, { color: theme.secondary }]}>{formatWorkLogTimestamp(entry.manualUpdatedAt)} 저장</Text></> : <Text style={[styles.small, { color: theme.secondary }]}>직접 작성 기록이 없습니다. 자동 기록과 별도로 업무 내용을 작성할 수 있습니다.</Text>}<TextAction label="선택일 상세 보기" disabled={loading} onPress={() => navigate({ pathname: "/work-logs/[date]", params: { date: visible.selectedDate } })} /></View>
      {visible.linkedScheduleState.status === "error" ? <Text style={[styles.small, { color: theme.secondary }]}>참고 일정을 불러오지 못했습니다. 업무 기록은 확인할 수 있습니다.</Text> : null}
      <View style={styles.group}><Text accessibilityRole="header" aria-level={2} style={[styles.label, { color: theme.text }]}>최근 기록일 {visible.recentLogs.length}일</Text><View role="list" accessibilityLabel="최근 업무일지">{visible.recentLogs.map(item => <View role="listitem" key={item.id} style={[styles.recent, { borderColor: theme.border }]}><WorkLogRowLink label={`${formatWorkLogDate(item.workDate)} · ${item.keyword}`} accessibilityLabel={`${formatWorkLogDate(item.workDate)} ${item.keyword} 상세`} disabled={loading} onPress={() => navigate({ pathname: "/work-logs/[date]", params: { date: item.workDate } })} /><Text style={[styles.small, { color: theme.secondary }]}>직접 기록 {item.hasManual ? "있음" : "없음"} · 완료 {item.completedTaskCount}건 · 회의록 {item.meetingDocumentCount}건 · 첨부 {item.meetingAttachmentCount}개</Text></View>)}</View>{!visible.recentLogs.length ? <Text style={[styles.small, { color: theme.secondary }]}>최근 업무 기록이 없습니다.</Text> : null}</View>
      <TextAction label={`연간 기록 ${visible.contributionDates.length}일 · ${annual ? "접기" : "펼치기"}`} accessibilityState={{ expanded: annual }} onPress={() => setAnnual(value => !value)} />
      {annual ? <View accessible accessibilityLabel={`최근 53주 업무 기록 ${visible.contributionDates.length}일. 날짜 조회 조건과 최근 기록에서 날짜를 선택할 수 있습니다.`} style={styles.heatmap}>{workLogHeatmap(visible.today).map((week, index) => <View key={index} style={styles.week}>{week.map(day => <View key={day} accessible={false} style={[styles.dot, { backgroundColor: day > visible.today ? "transparent" : visible.contributionDates.includes(day) ? theme.accent : theme.surfaceMuted }]} />)}</View>)}</View> : null}
    </> : null}
  </ScrollView>;
}
const styles = StyleSheet.create({ container: { padding: 12, paddingBottom: 32, gap: 8, maxWidth: 960, width: "100%", alignSelf: "center" }, actions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 4 }, group: { gap: 4 }, summary: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, minHeight: 64 }, label: { fontSize: 15, fontWeight: "700" }, small: { fontSize: 13, lineHeight: 20, fontVariant: ["tabular-nums"] }, recent: { minHeight: 64, borderBottomWidth: 1, paddingBottom: 8, gap: 2 }, loading: { minHeight: 64, flexDirection: "row", gap: 8, alignItems: "center" }, heatmap: { flexDirection: "row", gap: 2 }, week: { gap: 2 }, dot: { width: 3, height: 4, borderRadius: 1 } });
