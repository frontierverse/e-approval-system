import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { AccountFeedback } from "@/components/account-feedback";
import { PrimaryButton, TextAction } from "@/components/ui";
import { useConfirmAction } from "@/components/use-confirm-action";
import { WorkScheduleContent } from "@/components/work-schedule-content";
import { ApiError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { formatScheduleDate, formatScheduleMinute, isManualScheduleId, isScheduleDate, isScheduleDelete, isScheduleManualResponse, isSchedulePage } from "@/lib/schedules";
import { useTheme } from "@/lib/theme";
import type { MobileScheduleDelete, MobileScheduleDeleteInput, MobileScheduleItem, MobileScheduleManualResponse, MobileSchedulePage } from "@/lib/types";

export function WorkScheduleDetailScreen({ id, date }: { id: string; date?: string }) {
  const { token } = useSession(); const key = `${token}:${id}:${date ?? ""}`; const scope = useRef(key);
  useLayoutEffect(() => { scope.current = key; }, [key]); const isCurrentAccount = useCallback(() => !!token && scope.current === key, [key, token]);
  return token ? <WorkScheduleDetailContent key={key} id={id} date={date} isCurrentAccount={isCurrentAccount} /> : null;
}
function WorkScheduleDetailContent({ id, date, isCurrentAccount }: { id: string; date?: string; isCurrentAccount: () => boolean }) {
  const { request } = useSession(); const theme = useTheme(); const confirmation = useConfirmAction();
  const [item, setItem] = useState<MobileScheduleItem | null>(null); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [privatePending, setPrivatePending] = useState(true);
  const [error, setError] = useState<string | null>(null); const [notice, setNotice] = useState<string | null>(null); const [needsRefresh, setNeedsRefreshState] = useState(false);
  const alive = useRef(true); const focused = useRef(false); const generation = useRef(0); const sequence = useRef(0); const locked = useRef(false); const verified = useRef(false);
  const itemRef = useRef(item); const pending = useRef<MobileScheduleDeleteInput | null>(null); const needsRefreshRef = useRef(false); const deletedRef = useRef(false);
  const updateItem = useCallback((value: MobileScheduleItem | null) => { itemRef.current = value; setItem(value); }, []);
  const setNeedsRefresh = useCallback((value: boolean) => { needsRefreshRef.current = value; setNeedsRefreshState(value); }, []);
  const invalidate = useCallback(() => { generation.current++; sequence.current++; }, []);
  useEffect(() => { alive.current = true; invalidate(); return () => { alive.current = false; invalidate(); locked.current = false; pending.current = null; }; }, [invalidate]);
  const active = useCallback((scope: number, op: number) => alive.current && focused.current && generation.current === scope && sequence.current === op && isCurrentAccount(), [isCurrentAccount]);
  const load = useCallback(async (recover = false, verifyScope = false) => {
    if (locked.current || !focused.current || !isCurrentAccount()) return;
    const manual = isManualScheduleId(id);
    if (!id || id.length > 512 || /[\s\x00-\x1f\x7f]/.test(id) || (date !== undefined && !isScheduleDate(date)) || (!manual && date === undefined)) { updateItem(null); verified.current = false; setPrivatePending(true); setLoading(false); setError("일정 ID와 날짜를 확인하세요. 조회 전용 일정에는 유효한 날짜가 필요합니다."); return; }
    const scope = generation.current; const op = ++sequence.current; locked.current = true; setLoading(true); setError(null); if (verifyScope) { verified.current = false; setPrivatePending(true); }
    try {
      let next: MobileScheduleItem | undefined;
      if (manual) {
        const response = await request<MobileScheduleManualResponse>(`/schedules/manual/${encodeURIComponent(id)}`);
        if (!active(scope, op)) return;
        if (!isScheduleManualResponse(response, id)) throw new ApiError("일정 응답을 확인하지 못했습니다. 다시 불러오세요.", 200);
        next = response.item;
      } else {
        const response = await request<MobileSchedulePage>(`/schedules?date=${encodeURIComponent(date!)}`);
        if (!active(scope, op)) return;
        if (!isSchedulePage(response, { date })) throw new ApiError("일정 응답을 확인하지 못했습니다. 다시 불러오세요.", 200);
        next = response.items.find(row => row.id === id && row.scheduleDate === date && row.readOnly);
        if (!next) throw new ApiError("현재 조회할 수 있는 일정을 찾을 수 없습니다.", 404);
      }
      if (recover) { setNotice("최신 일정의 현재 날짜와 내용을 확인했습니다. 삭제하려면 다시 확인하세요."); pending.current = null; setNeedsRefresh(false); }
      updateItem(next); deletedRef.current = false; verified.current = true; setPrivatePending(false);
    } catch (cause) {
      if (!active(scope, op)) return;
      if (cause instanceof ApiError && cause.status === 404 && manual && (pending.current || deletedRef.current)) {
        updateItem(null); pending.current = null; setNeedsRefresh(false); deletedRef.current = true; verified.current = true; setPrivatePending(false); setNotice("해당 ID의 직접 등록 일정이 없음을 확인했습니다. 같은 시간에 새로 등록된 다른 일정은 삭제하지 않았습니다.");
      } else {
        if (cause instanceof ApiError && (cause.status === 403 || cause.status === 404)) { updateItem(null); verified.current = false; setPrivatePending(true); pending.current = null; setNeedsRefresh(false); }
        setError(cause instanceof Error ? cause.message : "일정을 불러오지 못했습니다. 다시 시도하세요.");
      }
    } finally { if (generation.current === scope && sequence.current === op) locked.current = false; if (active(scope, op)) setLoading(false); }
  }, [active, date, id, isCurrentAccount, request, setNeedsRefresh, updateItem]);
  const latestLoad = useRef(load); useLayoutEffect(() => { latestLoad.current = load; }, [load]);
  useFocusEffect(useCallback(() => { focused.current = true; verified.current = false; setPrivatePending(true); void load(needsRefreshRef.current || !!pending.current, true); return () => { focused.current = false; verified.current = false; setPrivatePending(true); invalidate(); if (pending.current) { setNeedsRefresh(true); setError("삭제 결과를 아직 확인하지 못했습니다. 최신 일정을 확인하세요."); } locked.current = false; setBusy(false); }; }, [invalidate, load, setNeedsRefresh]));
  const remove = async () => {
    const current = itemRef.current;
    if (locked.current || loading || !verified.current || needsRefreshRef.current || current?.sourceType !== "manual" || !focused.current || !isCurrentAccount()) return;
    const scope = generation.current; const op = ++sequence.current; locked.current = true; let deleted = false;
    try {
      const accepted = await confirmation.ask({ title: "공용 일정 삭제", message: `${formatScheduleDate(current.scheduleDate)} ${formatScheduleMinute(current.startMinute)}–${formatScheduleMinute(current.endMinute)}\n이 공용 일정이 영구 삭제되어 다른 직원에게도 사라집니다. 앱에서 복구할 수 없습니다. 삭제하시겠습니까?`, confirm: "일정 삭제", danger: true });
      if (!accepted || !active(scope, op)) return;
      const input = { expectedUpdatedAt: current.updatedAt }; pending.current = input; setBusy(true); setError(null); setNotice(null);
      const response = await request<MobileScheduleDelete>(`/schedules/manual/${encodeURIComponent(current.id)}`, { method: "DELETE", body: input });
      if (!active(scope, op)) return;
      if (!isScheduleDelete(response, current.id)) throw new ApiError("삭제 결과를 확인하지 못했습니다. 최신 일정을 확인하세요.", 200);
      updateItem(null); pending.current = null; deletedRef.current = true; setNeedsRefresh(false); setNotice(response.change === "missing" ? "이전 일정은 이미 없어졌습니다. 같은 시간에 새로 등록된 다른 일정은 삭제하지 않았습니다." : response.message); deleted = true;
    } catch (cause) {
      if (!active(scope, op)) return;
      setError(cause instanceof Error ? cause.message : "삭제 결과를 확인하지 못했습니다. 최신 일정을 확인하세요.");
      if (cause instanceof ApiError && (cause.status === 403 || cause.status === 404)) { updateItem(null); verified.current = false; setPrivatePending(true); pending.current = null; setNeedsRefresh(false); }
      else if (!(cause instanceof ApiError) || cause.status === 0 || cause.status === 409 || cause.status >= 500 || cause.status >= 200 && cause.status < 300) setNeedsRefresh(true);
      else pending.current = null;
    } finally { if (generation.current === scope && sequence.current === op) locked.current = false; if (alive.current && generation.current === scope && isCurrentAccount()) setBusy(false); if (deleted && focused.current && generation.current === scope && isCurrentAccount()) void latestLoad.current(); }
  };
  const visible = privatePending ? null : item;
  return <ScrollView style={{ flex: 1, backgroundColor: theme.background }} contentContainerStyle={styles.container}>
    <View style={styles.actions}><TextAction label={loading ? "불러오는 중..." : "최신 일정 확인"} icon="refresh" disabled={loading || busy} onPress={() => void load(needsRefreshRef.current || !!pending.current)} /><TextAction label="일정 목록" disabled={loading || busy} onPress={() => { if (alive.current && focused.current && !locked.current && isCurrentAccount()) router.push({ pathname: "/work-schedules", params: { ...(isScheduleDate(itemRef.current?.scheduleDate ?? date ?? "") ? { date: itemRef.current?.scheduleDate ?? date } : {}) } }); }} /></View>
    <AccountFeedback message={notice} /><AccountFeedback error={error} />
    {loading ? <View style={styles.actions} accessibilityRole="progressbar" accessibilityLabel="일정 불러오는 중"><ActivityIndicator color={theme.accent} /><Text style={[styles.small, { color: theme.secondary }]}>일정 불러오는 중...</Text></View> : null}
    {visible ? <><Text accessibilityRole="header" aria-level={2} style={[styles.title, { color: theme.text }]}>{visible.sourceType === "manual" ? "직접 등록 일정" : visible.sourceType === "approvedVacation" ? "승인 휴가" : "병원 예약"}</Text><WorkScheduleContent item={visible} />{needsRefresh ? <Text style={[styles.small, { color: theme.secondary }]}>삭제 요청을 다시 보내지 않습니다. 최신 조회로 현재 날짜와 대상을 확인하세요.</Text> : null}{visible.sourceType === "manual" ? <View style={styles.actions}><TextAction label="일정 수정" disabled={loading || busy || needsRefresh} onPress={() => { if (alive.current && focused.current && !locked.current && verified.current && !needsRefreshRef.current && itemRef.current?.sourceType === "manual" && itemRef.current.updatedAt === visible.updatedAt && isCurrentAccount()) router.push({ pathname: "/work-schedules/edit", params: { id: visible.id, date: itemRef.current.scheduleDate } }); }} /><PrimaryButton title={busy ? "삭제 중..." : "일정 삭제"} danger disabled={loading || busy || needsRefresh} onPress={() => void remove()} /></View> : null}</> : null}
    {confirmation.dialog}
  </ScrollView>;
}
const styles = StyleSheet.create({ container: { padding: 12, paddingBottom: 32, gap: 8, width: "100%", maxWidth: 960, alignSelf: "center" }, actions: { flexDirection: "row", flexWrap: "wrap", gap: 4, alignItems: "center" }, title: { fontSize: 18, fontWeight: "700" }, small: { fontSize: 13, lineHeight: 20, fontVariant: ["tabular-nums"] } });
