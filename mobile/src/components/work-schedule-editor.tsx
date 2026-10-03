import { router, useFocusEffect } from "expo-router";
import { useNavigation, usePreventRemove } from "expo-router/react-navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AccountFeedback } from "@/components/account-feedback";
import { PrimaryButton, TextAction } from "@/components/ui";
import { useConfirmAction } from "@/components/use-confirm-action";
import { ScheduleField, WorkScheduleContent } from "@/components/work-schedule-content";
import { ApiError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { isManualScheduleId, isScheduleDate, isScheduleManualResponse, isScheduleMutation, isSchedulePage, scheduleDirty, schedulePayloadMatches, scheduleSavedMatches, scheduleSaveInput, scheduleUpdateInput, scheduleValues, validateScheduleInput, type ScheduleErrors, type ScheduleValues, type ScheduleAttemptInput } from "@/lib/schedules";
import { useTheme } from "@/lib/theme";
import type { MobileManualSchedule, MobileScheduleManualResponse, MobileScheduleMutation, MobileSchedulePage } from "@/lib/types";

type EditorData = { today: string; initialDate: string; item: MobileManualSchedule | null };
type Attempt = { input: ScheduleAttemptInput; baseline: MobileManualSchedule | null };
type Recovery = "check" | "choose" | "existing" | null;
export function WorkScheduleEditor({ id, date }: { id?: string; date?: string }) {
  const { token } = useSession(); const key = `${token}:${id ?? "new"}:${date ?? "today"}`; const scope = useRef(key);
  useLayoutEffect(() => { scope.current = key; }, [key]);
  const isCurrentAccount = useCallback(() => !!token && scope.current === key, [key, token]);
  return token ? <WorkScheduleEditorContent key={key} id={id} date={date} isCurrentAccount={isCurrentAccount} /> : null;
}
function WorkScheduleEditorContent({ id, date, isCurrentAccount }: { id?: string; date?: string; isCurrentAccount: () => boolean }) {
  const { request, user } = useSession(); const theme = useTheme(); const insets = useSafeAreaInsets(); const navigation = useNavigation(); const confirmation = useConfirmAction();
  const [data, setData] = useState<EditorData | null>(null); const [values, setValues] = useState<ScheduleValues>(scheduleValues(null, date ?? ""));
  const [errors, setErrors] = useState<ScheduleErrors>({}); const [error, setError] = useState<string | null>(null); const [loadError, setLoadError] = useState<string | null>(null); const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [privacyPending, setPrivacyPending] = useState(true); const [recovery, setRecoveryState] = useState<Recovery>(null); const [candidate, setCandidate] = useState<MobileManualSchedule | null>(null); const [retainedDirty, setRetainedDirty] = useState(false);
  const alive = useRef(true); const focused = useRef(false); const generation = useRef(0); const sequence = useRef(0); const locked = useRef(false); const verified = useRef(false);
  const dataRef = useRef(data); const valuesRef = useRef(values); const recoveryRef = useRef(recovery); const attempt = useRef<Attempt | null>(null); const candidateRef = useRef(candidate);
  const updateValues = useCallback((value: ScheduleValues) => { valuesRef.current = value; setValues(value); }, []);
  const updateData = useCallback((value: EditorData | null) => { dataRef.current = value; setData(value); }, []);
  const setRecovery = useCallback((value: Recovery) => { recoveryRef.current = value; setRecoveryState(value); }, []);
  const updateCandidate = useCallback((value: MobileManualSchedule | null) => { candidateRef.current = value; setCandidate(value); }, []);
  const invalidate = useCallback(() => { generation.current++; sequence.current++; }, []);
  useEffect(() => { alive.current = true; invalidate(); return () => { alive.current = false; invalidate(); locked.current = false; attempt.current = null; }; }, [invalidate]);
  const active = useCallback((scope: number, op: number) => alive.current && focused.current && generation.current === scope && sequence.current === op && isCurrentAccount(), [isCurrentAccount]);
  const dirty = data ? scheduleDirty(values, data.item, data.initialDate) : retainedDirty;
  usePreventRemove(!!user && (dirty || busy || !!recovery), ({ data: actionData }) => {
    if (locked.current || !focused.current || !isCurrentAccount()) return;
    const scope = generation.current;
    void confirmation.ask({ title: "일정 작성 화면 나가기", message: "저장하지 않은 입력이 사라집니다. 저장 결과가 불명확하면 먼저 최신 일정을 확인하세요. 나가시겠습니까?", confirm: "나가기", danger: true }).then(accepted => { if (accepted && alive.current && focused.current && generation.current === scope && isCurrentAccount()) navigation.dispatch(actionData.action); });
  });
  useEffect(() => {
    if (Platform.OS !== "web" || !user || !(dirty || busy || recovery)) return;
    const prevent = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; }; window.addEventListener("beforeunload", prevent); return () => window.removeEventListener("beforeunload", prevent);
  }, [busy, dirty, recovery, user]);
  const clearPrivate = useCallback((discardInput: boolean) => { const current = dataRef.current; if (current) setRetainedDirty(scheduleDirty(valuesRef.current, current.item, current.initialDate)); verified.current = false; setPrivacyPending(true); updateData(null); updateCandidate(null); if (discardInput) { setRetainedDirty(false); updateValues(scheduleValues(null, date ?? "")); attempt.current = null; setRecovery(null); } else if (attempt.current) setRecovery("check"); }, [date, setRecovery, updateCandidate, updateData, updateValues]);
  const load = useCallback(async (recover = false, verifyScope = false) => {
    if (locked.current || !focused.current || !isCurrentAccount()) return;
    if ((id !== undefined && !isManualScheduleId(id)) || (date !== undefined && !isScheduleDate(date))) { clearPrivate(false); setLoading(false); setLoadError("일정 ID 또는 날짜 형식을 확인하세요. 다른 일정으로 자동 변경하지 않습니다."); return; }
    const scope = generation.current; const op = ++sequence.current; locked.current = true; setLoading(true); setLoadError(null);
    if (verifyScope) { verified.current = false; setPrivacyPending(true); }
    try {
      const previous = dataRef.current; const pending = attempt.current; const local = valuesRef.current;
      const targetId = pending?.input.manualScheduleId ?? previous?.item?.id ?? id;
      let response: EditorData;
      if (targetId) {
        const result = await request<MobileScheduleManualResponse>(`/schedules/manual/${encodeURIComponent(targetId)}`);
        if (!active(scope, op)) return;
        if (!isScheduleManualResponse(result, targetId)) throw new ApiError("일정 응답을 확인하지 못했습니다. 다시 불러오세요.", 200);
        response = { today: result.today, initialDate: previous?.initialDate ?? result.item.scheduleDate, item: result.item };
      } else {
        const fetchDate = pending?.input.scheduleDate ?? previous?.initialDate ?? date;
        const result = await request<MobileSchedulePage>(`/schedules${fetchDate === undefined ? "" : `?date=${encodeURIComponent(fetchDate)}`}`);
        if (!active(scope, op)) return;
        if (!isSchedulePage(result, { date: fetchDate })) throw new ApiError("일정 응답을 확인하지 못했습니다. 다시 불러오세요.", 200);
        response = { today: result.today, initialDate: previous?.initialDate ?? result.selectedDate, item: null };
        if (recover && pending && pending.input.manualScheduleId === null) {
          const matching = result.items.find(item => item.sourceType === "manual" && schedulePayloadMatches(item, pending.input));
          updateData(response); updateValues(local); updateCandidate(matching?.sourceType === "manual" ? matching : null);
          if (matching) { setError(null); setErrors({}); }
          setRecovery(matching ? "existing" : "check"); setNotice(matching ? "같은 내용의 일정이 이미 있습니다. 이 요청으로 등록됐는지는 확인할 수 없습니다. 확인 후 기존 일정으로 전환할 수 있습니다." : "등록 결과를 확정할 수 없습니다. 같은 일정이 이동했을 수도 있습니다. 새 등록 요청을 다시 보내지 않고 입력을 보관합니다.");
          verified.current = true; setPrivacyPending(false); return;
        }
      }
      updateData(response); updateCandidate(null); setError(null); setErrors({});
      if (recover && pending && response.item && scheduleSavedMatches(response.item, pending.input, pending.baseline)) {
        updateValues(scheduleValues(response.item, response.initialDate)); attempt.current = null; setRecovery(null); setNotice("최신 일정에서 요청한 내용을 확인했습니다.");
      } else if (recover || recoveryRef.current || (previous && scheduleDirty(local, previous.item, previous.initialDate) && previous.item?.updatedAt !== response.item?.updatedAt)) {
        updateValues(local); setRecovery("choose"); setNotice("최신 일정과 보관한 입력을 비교하고 계속 작성할 내용을 선택하세요.");
      } else updateValues(previous && scheduleDirty(local, previous.item, previous.initialDate) ? local : scheduleValues(response.item, response.initialDate));
      verified.current = true; setPrivacyPending(false);
    } catch (cause) {
      if (!active(scope, op)) return;
      if (cause instanceof ApiError && (cause.status === 403 || cause.status === 404)) clearPrivate(cause.status === 403);
      setLoadError(cause instanceof Error ? cause.message : "일정을 불러오지 못했습니다. 다시 시도하세요.");
    } finally { if (generation.current === scope && sequence.current === op) locked.current = false; if (active(scope, op)) setLoading(false); }
  }, [active, clearPrivate, date, id, isCurrentAccount, request, setRecovery, updateCandidate, updateData, updateValues]);
  const latestLoad = useRef(load); useLayoutEffect(() => { latestLoad.current = load; }, [load]);
  useFocusEffect(useCallback(() => {
    focused.current = true; verified.current = false; setPrivacyPending(true); void load(!!attempt.current || !!recoveryRef.current, true);
    return () => { focused.current = false; verified.current = false; setPrivacyPending(true); invalidate(); if (locked.current && attempt.current) { setRecovery("check"); setError("저장 결과를 확인하지 못했습니다. 최신 일정을 확인하세요."); } locked.current = false; setBusy(false); };
  }, [invalidate, load, setRecovery]));
  const change = (name: string, value: string) => { if (locked.current || !verified.current || !focused.current || loading || recoveryRef.current || !isCurrentAccount()) return; updateValues({ ...valuesRef.current, [name]: value }); setErrors(previous => ({ ...previous, [name]: "" })); setError(null); setNotice(null); };
  const choose = async (server: boolean) => {
    if (locked.current || loading || !verified.current || !focused.current || recoveryRef.current !== "choose" || !dataRef.current || !isCurrentAccount()) return;
    const scope = generation.current; locked.current = true;
    try {
      if (server && !await confirmation.ask({ title: "서버 내용으로 교체", message: "보관한 입력이 최신 일정으로 바뀝니다. 교체하시겠습니까?", confirm: "교체", danger: true })) return;
      if (!alive.current || !focused.current || generation.current !== scope || !isCurrentAccount()) return;
      if (server) updateValues(scheduleValues(dataRef.current.item, dataRef.current.initialDate));
      attempt.current = null; setRecovery(null); setError(null); setErrors({}); setNotice(server ? "최신 일정으로 교체했습니다." : "입력을 유지했습니다. 최신 일정과 비교한 뒤 명시적으로 저장하세요.");
    } finally { if (generation.current === scope) locked.current = false; }
  };
  const adoptExisting = async () => {
    if (locked.current || loading || !verified.current || !focused.current || recoveryRef.current !== "existing" || !candidateRef.current || !dataRef.current || !isCurrentAccount()) return;
    const scope = generation.current; const item = candidateRef.current; locked.current = true;
    try {
      if (!await confirmation.ask({ title: "기존 일정 수정으로 전환", message: "이 일정이 본인 등록 요청의 결과인지는 확인할 수 없습니다. 공용 기존 일정을 확인하고 수정 대상으로 사용하시겠습니까? 새로 등록하지 않습니다.", confirm: "기존 일정 사용" })) return;
      if (!alive.current || !focused.current || generation.current !== scope || !isCurrentAccount()) return;
      updateData({ ...dataRef.current, item }); updateValues(scheduleValues(item, item.scheduleDate)); attempt.current = null; updateCandidate(null); setRecovery(null); setError(null); setErrors({}); setNotice("기존 공용 일정을 수정 대상으로 선택했습니다. 변경 후 저장하면 이 일정에 반영됩니다.");
    } finally { if (generation.current === scope) locked.current = false; }
  };
  const save = async () => {
    const current = dataRef.current;
    if (locked.current || !verified.current || loading || loadError || recoveryRef.current || !current || !focused.current || !isCurrentAccount()) return;
    const input = scheduleSaveInput(valuesRef.current, current.item); const fields = validateScheduleInput(input);
    if (Object.keys(fields).length) { setErrors(fields); setError("입력 내용을 확인해 주세요."); return; }
    const scope = generation.current; const op = ++sequence.current; locked.current = true; attempt.current = { input, baseline: current.item }; setBusy(true); setError(null); setErrors({}); setNotice(null); let saved = false;
    try {
      const response = await request<MobileScheduleMutation>(input.manualScheduleId ? `/schedules/manual/${encodeURIComponent(input.manualScheduleId)}` : "/schedules", { method: input.manualScheduleId ? "PUT" : "POST", body: input.manualScheduleId ? scheduleUpdateInput(input) : input });
      if (!active(scope, op)) return;
      if (!isScheduleMutation(response, input, current.item)) throw new ApiError("저장 결과를 확인하지 못했습니다. 최신 일정을 확인하세요.", 200);
      updateData({ ...current, item: response.item }); updateValues(scheduleValues(response.item, response.item.scheduleDate)); attempt.current = null; setRecovery(null); setNotice(response.message); saved = true;
    } catch (cause) {
      if (!active(scope, op)) return;
      setError(cause instanceof Error ? cause.message : "저장 결과를 확인하지 못했습니다. 최신 일정을 확인하세요."); setErrors(cause instanceof ApiError ? cause.fields ?? {} : {});
      if (cause instanceof ApiError && (cause.status === 403 || cause.status === 404)) clearPrivate(cause.status === 403);
      else if (!(cause instanceof ApiError) || cause.status === 0 || cause.status === 409 || cause.status >= 500 || cause.status >= 200 && cause.status < 300) setRecovery("check");
      else attempt.current = null;
    } finally {
      if (generation.current === scope && sequence.current === op) locked.current = false;
      if (alive.current && generation.current === scope && isCurrentAccount()) setBusy(false);
      if (saved && focused.current && generation.current === scope && isCurrentAccount()) void latestLoad.current();
    }
  };
  const navigateList = async () => {
    if (!alive.current || !focused.current || locked.current || !isCurrentAccount()) return;
    const scope = generation.current; locked.current = true;
    try {
      const current = dataRef.current;
      if ((recoveryRef.current || current && scheduleDirty(valuesRef.current, current.item, current.initialDate)) && !await confirmation.ask({ title: "일정 목록으로 이동", message: "입력은 현재 작성 화면에 남습니다. 저장 결과가 불명확하면 먼저 최신 일정을 확인하세요. 목록을 열겠습니까?", confirm: "목록 열기" })) return;
      if (alive.current && focused.current && generation.current === scope && isCurrentAccount()) router.push({ pathname: "/work-schedules", params: { ...(isScheduleDate(valuesRef.current.scheduleDate) ? { date: valuesRef.current.scheduleDate } : {}) } });
    } finally { if (generation.current === scope) locked.current = false; }
  };
  const correctDate = () => { if (!loading && !locked.current && focused.current && isCurrentAccount() && isScheduleDate(valuesRef.current.scheduleDate)) router.setParams({ date: valuesRef.current.scheduleDate }); };
  const disabled = privacyPending || loading || busy || !!recovery || !!loadError; const visible = privacyPending ? null : data;
  return <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.background }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={insets.top + 44}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.container}>
      <View style={styles.actions}><TextAction label={loading ? "불러오는 중..." : "최신 일정 확인"} icon="refresh" disabled={loading || busy} onPress={() => void load(!!attempt.current || !!recoveryRef.current)} /><TextAction label="일정 목록" disabled={loading || busy} onPress={() => void navigateList()} /></View>
      <AccountFeedback message={notice} /><AccountFeedback error={error ?? loadError} />
      {loading ? <View style={styles.actions} accessibilityRole="progressbar" accessibilityLabel="일정 불러오는 중"><ActivityIndicator color={theme.accent} /><Text style={[styles.small, { color: theme.secondary }]}>일정 불러오는 중...</Text></View> : null}
      {date !== undefined && !isScheduleDate(date) ? <><ScheduleField name="scheduleDate" label="일정 날짜" value={values.scheduleDate} placeholder="YYYY-MM-DD" onChange={(_, next) => updateValues({ ...valuesRef.current, scheduleDate: next })} /><TextAction label="날짜 적용" onPress={correctDate} /></> : null}
      {visible ? <>
        <Text style={[styles.small, { color: theme.secondary }]}>시설 공용 일정 {visible.item ? "수정" : "등록"} · 날짜·시간·내용 필수</Text>
        {recovery === "check" ? <Text style={[styles.small, { color: theme.secondary }]}>저장 요청을 다시 보내지 않습니다. 최신 일정을 확인하여 내용과 상태를 비교하세요.</Text> : null}
        {recovery === "choose" ? <View style={[styles.compare, { borderColor: theme.border, backgroundColor: theme.surfaceMuted }]}><Text accessibilityRole="header" aria-level={2} style={[styles.label, { color: theme.text }]}>최신 서버 일정</Text>{visible.item ? <WorkScheduleContent item={visible.item} /> : <Text style={[styles.small, { color: theme.secondary }]}>최신 일정 없음</Text>}<View style={styles.actions}><TextAction label="보관한 입력 유지" onPress={() => void choose(false)} /><TextAction label="서버 내용으로 교체" onPress={() => void choose(true)} /></View></View> : null}
        {recovery === "existing" && candidate ? <View style={[styles.compare, { borderColor: theme.border, backgroundColor: theme.surfaceMuted }]}><Text accessibilityRole="header" aria-level={2} style={[styles.label, { color: theme.text }]}>이미 있는 공용 일정</Text><WorkScheduleContent item={candidate} /><TextAction label="기존 일정 수정으로 전환" onPress={() => void adoptExisting()} /></View> : null}
        <ScheduleField name="scheduleDate" label="일정 날짜" value={values.scheduleDate} error={errors.scheduleDate} disabled={disabled} placeholder="YYYY-MM-DD" hint="미래 날짜도 등록할 수 있습니다." onChange={change} />
        <View style={styles.times}><View style={{ flex: 1, minWidth: 120 }}><ScheduleField name="startTime" label="시작 시간" value={values.startTime} error={errors.startMinute} disabled={disabled} placeholder="09:00" hint="09:00~17:50 · 10분 단위" keyboardType="numbers-and-punctuation" onChange={change} /></View><View style={{ flex: 1, minWidth: 120 }}><ScheduleField name="endTime" label="종료 시간" value={values.endTime} error={errors.endMinute} disabled={disabled} placeholder="10:00" hint="시작 이후~18:00 · 10분 단위" keyboardType="numbers-and-punctuation" onChange={change} /></View></View>
        <ScheduleField name="content" label="일정 내용" value={values.content} error={errors.content} disabled={disabled} multiline onChange={change} />
        <Text style={[styles.small, { color: theme.secondary }]}>입력은 저장을 눌러야 반영됩니다. 다른 직원도 이 공용 일정을 변경할 수 있습니다.</Text>
      </> : null}
    </ScrollView>
    {visible ? <View accessibilityLabel="업무 일정 저장" style={[styles.bar, { backgroundColor: theme.surface, borderColor: theme.border, paddingBottom: Math.max(insets.bottom, 8) }]}><PrimaryButton title={busy ? "저장 중..." : visible.item ? "일정 수정 저장" : "일정 등록"} disabled={disabled} onPress={() => void save()} /></View> : null}
    {confirmation.dialog}
  </KeyboardAvoidingView>;
}
const styles = StyleSheet.create({ container: { padding: 12, paddingBottom: 24, gap: 8, width: "100%", maxWidth: 960, alignSelf: "center" }, actions: { flexDirection: "row", flexWrap: "wrap", gap: 4, alignItems: "center" }, times: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, label: { fontSize: 15, fontWeight: "700" }, small: { fontSize: 13, lineHeight: 20, fontVariant: ["tabular-nums"] }, compare: { padding: 12, borderWidth: 1, borderRadius: 8, gap: 8 }, bar: { paddingHorizontal: 12, paddingTop: 8, borderTopWidth: 1 } });
