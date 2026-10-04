import { KeyboardScrollView } from "@/components/keyboard-scroll-view";
import { KeyboardScreen } from "@/components/keyboard-screen";
import { router, useFocusEffect } from "expo-router";
import { useNavigation, usePreventRemove } from "expo-router/react-navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AccountFeedback } from "@/components/account-feedback";
import { PrimaryButton, TextAction } from "@/components/ui";
import { useConfirmAction } from "@/components/use-confirm-action";
import { WorkLogContent, WorkLogField } from "@/components/work-log-content";
import { ApiError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { formatWorkLogDate, formatWorkLogMinute, isWorkLogDate, isWorkLogDateResponse, isWorkLogPage, isWorkLogSave, mergeWorkLogSchedules, validateWorkLogInput, workLogContentLimit, workLogDirty, workLogKeywordLimit, workLogSavedMatches, workLogSaveInput, workLogValues, type WorkLogErrors, type WorkLogTarget, type WorkLogValues } from "@/lib/work-logs";
import { useTheme } from "@/lib/theme";
import type { MobileWorkLogDate, MobileWorkLogEntry, MobileWorkLogPage, MobileWorkLogSave, MobileWorkLogSaveInput } from "@/lib/types";

type Recovery = "check" | "choose" | null;
type Attempt = { input: MobileWorkLogSaveInput; baseline: MobileWorkLogEntry | null };
export function WorkLogEditor({ date }: { date?: string }) {
  const { token } = useSession(); const key = `${token}:${date ?? "today"}`; const scope = useRef(key);
  useLayoutEffect(() => { scope.current = key; }, [key]);
  const isCurrentAccount = useCallback(() => !!token && scope.current === key, [key, token]);
  return token ? <WorkLogEditorContent key={key} date={date} isCurrentAccount={isCurrentAccount} /> : null;
}
function WorkLogEditorContent({ date, isCurrentAccount }: { date?: string; isCurrentAccount: () => boolean }) {
  const { request, user } = useSession(); const theme = useTheme(); const insets = useSafeAreaInsets(); const navigation = useNavigation(); const confirmation = useConfirmAction();
  const [data, setData] = useState<MobileWorkLogDate | null>(null); const [values, setValues] = useState<WorkLogValues>({ keyword: "", content: "" }); const [dateInput, setDateInput] = useState(date ?? "");
  const [errors, setErrors] = useState<WorkLogErrors>({}); const [error, setError] = useState<string | null>(null); const [loadError, setLoadError] = useState<string | null>(null); const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [privacyPending, setPrivacyPending] = useState(true); const [recovery, setRecoveryState] = useState<Recovery>(null); const [references, setReferences] = useState(false);
  const alive = useRef(true); const focused = useRef(false); const generation = useRef(0); const sequence = useRef(0); const locked = useRef(false); const verified = useRef(false);
  const dataRef = useRef(data); const valuesRef = useRef(values); const recoveryRef = useRef(recovery); const attempt = useRef<Attempt | null>(null);
  const setRecovery = useCallback((value: Recovery) => { recoveryRef.current = value; setRecoveryState(value); }, []);
  const updateValues = useCallback((value: WorkLogValues) => { valuesRef.current = value; setValues(value); }, []);
  const updateData = useCallback((value: MobileWorkLogDate | null) => { dataRef.current = value; setData(value); }, []);
  const invalidate = useCallback(() => { generation.current++; sequence.current++; }, []);
  useEffect(() => { alive.current = true; invalidate(); return () => { alive.current = false; invalidate(); locked.current = false; attempt.current = null; }; }, [invalidate]);
  const active = useCallback((scope: number, op: number) => alive.current && focused.current && generation.current === scope && sequence.current === op && isCurrentAccount(), [isCurrentAccount]);
  const dirty = !!data && workLogDirty(values, data.entry);
  usePreventRemove(!!user && (dirty || busy || !!recovery), ({ data: actionData }) => {
    if (locked.current || !focused.current || !isCurrentAccount()) return;
    const scope = generation.current;
    void confirmation.ask({ title: "업무일지 작성 화면 나가기", message: "저장하지 않은 입력이 사라집니다. 저장 결과가 불명확하면 먼저 최신 기록을 확인하세요. 나가시겠습니까?", confirm: "나가기", danger: true }).then(accepted => { if (accepted && alive.current && focused.current && generation.current === scope && isCurrentAccount()) navigation.dispatch(actionData.action); });
  });
  useEffect(() => {
    if (Platform.OS !== "web" || !user || !(dirty || busy || recovery)) return;
    const prevent = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; }; window.addEventListener("beforeunload", prevent); return () => window.removeEventListener("beforeunload", prevent);
  }, [busy, dirty, recovery, user]);
  const load = useCallback(async (recover = false, verifyScope = false) => {
    if (locked.current || !focused.current || !isCurrentAccount()) return;
    if (date !== undefined && !isWorkLogDate(date)) { updateData(null); updateValues({ keyword: "", content: "" }); setLoading(false); setLoadError("기록일을 YYYY-MM-DD 형식으로 입력하세요. 다른 날짜로 자동 변경하지 않습니다."); return; }
    const scope = generation.current; const op = ++sequence.current; locked.current = true; setLoading(true); setLoadError(null);
    if (verifyScope) { verified.current = false; setPrivacyPending(true); }
    try {
      let response: MobileWorkLogDate;
      const fetchDate = date ?? dataRef.current?.workDate ?? attempt.current?.input.workDate;
      if (fetchDate === undefined) {
        const page = await request<MobileWorkLogPage>("/work-logs");
        if (!active(scope, op)) return;
        if (!isWorkLogPage(page)) throw new ApiError("업무일지 응답을 확인하지 못했습니다. 다시 불러오세요.", 200);
        response = { today: page.today, workDate: page.selectedDate, entry: page.selectedEntry, linkedScheduleState: page.linkedScheduleState };
      } else {
        response = await request<MobileWorkLogDate>(`/work-logs/${encodeURIComponent(fetchDate)}`);
        if (!active(scope, op)) return;
        if (!isWorkLogDateResponse(response, fetchDate)) throw new ApiError("업무일지 응답을 확인하지 못했습니다. 다시 불러오세요.", 200);
      }
      const previous = dataRef.current; const local = valuesRef.current; const pending = attempt.current;
      updateData(response); setDateInput(response.workDate); setError(null); setErrors({});
      if (recover && pending && workLogSavedMatches(response.entry, pending.input, pending.baseline)) {
        updateValues(workLogValues(response.entry)); attempt.current = null; setRecovery(null); setNotice("최신 기록에서 저장된 내용을 확인했습니다.");
      } else if (recover || recoveryRef.current || (previous && workLogDirty(local, previous.entry) && (previous.entry?.manualLogId !== response.entry?.manualLogId || previous.entry?.manualUpdatedAt !== response.entry?.manualUpdatedAt))) {
        updateValues(local); setRecovery("choose"); setNotice("최신 기록을 확인했습니다. 보관한 입력과 비교한 뒤 계속 작성할 내용을 선택하세요.");
      } else { updateValues(previous && workLogDirty(local, previous.entry) ? local : workLogValues(response.entry)); }
      verified.current = true; setPrivacyPending(false);
    } catch (cause) {
      if (!active(scope, op)) return;
      if (cause instanceof ApiError && (cause.status === 403 || cause.status === 404)) { verified.current = false; setPrivacyPending(true); updateData(null); updateValues({ keyword: "", content: "" }); attempt.current = null; setRecovery(null); }
      if (cause instanceof ApiError && cause.status === 400) setErrors(cause.fields ?? {});
      setLoadError(cause instanceof Error ? cause.message : "업무일지를 불러오지 못했습니다. 다시 시도하세요.");
    } finally { if (generation.current === scope && sequence.current === op) locked.current = false; if (active(scope, op)) setLoading(false); }
  }, [active, date, isCurrentAccount, request, setRecovery, updateData, updateValues]);
  const latestLoad = useRef(load); useLayoutEffect(() => { latestLoad.current = load; }, [load]);
  useFocusEffect(useCallback(() => {
    focused.current = true; verified.current = false; setPrivacyPending(true); void load(!!attempt.current || !!recoveryRef.current, true);
    return () => { focused.current = false; verified.current = false; setPrivacyPending(true); invalidate(); if (locked.current && attempt.current) { setRecovery("check"); setError("저장 결과를 확인하지 못했습니다. 최신 기록을 확인하세요."); } locked.current = false; setBusy(false); };
  }, [invalidate, load, setRecovery]));
  const change = (name: string, value: string) => {
    if (locked.current || !verified.current || loading || recoveryRef.current || !isCurrentAccount()) return;
    updateValues({ ...valuesRef.current, [name]: value }); setErrors(previous => ({ ...previous, [name]: "" })); setError(null); setNotice(null);
  };
  const changeDate = async (next = dateInput) => {
    if (locked.current || loading || !focused.current || !isCurrentAccount()) return;
    if (!isWorkLogDate(next) || (dataRef.current && next > dataRef.current.today)) { setErrors(previous => ({ ...previous, workDate: "기록일을 YYYY-MM-DD 형식으로 오늘까지 입력하세요." })); setError("기록일을 확인해 주세요."); return; }
    if (next === (dataRef.current?.workDate ?? date) && !loadError) return;
    const scope = generation.current; locked.current = true;
    try {
      if ((workLogDirty(valuesRef.current, dataRef.current?.entry ?? null) || recoveryRef.current) && !await confirmation.ask({ title: "기록일 변경", message: "저장하지 않은 현재 날짜 입력이 사라집니다. 저장 결과가 불명확하면 먼저 최신 기록을 확인하세요. 날짜를 바꾸시겠습니까?", confirm: "날짜 변경", danger: true })) return;
      if (alive.current && focused.current && generation.current === scope && isCurrentAccount()) router.setParams({ date: next });
    } finally { if (generation.current === scope) locked.current = false; }
  };
  const navigate = async (target: WorkLogTarget) => {
    if (locked.current || !verified.current || !focused.current || !isCurrentAccount()) return;
    const scope = generation.current; locked.current = true;
    try {
      if ((workLogDirty(valuesRef.current, dataRef.current?.entry ?? null) || recoveryRef.current) && !await confirmation.ask({ title: "참고 자료로 이동", message: "현재 입력은 작성 화면에 남습니다. 저장 결과가 불명확하면 먼저 최신 기록을 확인하세요. 참고 자료를 열겠습니까?", confirm: "열기" })) return;
      if (alive.current && focused.current && generation.current === scope && isCurrentAccount()) router.push(target);
    } finally { if (generation.current === scope) locked.current = false; }
  };
  const choose = async (useServer: boolean) => {
    if (locked.current || loading || !verified.current || recoveryRef.current !== "choose" || !dataRef.current || !isCurrentAccount()) return;
    const scope = generation.current; locked.current = true;
    try {
      if (useServer && !await confirmation.ask({ title: "서버 내용으로 교체", message: "보관한 입력이 최신 저장 내용으로 바뀝니다. 교체하시겠습니까?", confirm: "교체", danger: true })) return;
      if (!alive.current || !focused.current || generation.current !== scope || !isCurrentAccount()) return;
      if (useServer) updateValues(workLogValues(dataRef.current.entry));
      attempt.current = null; setRecovery(null); setError(null); setErrors({}); setNotice(useServer ? "최신 저장 내용으로 교체했습니다." : "입력을 유지했습니다. 최신 기록과 비교한 뒤 명시적으로 저장하세요.");
    } finally { if (generation.current === scope) locked.current = false; }
  };
  const save = async () => {
    const current = dataRef.current;
    if (locked.current || !verified.current || loading || loadError || recoveryRef.current || !current || !focused.current || !isCurrentAccount()) return;
    const input = workLogSaveInput(current.workDate, valuesRef.current, current.entry); const fields = validateWorkLogInput(input, current.today);
    if (Object.keys(fields).length) { setErrors(fields); setError("입력 내용을 확인해 주세요."); return; }
    const scope = generation.current; const op = ++sequence.current; locked.current = true; attempt.current = { input, baseline: current.entry }; setBusy(true); setError(null); setErrors({}); setNotice(null); let saved = false;
    try {
      const response = await request<MobileWorkLogSave>("/work-logs", { method: "POST", body: input });
      if (!active(scope, op)) return;
      if (!isWorkLogSave(response, input, current.entry)) throw new ApiError("저장 결과를 확인하지 못했습니다. 최신 기록을 확인하세요.", 200);
      updateData({ ...current, entry: response.entry }); updateValues(workLogValues(response.entry)); attempt.current = null; setRecovery(null); setNotice(response.message); saved = true;
    } catch (cause) {
      if (!active(scope, op)) return;
      setError(cause instanceof Error ? cause.message : "저장 결과를 확인하지 못했습니다. 최신 기록을 확인하세요."); setErrors(cause instanceof ApiError ? cause.fields ?? {} : {});
      if (cause instanceof ApiError && (cause.status === 403 || cause.status === 404)) { verified.current = false; setPrivacyPending(true); updateData(null); updateValues({ keyword: "", content: "" }); attempt.current = null; setRecovery(null); }
      else if (!(cause instanceof ApiError) || cause.status === 0 || cause.status === 409 || cause.status >= 500 || (cause.status >= 200 && cause.status < 300)) setRecovery("check");
      else attempt.current = null;
    } finally {
      if (generation.current === scope && sequence.current === op) locked.current = false;
      if (alive.current && generation.current === scope && isCurrentAccount()) setBusy(false);
      if (saved && focused.current && generation.current === scope && isCurrentAccount()) void latestLoad.current();
    }
  };
  const addSchedules = () => {
    if (locked.current || !verified.current || loading || !focused.current || !isCurrentAccount() || recoveryRef.current || dataRef.current?.linkedScheduleState.status !== "ready") return;
    const result = mergeWorkLogSchedules(valuesRef.current.content, dataRef.current.linkedScheduleState.schedules); updateValues({ ...valuesRef.current, content: result.content }); setError(null); setNotice(`${result.added}건을 입력에 추가했습니다.${result.skipped ? ` 5,000자 제한으로 ${result.skipped}건은 추가하지 못했습니다.` : ""} 저장 전까지 화면 입력에만 반영됩니다.`);
  };
  const disabled = privacyPending || loading || busy || !!recovery || !!loadError; const visible = privacyPending ? null : data;
  return <KeyboardScreen style={{ flex: 1, backgroundColor: theme.background }}>
    <KeyboardScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.container}>
      <WorkLogField name="workDate" label="기록일" value={dateInput} placeholder="YYYY-MM-DD" maxLength={10} disabled={loading || busy} error={errors.workDate} onChange={(_, value) => setDateInput(value)} />
      <View style={styles.actions}><TextAction label="날짜 조회" disabled={loading || busy} onPress={() => void changeDate()} />{data ? <TextAction label="오늘" disabled={loading || busy} onPress={() => void changeDate(data.today)} /> : null}<TextAction label={loading ? "불러오는 중..." : "최신 기록 확인"} icon="refresh" disabled={loading || busy} onPress={() => void load(!!attempt.current || !!recoveryRef.current)} /></View>
      <AccountFeedback message={notice} /><AccountFeedback error={error ?? loadError} />
      {loading ? <View style={styles.actions} accessibilityRole="progressbar" accessibilityLabel="업무일지 불러오는 중"><ActivityIndicator color={theme.accent} /><Text style={[styles.small, { color: theme.secondary }]}>업무일지 불러오는 중...</Text></View> : null}
      {visible ? <>
        <Text style={[styles.small, { color: theme.secondary }]}>{formatWorkLogDate(visible.workDate)} · 직접 작성 기록 {visible.entry?.manualLogId ? "수정" : "새 작성"} · 키워드와 업무 내용 필수</Text>
        {recovery === "check" ? <Text style={[styles.small, { color: theme.secondary }]}>저장 요청을 다시 보내지 않습니다. 최신 기록을 확인하여 저장 여부와 내용을 비교하세요.</Text> : null}
        {recovery === "choose" ? <View style={[styles.compare, { borderColor: theme.border, backgroundColor: theme.surfaceMuted }]}><Text accessibilityRole="header" aria-level={2} style={[styles.label, { color: theme.text }]}>최신 서버 직접 작성 기록</Text><Text selectable style={[styles.body, { color: theme.text }]}>{visible.entry?.manualLogId ? `${visible.entry.keyword}\n${visible.entry.content}` : "저장된 직접 작성 기록 없음"}</Text><View style={styles.actions}><TextAction label="보관한 입력 유지" onPress={() => void choose(false)} /><TextAction label="서버 내용으로 교체" onPress={() => void choose(true)} /></View></View> : null}
        <WorkLogField name="keyword" label="키워드" value={values.keyword} error={errors.keyword} disabled={disabled} maxLength={workLogKeywordLimit} onChange={change} />
        <Text style={[styles.small, { color: theme.secondary }]}>{values.keyword.length}/100자</Text>
        <WorkLogField name="content" label="업무 내용" value={values.content} error={errors.content} disabled={disabled} multiline maxLength={workLogContentLimit} onChange={change} />
        <Text style={[styles.small, { color: theme.secondary }]}>{values.content.length.toLocaleString()}/5,000자 · 입력한 내용은 저장을 눌러야 반영됩니다.</Text>
        <TextAction label={`참고 자료 ${references ? "접기" : "펼치기"}`} accessibilityState={{ expanded: references }} onPress={() => setReferences(value => !value)} />
        {references ? <>
          <WorkLogContent entry={visible.entry} onNavigate={target => void navigate(target)} disabled={loading || busy} />
          <Text accessibilityRole="header" aria-level={2} style={[styles.label, { color: theme.text }]}>참고 청소년 일정</Text>
          {visible.linkedScheduleState.status === "error" ? <><Text style={[styles.small, { color: theme.secondary }]}>참고 일정을 불러오지 못했습니다. 입력은 보관되어 있습니다.</Text><TextAction label="참고 일정 다시 불러오기" disabled={loading || busy} onPress={() => void load(!!attempt.current || !!recoveryRef.current)} /></> : <><View role="list" accessibilityLabel="참고 청소년 일정">{visible.linkedScheduleState.schedules.map(item => <View role="listitem" key={item.id} style={[styles.schedule, { borderColor: theme.border }]}><Text style={[styles.body, { color: theme.text }]}>{formatWorkLogMinute(item.startMinute)}-{formatWorkLogMinute(item.endMinute)} {item.youthName} · {item.content}</Text></View>)}</View>{!visible.linkedScheduleState.schedules.length ? <Text style={[styles.small, { color: theme.secondary }]}>허용된 참고 일정이 없습니다.</Text> : <TextAction label="참고 일정 내용에 추가" disabled={disabled} onPress={addSchedules} />}</>}
        </> : null}
      </> : null}
    </KeyboardScrollView>
    {visible ? <View accessibilityLabel="업무일지 저장" style={[styles.bar, { backgroundColor: theme.surface, borderColor: theme.border, paddingBottom: Math.max(insets.bottom, 8) }]}><PrimaryButton title={busy ? "저장 중..." : "직접 작성 기록 저장"} disabled={disabled} onPress={() => void save()} /></View> : null}
    {confirmation.dialog}
  </KeyboardScreen>;
}
const styles = StyleSheet.create({ container: { padding: 12, paddingBottom: 24, gap: 8, width: "100%", maxWidth: 960, alignSelf: "center" }, actions: { flexDirection: "row", flexWrap: "wrap", gap: 4, alignItems: "center" }, label: { fontSize: 15, fontWeight: "700" }, small: { fontSize: 13, lineHeight: 20, fontVariant: ["tabular-nums"] }, body: { fontSize: 15, lineHeight: 23 }, compare: { padding: 12, borderWidth: 1, borderRadius: 8, gap: 8 }, schedule: { paddingVertical: 8, borderBottomWidth: 1 }, bar: { paddingHorizontal: 12, paddingTop: 8, borderTopWidth: 1 } });
