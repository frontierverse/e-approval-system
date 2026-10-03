import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { AccountFeedback } from "@/components/account-feedback";
import { PrimaryButton, TextAction } from "@/components/ui";
import { useConfirmAction } from "@/components/use-confirm-action";
import { WorkLogContent, WorkLogField } from "@/components/work-log-content";
import { ApiError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { formatWorkLogDate, formatWorkLogTimestamp, isWorkLogDate, isWorkLogDateResponse, isWorkLogDelete } from "@/lib/work-logs";
import { useTheme } from "@/lib/theme";
import type { MobileWorkLogDate, MobileWorkLogDelete, MobileWorkLogDeleteInput } from "@/lib/types";

export function WorkLogDetailScreen({ date }: { date: string }) {
  const { token } = useSession(); const key = `${token}:${date}`; const scope = useRef(key);
  useLayoutEffect(() => { scope.current = key; }, [key]); const isCurrentAccount = useCallback(() => !!token && scope.current === key, [key, token]);
  return token ? <WorkLogDetailContent key={key} date={date} isCurrentAccount={isCurrentAccount} /> : null;
}
function WorkLogDetailContent({ date, isCurrentAccount }: { date: string; isCurrentAccount: () => boolean }) {
  const { request } = useSession(); const theme = useTheme(); const confirmation = useConfirmAction();
  const [data, setData] = useState<MobileWorkLogDate | null>(null); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [privatePending, setPrivatePending] = useState(true);
  const [error, setError] = useState<string | null>(null); const [notice, setNotice] = useState<string | null>(null); const [needsRefresh, setNeedsRefreshState] = useState(false); const [dateInput, setDateInput] = useState(date);
  const alive = useRef(true); const focused = useRef(false); const generation = useRef(0); const sequence = useRef(0); const locked = useRef(false); const verified = useRef(false);
  const dataRef = useRef(data); const pending = useRef<MobileWorkLogDeleteInput | null>(null); const needsRefreshRef = useRef(false);
  const updateData = useCallback((value: MobileWorkLogDate | null) => { dataRef.current = value; setData(value); }, []);
  const setNeedsRefresh = useCallback((value: boolean) => { needsRefreshRef.current = value; setNeedsRefreshState(value); }, []);
  const invalidate = useCallback(() => { generation.current++; sequence.current++; }, []);
  useEffect(() => { alive.current = true; invalidate(); return () => { alive.current = false; invalidate(); locked.current = false; pending.current = null; }; }, [invalidate]);
  const active = useCallback((scope: number, op: number) => alive.current && focused.current && generation.current === scope && sequence.current === op && isCurrentAccount(), [isCurrentAccount]);
  const load = useCallback(async (recover = false, verifyScope = false) => {
    if (locked.current || !focused.current || !isCurrentAccount()) return;
    if (!isWorkLogDate(date)) { updateData(null); setLoading(false); setError("기록일을 YYYY-MM-DD 형식으로 입력하세요. 다른 날짜로 자동 변경하지 않습니다."); return; }
    const scope = generation.current; const op = ++sequence.current; locked.current = true; setLoading(true); setError(null); if (verifyScope) { verified.current = false; setPrivatePending(true); }
    try {
      const response = await request<MobileWorkLogDate>(`/work-logs/${encodeURIComponent(date)}`);
      if (!active(scope, op)) return;
      if (!isWorkLogDateResponse(response, date)) throw new ApiError("업무일지 응답을 확인하지 못했습니다. 다시 불러오세요.", 200);
      if (recover) {
        if (pending.current && response.entry?.manualLogId !== pending.current.manualLogId) setNotice(response.entry?.manualLogId ? "이전 직접 작성 기록이 없어졌습니다. 같은 날짜의 새 직접 작성 기록은 삭제하지 않았습니다." : "최신 조회에서 직접 작성 기록이 없음을 확인했습니다. 자동 기록은 유지됩니다.");
        else setNotice("최신 기록을 확인했습니다. 삭제하려면 대상을 다시 확인하세요.");
        pending.current = null; setNeedsRefresh(false);
      }
      updateData(response); verified.current = true; setPrivatePending(false);
    } catch (cause) {
      if (!active(scope, op)) return;
      if (cause instanceof ApiError && (cause.status === 403 || cause.status === 404)) { updateData(null); verified.current = false; setPrivatePending(true); pending.current = null; setNeedsRefresh(false); }
      setError(cause instanceof Error ? cause.message : "업무일지를 불러오지 못했습니다. 다시 시도하세요.");
    } finally { if (generation.current === scope && sequence.current === op) locked.current = false; if (active(scope, op)) setLoading(false); }
  }, [active, date, isCurrentAccount, request, setNeedsRefresh, updateData]);
  const latestLoad = useRef(load); useLayoutEffect(() => { latestLoad.current = load; }, [load]);
  useFocusEffect(useCallback(() => { focused.current = true; verified.current = false; setPrivatePending(true); void load(needsRefreshRef.current || !!pending.current, true); return () => { focused.current = false; verified.current = false; setPrivatePending(true); invalidate(); if (pending.current) { setNeedsRefresh(true); setError("삭제 결과를 아직 확인하지 못했습니다. 최신 기록을 확인하세요."); } locked.current = false; setBusy(false); }; }, [invalidate, load, setNeedsRefresh]));
  const remove = async () => {
    const current = dataRef.current; const entry = current?.entry;
    if (locked.current || loading || !verified.current || needsRefreshRef.current || !current || !entry?.manualLogId || !entry.manualUpdatedAt || !focused.current || !isCurrentAccount()) return;
    const scope = generation.current; const op = ++sequence.current; locked.current = true; let deleted = false;
    try {
      const accepted = await confirmation.ask({ title: "직접 작성 업무 기록 삭제", message: `${formatWorkLogDate(date)} · ${entry.keyword}\n직접 작성 업무 내용이 영구 삭제되며 앱에서 복구할 수 없습니다. 완료한 할 일과 회의록은 유지됩니다. 삭제하시겠습니까?`, confirm: "직접 작성 기록 삭제", danger: true });
      if (!accepted || !active(scope, op)) return;
      const input = { manualLogId: entry.manualLogId, expectedUpdatedAt: entry.manualUpdatedAt }; pending.current = input; setBusy(true); setError(null); setNotice(null);
      const response = await request<MobileWorkLogDelete>(`/work-logs/${encodeURIComponent(date)}`, { method: "DELETE", body: input });
      if (!active(scope, op)) return;
      if (!isWorkLogDelete(response, date, input.manualLogId)) throw new ApiError("삭제 결과를 확인하지 못했습니다. 최신 기록을 확인하세요.", 200);
      updateData({ ...current, entry: response.entry }); pending.current = null; setNeedsRefresh(false); setNotice(response.change === "missing" && response.entry?.manualLogId ? "이전 직접 작성 기록이 없어졌습니다. 같은 날짜의 새 직접 작성 기록은 삭제하지 않았습니다." : response.message); deleted = true;
    } catch (cause) {
      if (!active(scope, op)) return;
      setError(cause instanceof Error ? cause.message : "삭제 결과를 확인하지 못했습니다. 최신 기록을 확인하세요.");
      if (cause instanceof ApiError && (cause.status === 403 || cause.status === 404)) { updateData(null); verified.current = false; setPrivatePending(true); pending.current = null; setNeedsRefresh(false); }
      else if (!(cause instanceof ApiError) || cause.status === 0 || cause.status === 409 || cause.status >= 500 || (cause.status >= 200 && cause.status < 300)) setNeedsRefresh(true);
      else pending.current = null;
    } finally { if (generation.current === scope && sequence.current === op) locked.current = false; if (alive.current && generation.current === scope && isCurrentAccount()) setBusy(false); if (deleted && focused.current && generation.current === scope && isCurrentAccount()) void latestLoad.current(); }
  };
  const visible = privatePending ? null : data; const entry = visible?.entry;
  return <ScrollView style={{ flex: 1, backgroundColor: theme.background }} contentContainerStyle={styles.container}>
    <View style={styles.actions}><TextAction label={loading ? "불러오는 중..." : "최신 기록 확인"} icon="refresh" disabled={loading || busy} onPress={() => void load(needsRefreshRef.current || !!pending.current)} /></View>
    <AccountFeedback message={notice} /><AccountFeedback error={error} />
    {loading ? <View style={styles.actions} accessibilityRole="progressbar" accessibilityLabel="업무일지 불러오는 중"><ActivityIndicator color={theme.accent} /><Text style={[styles.small, { color: theme.secondary }]}>업무일지 불러오는 중...</Text></View> : null}
    {!visible && !loading ? <><WorkLogField name="workDate" label="기록일" value={dateInput} placeholder="YYYY-MM-DD" maxLength={10} onChange={(_, value) => setDateInput(value)} /><TextAction label="다른 날짜 조회" onPress={() => { if (locked.current || !focused.current || !isCurrentAccount()) return; if (!isWorkLogDate(dateInput)) { setError("기록일을 YYYY-MM-DD 형식으로 입력하세요."); return; } router.replace({ pathname: "/work-logs/[date]", params: { date: dateInput } }); }} /></> : null}
    {visible ? <>
      <View style={styles.actions}><Text accessibilityRole="header" aria-level={2} style={[styles.title, { color: theme.text }]}>{formatWorkLogDate(visible.workDate)}</Text><TextAction label={entry?.manualLogId ? "직접 작성 기록 수정" : "직접 작성 기록 작성"} disabled={loading || busy || needsRefresh} onPress={() => { if (!locked.current && verified.current && !needsRefreshRef.current && focused.current && isCurrentAccount()) router.push({ pathname: "/work-logs/edit", params: { date: visible.workDate } }); }} /></View>
      <Text style={[styles.small, { color: theme.secondary }]}>완료 {entry?.completedTasks.length ?? 0}건 · 승인 회의록 {entry?.meetingDocuments.length ?? 0}건 · 첨부 {entry?.meetingDocuments.reduce((sum, meeting) => sum + meeting.attachments.length, 0) ?? 0}개</Text>
      {needsRefresh ? <Text style={[styles.small, { color: theme.secondary }]}>삭제 요청을 다시 보내지 않습니다. 최신 조회로 직접 작성 기록의 존재와 대상을 확인하세요.</Text> : null}
      <WorkLogContent entry={entry ?? null} disabled={loading || busy} onNavigate={target => { if (!locked.current && verified.current && focused.current && isCurrentAccount()) router.push(target); }} />
      <Text accessibilityRole="header" aria-level={2} style={[styles.label, { color: theme.text }]}>직접 작성 업무 기록</Text>
      {entry?.manualLogId ? <><Text style={[styles.label, { color: theme.text }]}>{entry.keyword}</Text><Text selectable style={[styles.body, { color: theme.text }]}>{entry.content}</Text><Text style={[styles.small, { color: theme.secondary }]}>{entry.authorName} · 작성 {formatWorkLogTimestamp(entry.createdAt)}</Text><Text style={[styles.small, { color: theme.secondary }]}>최종 저장 {formatWorkLogTimestamp(entry.manualUpdatedAt)}{entry.updatedByName ? ` · ${entry.updatedByName}` : ""}</Text><PrimaryButton title={busy ? "삭제 중..." : "직접 작성 기록 삭제"} danger disabled={loading || busy || needsRefresh} onPress={() => void remove()} /></> : <Text style={[styles.small, { color: theme.secondary }]}>저장된 직접 작성 기록이 없습니다. 자동 기록은 별도로 유지됩니다.</Text>}
    </> : null}
    {confirmation.dialog}
  </ScrollView>;
}
const styles = StyleSheet.create({ container: { padding: 12, paddingBottom: 32, gap: 8, width: "100%", maxWidth: 960, alignSelf: "center" }, actions: { flexDirection: "row", flexWrap: "wrap", gap: 4, alignItems: "center" }, title: { fontSize: 18, fontWeight: "700" }, label: { fontSize: 15, fontWeight: "700" }, small: { fontSize: 13, lineHeight: 20, fontVariant: ["tabular-nums"] }, body: { fontSize: 15, lineHeight: 24 } });
