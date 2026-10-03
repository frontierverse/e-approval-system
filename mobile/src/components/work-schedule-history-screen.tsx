import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { AccountFeedback } from "@/components/account-feedback";
import { TextAction } from "@/components/ui";
import { ScheduleField, WorkScheduleSnapshot } from "@/components/work-schedule-content";
import { ApiError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { formatScheduleDate, formatScheduleTimestamp, isManualScheduleId, isScheduleChanges, isScheduleDate } from "@/lib/schedules";
import { useTheme } from "@/lib/theme";
import type { MobileScheduleChanges } from "@/lib/types";

export function WorkScheduleHistoryScreen({ date }: { date?: string }) {
  const { token } = useSession(); const key = `${token}:${date ?? "all"}`; const scope = useRef(key);
  useLayoutEffect(() => { scope.current = key; }, [key]); const isCurrentAccount = useCallback(() => !!token && scope.current === key, [key, token]);
  return token ? <WorkScheduleHistoryContent key={key} date={date} isCurrentAccount={isCurrentAccount} /> : null;
}
function WorkScheduleHistoryContent({ date, isCurrentAccount }: { date?: string; isCurrentAccount: () => boolean }) {
  const { request } = useSession(); const theme = useTheme(); const [data, setData] = useState<MobileScheduleChanges | null>(null);
  const [criteria, setCriteria] = useState({ date, actorId: "all", page: 1 }); const [dateInput, setDateInput] = useState(date ?? ""); const [conditions, setConditions] = useState(false); const [expanded, setExpanded] = useState<string[]>([]);
  const [loading, setLoading] = useState(true); const [privatePending, setPrivatePending] = useState(true); const [error, setError] = useState<string | null>(null);
  const alive = useRef(true); const focused = useRef(false); const generation = useRef(0); const sequence = useRef(0); const locked = useRef(false); const verified = useRef(false); const dataRef = useRef(data);
  const updateData = useCallback((value: MobileScheduleChanges | null) => { dataRef.current = value; setData(value); }, []);
  const invalidate = useCallback(() => { generation.current++; sequence.current++; }, []);
  useEffect(() => { alive.current = true; invalidate(); return () => { alive.current = false; invalidate(); locked.current = false; }; }, [invalidate]);
  const active = useCallback((scope: number, op: number) => alive.current && focused.current && generation.current === scope && sequence.current === op && isCurrentAccount(), [isCurrentAccount]);
  const load = useCallback(async (verifyScope = false) => {
    if (locked.current || !focused.current || !isCurrentAccount()) return;
    if ((criteria.date !== undefined && !isScheduleDate(criteria.date)) || criteria.actorId !== "all" && !isManualScheduleId(criteria.actorId)) { verified.current = false; setPrivatePending(true); updateData(null); setLoading(false); setError("조회 날짜 또는 직원 조건을 확인하세요. 다른 날짜로 자동 변경하지 않습니다."); return; }
    const scope = generation.current; const op = ++sequence.current; locked.current = true; setLoading(true); setError(null); if (verifyScope) { verified.current = false; setPrivatePending(true); }
    try {
      const query = [`page=${criteria.page}`, `actorId=${encodeURIComponent(criteria.actorId)}`, ...(criteria.date === undefined ? [] : [`date=${encodeURIComponent(criteria.date)}`])].join("&");
      const response = await request<MobileScheduleChanges>(`/schedules/changes?${query}`);
      if (!active(scope, op)) return;
      if (!isScheduleChanges(response, { date: criteria.date, actorId: criteria.actorId })) throw new ApiError("변경 이력 응답을 확인하지 못했습니다. 다시 불러오세요.", 200);
      updateData(response); setExpanded([]); verified.current = true; setPrivatePending(false);
    } catch (cause) {
      if (!active(scope, op)) return;
      if (cause instanceof ApiError && (cause.status === 403 || cause.status === 404)) { updateData(null); verified.current = false; setPrivatePending(true); }
      setError(cause instanceof Error ? cause.message : "변경 이력을 불러오지 못했습니다. 다시 시도하세요.");
    } finally { if (generation.current === scope && sequence.current === op) locked.current = false; if (active(scope, op)) setLoading(false); }
  }, [active, criteria.actorId, criteria.date, criteria.page, isCurrentAccount, request, updateData]);
  useFocusEffect(useCallback(() => { focused.current = true; verified.current = false; setPrivatePending(true); void load(true); return () => { focused.current = false; verified.current = false; setPrivatePending(true); invalidate(); locked.current = false; }; }, [invalidate, load]));
  const apply = (nextDate = dateInput, actorId = criteria.actorId) => {
    if (locked.current || loading || !focused.current || !isCurrentAccount()) return;
    if (nextDate !== "" && !isScheduleDate(nextDate)) { setError("날짜를 YYYY-MM-DD 형식으로 입력하거나 비워 전체 날짜를 조회하세요."); return; }
    setCriteria({ date: nextDate === "" ? undefined : nextDate, actorId, page: 1 });
  };
  const turnPage = (page: number) => { const current = dataRef.current; if (!locked.current && verified.current && focused.current && isCurrentAccount() && current && page >= 1 && page <= current.totalPages) setCriteria(previous => ({ ...previous, page })); };
  const visible = privatePending ? null : data;
  return <ScrollView style={{ flex: 1, backgroundColor: theme.background }} contentContainerStyle={styles.container}>
    <View style={styles.actions}><TextAction label={`조회 조건 ${conditions ? "접기" : "펼치기"}`} accessibilityState={{ expanded: conditions }} disabled={loading} onPress={() => { if (alive.current && focused.current && !locked.current && isCurrentAccount()) setConditions(value => !value); }} /><TextAction label={loading ? "불러오는 중..." : "변경 이력 새로고침"} icon="refresh" disabled={loading} onPress={() => void load()} /></View>
    <AccountFeedback error={error} />
    {conditions ? <View style={[styles.conditions, { borderColor: theme.border }]}><ScheduleField name="date" label="조회 날짜" value={dateInput} placeholder="YYYY-MM-DD · 비우면 전체 날짜" disabled={loading} onChange={(_, next) => { if (!locked.current && focused.current && isCurrentAccount()) setDateInput(next); }} /><TextAction label="날짜 조건 적용" disabled={loading} onPress={() => apply()} />{visible ? <View style={styles.actions}><TextAction label="전체 직원" accessibilityState={{ selected: criteria.actorId === "all" }} disabled={loading} onPress={() => apply(criteria.date ?? "", "all")} />{visible.actors.map(actor => <TextAction key={actor.id} label={actor.name} accessibilityLabel={`${actor.name} 변경 이력 조회`} accessibilityState={{ selected: criteria.actorId === actor.id }} disabled={loading} onPress={() => apply(criteria.date ?? "", actor.id)} />)}</View> : null}</View> : null}
    {loading ? <View style={styles.actions} accessibilityRole="progressbar" accessibilityLabel="변경 이력 불러오는 중"><ActivityIndicator color={theme.accent} /><Text style={[styles.small, { color: theme.secondary }]}>변경 이력 불러오는 중...</Text></View> : null}
    {visible ? <><Text style={[styles.small, { color: theme.secondary }]}>{visible.scheduleDate ? formatScheduleDate(visible.scheduleDate) : "전체 날짜"} · {visible.actorId === "all" ? "전체 직원" : visible.actors.find(actor => actor.id === visible.actorId)?.name ?? "선택 직원"} · 변경 {visible.total.toLocaleString()}건</Text><Text accessibilityRole="header" aria-level={2} style={[styles.label, { color: theme.text }]}>변경 이력</Text>{visible.logs.length ? <View role="list" accessibilityLabel="업무 일정 변경 이력">{visible.logs.map(log => <View key={log.id} role="listitem" style={[styles.row, { borderColor: theme.border }]}><Text style={[styles.label, { color: theme.text }]}>{log.change === "create" ? "등록" : log.change === "update" ? "수정" : log.change === "delete" ? "삭제" : "변경"} · {log.actor.name}</Text><Text style={[styles.small, { color: theme.secondary }]}>{formatScheduleTimestamp(log.createdAt)}</Text>{log.message ? <Text style={[styles.body, { color: theme.text }]}>{log.message}</Text> : null}<TextAction label={`변경 내용 ${expanded.includes(log.id) ? "접기" : "펼치기"}`} accessibilityLabel={`${log.actor.name} ${formatScheduleTimestamp(log.createdAt)} 변경 내용 ${expanded.includes(log.id) ? "접기" : "펼치기"}`} accessibilityState={{ expanded: expanded.includes(log.id) }} onPress={() => { if (alive.current && focused.current && !locked.current && verified.current && dataRef.current?.logs.some(item => item.id === log.id) && isCurrentAccount()) setExpanded(previous => previous.includes(log.id) ? previous.filter(id => id !== log.id) : [...previous, log.id]); }} />{expanded.includes(log.id) ? <><WorkScheduleSnapshot snapshot={log.previous} label="변경 전" /><WorkScheduleSnapshot snapshot={log.next} label="변경 후" /></> : null}</View>)}</View> : <Text style={[styles.small, { color: theme.secondary }]}>조건에 맞는 변경 이력이 없습니다.</Text>}<View style={styles.actions}><TextAction label="이전 이력" disabled={loading || visible.page <= 1} onPress={() => turnPage(visible.page - 1)} /><Text style={[styles.small, { color: theme.secondary }]}>{visible.page}/{visible.totalPages}페이지 · 5건씩</Text><TextAction label="다음 이력" disabled={loading || visible.page >= visible.totalPages} onPress={() => turnPage(visible.page + 1)} /></View></> : null}
  </ScrollView>;
}
const styles = StyleSheet.create({ container: { padding: 12, paddingBottom: 32, gap: 8, width: "100%", maxWidth: 960, alignSelf: "center" }, actions: { flexDirection: "row", flexWrap: "wrap", gap: 4, alignItems: "center" }, label: { fontSize: 15, fontWeight: "700" }, small: { fontSize: 13, lineHeight: 20, fontVariant: ["tabular-nums"] }, body: { fontSize: 15, lineHeight: 23 }, row: { gap: 4, paddingVertical: 8, borderBottomWidth: 1 }, conditions: { gap: 4, padding: 8, borderWidth: 1, borderRadius: 8 } });
