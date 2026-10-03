import { router, useFocusEffect } from "expo-router";
import { useNavigation, usePreventRemove } from "expo-router/react-navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AccountFeedback } from "@/components/account-feedback";
import { PrimaryButton, TextAction } from "@/components/ui";
import { useConfirmAction } from "@/components/use-confirm-action";
import { ApiError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { dailyReportDirty, dailyReportMainLimit, dailyReportSavedMatches, dailyReportSaveInput, dailyReportStatus, dailyReportValues, dailyReportYouthLimit, formatDailyReportDate, isDailyReportDate, isDailyReportEditor, isDailyReportMutation, permittedDailyReportValues, validateDailyReportInput, type DailyReportErrors, type DailyReportValues } from "@/lib/daily-reports";
import { useTheme } from "@/lib/theme";
import type { MobileDailyReportEditorResponse, MobileDailyReportMutationResponse, MobileDailyReportSaveInput } from "@/lib/types";

type LoadMode = "initial" | "refresh" | "recover";
type Recovery = "check" | "choose" | "roster" | null;
export function DailyReportEditor({ date }: { date?: string }) {
  const { token } = useSession();
  const scopeKey = `${token}:${date ?? "today"}`;
  const currentScope = useRef(scopeKey);
  useLayoutEffect(() => { currentScope.current = scopeKey; }, [scopeKey]);
  const isCurrentAccount = useCallback(() => !!token && currentScope.current === scopeKey, [scopeKey, token]);
  return token ? <DailyReportEditorContent key={scopeKey} date={date} isCurrentAccount={isCurrentAccount} /> : null;
}
function DailyReportEditorContent({ date, isCurrentAccount }: { date?: string; isCurrentAccount: () => boolean }) {
  const { request, user } = useSession();
  const ownId = user?.id;
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const confirmation = useConfirmAction();
  const [data, setData] = useState<MobileDailyReportEditorResponse | null>(null);
  const [values, setValues] = useState<DailyReportValues>({ mainContent: "", youthContents: {} });
  const [dateInput, setDateInput] = useState(date ?? "");
  const [errors, setErrors] = useState<DailyReportErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"draft" | "submit" | null>(null);
  const [recovery, setRecoveryState] = useState<Recovery>(null);
  const [notesHidden, setNotesHidden] = useState(false);
  const [privacyPending, setPrivacyPending] = useState(true);
  const scopeVerified = useRef(false);
  const [search, setSearch] = useState("");
  const [writtenOnly, setWrittenOnly] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const focused = useRef(false);
  const alive = useRef(true);
  const generation = useRef(0);
  const sequence = useRef(0);
  const locked = useRef(false);
  const dataRef = useRef(data);
  const valuesRef = useRef(values);
  const recoveryRef = useRef(recovery);
  const setRecovery = useCallback((next: Recovery) => { recoveryRef.current = next; setRecoveryState(next); }, []);
  const retained = useRef<DailyReportValues | null>(null);
  const attempt = useRef<MobileDailyReportSaveInput | null>(null);
  const latestLoad = useRef<(mode: LoadMode, verifyScope?: boolean) => Promise<void>>(async () => undefined);
  useLayoutEffect(() => { dataRef.current = data; valuesRef.current = values; recoveryRef.current = recovery; }, [data, values, recovery]);
  const invalidate = useCallback(() => { generation.current++; sequence.current++; }, []);
  useEffect(() => {
    alive.current = true; invalidate();
    return () => { alive.current = false; invalidate(); locked.current = false; retained.current = null; attempt.current = null; };
  }, [invalidate]);
  const active = useCallback((scope: number, operation: number) => alive.current && focused.current && generation.current === scope && sequence.current === operation && isCurrentAccount(), [isCurrentAccount]);
  const selectedDate = data?.selectedDate ?? date ?? "";
  const dirty = !!data && dailyReportDirty(values, data.entry, selectedDate, data.youths);
  usePreventRemove(!!user && (dirty || !!busy || !!recovery), ({ data: actionData }) => {
    if (!isCurrentAccount() || !focused.current || locked.current) return;
    const scope = generation.current;
    void confirmation.ask({ title: "업무보고 작성 화면 나가기", message: "저장하지 않은 입력이 사라집니다. 저장 결과를 확인하지 않았다면 먼저 최신 보고를 확인하세요. 나가시겠습니까?", confirm: "나가기", danger: true })
      .then(accepted => { if (accepted && alive.current && generation.current === scope && isCurrentAccount()) navigation.dispatch(actionData.action); });
  });
  useEffect(() => {
    if (Platform.OS !== "web" || !user || !(dirty || busy || recovery)) return;
    const prevent = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [busy, dirty, recovery, user]);

  const load = useCallback(async (mode: LoadMode, verifyScope = false) => {
    if (!focused.current || locked.current || !isCurrentAccount()) return;
    const scope = generation.current; const operation = ++sequence.current;
    locked.current = true; setLoading(true); setLoadError(null);
    if (date !== undefined && !isDailyReportDate(date)) {
      setData(null); setValues({ mainContent: "", youthContents: {} }); setLoadError("보고일을 YYYY-MM-DD 형식으로 입력하세요. 다른 날짜로 자동 변경하지 않습니다."); setLoading(false); locked.current = false; return;
    }
    if (verifyScope) { scopeVerified.current = false; setPrivacyPending(true); setNotesHidden(true); }
    try {
      const response = await request<MobileDailyReportEditorResponse>(`/daily-reports/editor${date === undefined ? "" : `?date=${encodeURIComponent(date)}`}`);
      if (!active(scope, operation)) return;
      if (!isDailyReportEditor(response, date) || (response.entry && response.entry.authorId !== ownId)) throw new ApiError("보고서 응답을 확인하지 못했습니다. 다시 불러오세요.", 200);
      const previous = dataRef.current;
      const local = retained.current ?? valuesRef.current;
      const permitted = permittedDailyReportValues(local, response.youths);
      setData(response); setDateInput(response.selectedDate); setExpanded({}); setError(null); setErrors({});
      if (!previous && !retained.current && !attempt.current) {
        setValues(dailyReportValues(response.entry)); setRecovery(null);
      } else if (mode === "recover" && attempt.current && dailyReportSavedMatches(response.entry, attempt.current)) {
        setValues(dailyReportValues(response.entry)); setRecovery(null); setError(null); setErrors({}); attempt.current = null;
        setNotice("최신 보고에서 저장된 내용을 확인했습니다.");
      } else if (mode === "recover" || retained.current || (previous && (previous.entry?.version ?? 0) !== (response.entry?.version ?? 0) && dailyReportDirty(local, previous.entry, previous.selectedDate, previous.youths))) {
        setValues(permitted); setRecovery("choose"); setError(null); setErrors({}); setNotice("최신 보고를 확인했습니다. 보관한 입력과 비교한 뒤 계속 작성할 내용을 선택하세요.");
      } else {
        const wasDirty = !!previous && dailyReportDirty(local, previous.entry, previous.selectedDate, previous.youths);
        setValues(wasDirty ? permitted : dailyReportValues(response.entry));
        if (recoveryRef.current === "check") setRecovery("check");
      }
      retained.current = null; scopeVerified.current = true; setPrivacyPending(false); setNotesHidden(false);
    } catch (cause) {
      if (!active(scope, operation)) return;
      if (cause instanceof ApiError && (cause.status === 404 || (cause.status === 403 && cause.code !== "NOT_ELIGIBLE"))) {
        scopeVerified.current = false; setPrivacyPending(true); dataRef.current = null; setData(null); setValues({ mainContent: "", youthContents: {} }); retained.current = null; attempt.current = null; setRecovery(null);
      }
      setError(null); if (cause instanceof ApiError && cause.status === 400) setErrors(cause.fields ?? {});
      setLoadError(cause instanceof Error ? cause.message : "업무보고를 불러오지 못했습니다. 다시 시도하세요.");
    } finally { if (generation.current === scope) locked.current = false; if (active(scope, operation)) setLoading(false); }
  }, [active, date, isCurrentAccount, request, ownId, setRecovery]);
  useLayoutEffect(() => { latestLoad.current = load; }, [load]);
  useFocusEffect(useCallback(() => {
    focused.current = true; scopeVerified.current = false; setPrivacyPending(true); void load(attempt.current || recoveryRef.current ? "recover" : dataRef.current ? "refresh" : "initial", true);
    return () => {
      focused.current = false; scopeVerified.current = false; setPrivacyPending(true); invalidate();
      if (locked.current && attempt.current) { setRecovery("check"); setError("저장 결과를 아직 확인하지 못했습니다. 최신 보고를 확인하세요."); }
      locked.current = false; setBusy(null);
    };
  }, [invalidate, load, setRecovery]));

  const change = (name: string, value: string) => {
    if (locked.current || !scopeVerified.current || loading || recoveryRef.current || !dataRef.current?.canWrite) return;
    setValues(previous => name === "mainContent" ? { ...previous, mainContent: value } : { ...previous, youthContents: { ...previous.youthContents, [name.slice(6)]: value } });
    setErrors(previous => ({ ...previous, [name]: "" })); setError(null); setNotice(null);
  };
  const changeDate = async (nextDate = dateInput) => {
    if (locked.current || loading || !isCurrentAccount()) return;
    if (!isDailyReportDate(nextDate)) { setErrors(previous => ({ ...previous, workDate: "보고일을 YYYY-MM-DD 형식으로 입력하세요." })); setError("보고일을 확인해 주세요."); return; }
    if (data && nextDate > data.today) { setErrors(previous => ({ ...previous, workDate: "오늘 이후 날짜에는 보고할 수 없습니다." })); setError("보고일을 확인해 주세요."); return; }
    if (nextDate === selectedDate && !loadError) return;
    const scope = generation.current;
    locked.current = true;
    try {
      if ((dirty || recovery) && !await confirmation.ask({ title: "보고일 변경", message: "저장하지 않은 현재 날짜 입력이 사라집니다. 저장 결과를 확인하지 않았다면 먼저 최신 보고를 확인하세요. 날짜를 바꾸시겠습니까?", confirm: "날짜 변경", danger: true })) return;
      if (alive.current && focused.current && generation.current === scope && isCurrentAccount()) router.setParams({ date: nextDate });
    } finally { if (generation.current === scope) locked.current = false; }
  };
  const choose = async (useServer: boolean) => {
    if (locked.current || loading || recovery !== "choose" || !data || !isCurrentAccount()) return;
    const scope = generation.current; locked.current = true;
    try {
      if (useServer && !await confirmation.ask({ title: "서버 내용으로 교체", message: "화면에 보관한 입력이 최신 저장 내용으로 바뀝니다. 교체하시겠습니까?", confirm: "교체", danger: true })) return;
      if (!alive.current || !focused.current || generation.current !== scope || !isCurrentAccount()) return;
      setValues(useServer ? dailyReportValues(data.entry) : permittedDailyReportValues(valuesRef.current, data.youths));
      attempt.current = null; retained.current = null; setRecovery(null); setError(null); setErrors({}); setNotice(useServer ? "최신 저장 내용으로 교체했습니다." : "허용된 명단의 입력을 유지했습니다. 내용을 확인한 뒤 저장하세요.");
    } finally { if (generation.current === scope) locked.current = false; }
  };
  const save = async (intent: "draft" | "submit") => {
    const currentData = dataRef.current;
    if (locked.current || !scopeVerified.current || loading || loadError || recoveryRef.current || notesHidden || !currentData?.canWrite || !focused.current || !isCurrentAccount()) return;
    if (intent === "draft" && currentData.entry?.submittedAt) return;
    const input = dailyReportSaveInput(currentData.selectedDate, valuesRef.current, currentData.entry?.version ?? 0, intent, currentData.youths);
    const fields = validateDailyReportInput(input, currentData.today);
    if (Object.keys(fields).length) { setErrors(fields); setError("입력 내용을 확인해 주세요."); return; }
    if (intent === "submit" && !currentData.recipients.length) { setError("보고를 받을 시설장이 등록되어 있지 않습니다. 임시저장은 가능합니다."); return; }
    const scope = generation.current; const operation = ++sequence.current;
    locked.current = true; attempt.current = input; setBusy(intent); setError(null); setErrors({}); setNotice(null);
    let saved = false;
    try {
      const response = await request<MobileDailyReportMutationResponse>("/daily-reports", { method: "POST", body: input });
      if (!active(scope, operation)) return;
      if (!isDailyReportMutation(response, input.workDate, currentData.entry?.id) || response.entry.authorId !== ownId || !dailyReportSavedMatches(response.entry, input)) throw new ApiError("저장 결과를 확인하지 못했습니다. 최신 보고를 확인하세요.", 200);
      dataRef.current = { ...currentData, entry: response.entry }; valuesRef.current = dailyReportValues(response.entry); setData(dataRef.current); setValues(valuesRef.current); attempt.current = null; setRecovery(null); setNotice(response.message); saved = true;
    } catch (cause) {
      if (!active(scope, operation)) return;
      setError(cause instanceof Error ? cause.message : "저장 결과를 확인하지 못했습니다. 최신 보고를 확인하세요.");
      setErrors(cause instanceof ApiError ? cause.fields ?? {} : {});
      if (cause instanceof ApiError && cause.status === 400 && cause.code === "ROSTER_CHANGED") {
        retained.current = valuesRef.current; setValues(previous => ({ mainContent: previous.mainContent, youthContents: {} })); setNotesHidden(true); setSearch(""); setExpanded({});
        setData(previous => previous ? { ...previous, youths: [], entry: previous.entry ? { ...previous.entry, youthReports: [] } : null } : null);
        setRecovery("roster"); attempt.current = null;
      } else if (cause instanceof ApiError && cause.status === 403 && cause.code === "NOT_ELIGIBLE") {
        if (dataRef.current) dataRef.current = { ...dataRef.current, canWrite: false }; setData(dataRef.current); attempt.current = null;
      } else if (cause instanceof ApiError && (cause.status === 404 || cause.status === 403)) {
        scopeVerified.current = false; setPrivacyPending(true); dataRef.current = null; setData(null); setValues({ mainContent: "", youthContents: {} }); attempt.current = null; retained.current = null; setRecovery(null);
      } else if (!(cause instanceof ApiError) || cause.status === 0 || cause.status === 409 || cause.status >= 500 || (cause.status >= 200 && cause.status < 300)) setRecovery("check");
      else attempt.current = null;
    } finally {
      if (generation.current === scope) locked.current = false;
      if (alive.current && generation.current === scope && isCurrentAccount()) setBusy(null);
      if (saved && focused.current && generation.current === scope && isCurrentAccount()) void latestLoad.current("refresh");
    }
  };
  const disabled = privacyPending || loading || !!busy || !!recovery || notesHidden || !data?.canWrite || !!loadError;
  const status = dailyReportStatus(data?.entry ?? null);
  const youths = privacyPending || notesHidden ? [] : (data?.youths ?? []).filter(youth => (!writtenOnly || values.youthContents[youth.id]?.trim()) && (!search.trim() || youth.name.toLocaleLowerCase("ko-KR").includes(search.trim().toLocaleLowerCase("ko-KR"))));
  const header = <View style={styles.header}>
    <ReportField name="workDate" label="보고일" value={dateInput} placeholder="YYYY-MM-DD" error={errors.workDate} disabled={loading || !!busy} maxLength={10} onChange={(_, value) => setDateInput(value)} />
    <View style={styles.actions}><TextAction label="날짜 조회" icon="search" disabled={loading || !!busy} onPress={() => void changeDate()} />{data ? <TextAction label="오늘" disabled={loading || !!busy} onPress={() => void changeDate(data.today)} /> : null}<TextAction label={loading ? "불러오는 중..." : "최신 보고 확인"} icon="refresh" disabled={loading || !!busy} onPress={() => void load(recovery ? "recover" : "refresh")} /></View>
    <AccountFeedback message={notice} /><AccountFeedback error={error ?? loadError} />
    {loading ? <View accessibilityRole="progressbar" accessibilityLabel="업무보고 불러오는 중" style={styles.actions}><ActivityIndicator color={theme.accent} /><Text style={[styles.small, { color: theme.secondary }]}>업무보고 불러오는 중...</Text></View> : null}
    {data && !privacyPending ? <>
      <View style={styles.meta}><Text style={[styles.status, { color: theme[status.tone] }]}>{status.label}</Text><Text style={[styles.small, { color: theme.secondary }]}>{formatDailyReportDate(data.selectedDate)} · {data.userName}</Text></View>
      {!data.canWrite ? <Text style={[styles.small, { color: theme.secondary }]}>현재 작성 자격이 없어 저장할 수 없습니다. 본인의 저장 내용은 확인할 수 있습니다.</Text> : null}
      <Text style={[styles.small, { color: theme.secondary }]}>수신: {data.recipients.join(", ") || "시설장 미등록 · 임시저장 가능"}</Text>
      {data.entry?.reviewedAt ? <Text style={[styles.small, { color: theme.secondary }]}>수정 제출하면 시설장에게 다시 미확인으로 표시됩니다.</Text> : null}
      {recovery === "check" ? <Text style={[styles.small, { color: theme.secondary }]}>저장 요청을 다시 보내지 않습니다. 최신 보고를 확인해 저장 여부와 내용을 비교하세요.</Text> : recovery === "roster" ? <Text style={[styles.small, { color: theme.secondary }]}>명단이 변경되어 청소년 입력을 숨겼습니다. 최신 명단을 확인한 뒤 허용된 입력만 복구합니다.</Text> : null}
      {recovery === "choose" ? <View style={[styles.compare, { backgroundColor: theme.surfaceMuted, borderColor: theme.border }]}>
        <Text accessibilityRole="header" aria-level={2} style={[styles.label, { color: theme.text }]}>서버에 저장된 주요 업무보고</Text><Text selectable style={[styles.body, { color: theme.text }]}>{data.entry?.mainContent || "저장된 내용 없음"}</Text>
        {!notesHidden ? data.entry?.youthReports.map(note => <View key={note.youthId} style={{ gap: 3 }}><Text style={[styles.label, { color: theme.text }]}>{note.youthName}</Text><Text selectable style={[styles.body, { color: theme.text }]}>{note.content}</Text></View>) : null}
        <View style={styles.actions}><TextAction label="내 입력으로 계속 작성" disabled={loading || !!busy || !data.canWrite} onPress={() => void choose(false)} /><TextAction label="서버 내용으로 교체" disabled={loading || !!busy} onPress={() => void choose(true)} /></View>
      </View> : null}
      <Text style={[styles.small, { color: theme.secondary }]}>제출 시 필수 · 임시저장은 빈 내용도 가능합니다.</Text>
      <ReportField name="mainContent" label="주요 업무보고" value={values.mainContent} error={errors.mainContent} disabled={disabled} multiline maxLength={dailyReportMainLimit} onChange={change} />
      <Text accessibilityRole="header" aria-level={2} style={[styles.sectionTitle, { color: theme.text }]}>청소년별 보고 <Text style={styles.small}>{notesHidden ? "명단 확인 필요" : `${youths.length}명`}</Text></Text>
      <Text style={[styles.small, { color: theme.secondary }]}>선택 사항입니다. 검색하거나 항목을 접어도 입력은 유지됩니다.</Text>
      <ReportField name="search" label="청소년 이름 검색" value={search} disabled={notesHidden || loading || !!busy} maxLength={200} onChange={(_, value) => setSearch(value)} />
      <TextAction label={writtenOnly ? "전체 명단 보기" : "작성한 기록만 보기"} accessibilityState={{ selected: writtenOnly }} disabled={notesHidden || loading || !!busy} onPress={() => setWrittenOnly(value => !value)} />
      {errors.youthReports ? <Text style={[styles.small, { color: theme.danger }]}>{errors.youthReports}</Text> : null}
    </> : null}
  </View>;
  const footer = <View style={styles.footer}>{data && !privacyPending ? <>
    {!notesHidden && !youths.length ? <Text style={[styles.small, { color: theme.secondary }]}>{search.trim() || writtenOnly ? "조건에 맞는 청소년이 없습니다." : "보고할 청소년이 없습니다."}</Text> : null}
    <TextAction label="일일 업무보고 목록" icon="arrow-back" disabled={!!busy} onPress={() => router.push("/daily-reports")} />
  </> : <TextAction label="일일 업무보고 목록" icon="arrow-back" onPress={() => router.push("/daily-reports")} />}</View>;
  return <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.background }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={insets.top + 56}>
    <FlatList style={{ flex: 1 }} data={youths} keyExtractor={item => item.id} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" extraData={{ values, expanded, disabled }} ListHeaderComponent={header} ListFooterComponent={footer}
      renderItem={({ item }) => <View style={[styles.youthRow, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <TextAction label={`${item.name}${values.youthContents[item.id]?.trim() ? " · 작성됨" : ""}`} icon={expanded[item.id] ? "chevron-up" : "chevron-down"} accessibilityLabel={`${item.name} 보고 ${expanded[item.id] ? "접기" : "펼치기"}`} accessibilityState={{ expanded: !!expanded[item.id] }} disabled={notesHidden || loading || !!busy} onPress={() => setExpanded(previous => ({ ...previous, [item.id]: !previous[item.id] }))} />
        {expanded[item.id] ? <ReportField name={`youth-${item.id}`} label={`${item.name} 보고`} value={values.youthContents[item.id] ?? ""} error={errors[`youth-${item.id}`]} disabled={disabled} multiline maxLength={dailyReportYouthLimit} onChange={change} /> : null}
      </View>} />
    {data && !privacyPending ? <View accessibilityLabel="업무보고 저장 및 제출" style={[styles.actionBar, { backgroundColor: theme.surface, borderColor: theme.border, paddingBottom: Math.max(8, insets.bottom) }]}>
      <View style={[styles.actions, styles.actionBarContent]}>{!data.entry?.submittedAt ? <TextAction label={busy === "draft" ? "저장 중..." : "임시저장"} disabled={disabled} onPress={() => void save("draft")} /> : null}
        <View style={{ flex: 1, minWidth: 0 }}><PrimaryButton title={busy === "submit" ? "제출 중..." : data.entry?.submittedAt ? "수정 제출" : "시설장에게 제출"} disabled={disabled || !data.recipients.length} onPress={() => void save("submit")} /></View>
      </View>
    </View> : null}
    {confirmation.dialog}
  </KeyboardAvoidingView>;
}
function ReportField({ name, label, value, onChange, multiline, error, disabled, maxLength, placeholder }: { name: string; label: string; value: string; onChange: (name: string, value: string) => void; multiline?: boolean; error?: string; disabled?: boolean; maxLength: number; placeholder?: string }) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  return <View style={styles.field}><View style={styles.fieldLabel}><Text style={[styles.label, { color: theme.text }]}>{label}</Text>{multiline ? <Text style={[styles.small, { color: theme.secondary }]}>{value.length.toLocaleString("ko-KR")} / {maxLength.toLocaleString("ko-KR")}</Text> : null}</View>
    <TextInput accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }} value={value} onChangeText={text => onChange(name, text)} multiline={multiline} editable={!disabled} maxLength={maxLength} placeholder={placeholder} placeholderTextColor={theme.secondary} autoCapitalize="none" autoCorrect={false} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} textAlignVertical={multiline ? "top" : "center"}
      style={[styles.input, { color: theme.text, backgroundColor: theme.surface, borderColor: focused ? theme.accent : error ? theme.danger : theme.muted }, multiline ? styles.multiline : null]} />
    {error ? <Text style={[styles.small, { color: theme.danger }]}>{error}</Text> : null}
  </View>;
}
const styles = StyleSheet.create({
  actionBar: { borderTopWidth: 1, paddingTop: 8, paddingHorizontal: 16 }, actionBarContent: { maxWidth: 720, width: "100%", alignSelf: "center" },
  content: { padding: 16, paddingBottom: 24, maxWidth: 720, width: "100%", alignSelf: "center" },
  header: { gap: 8 }, footer: { gap: 8, marginTop: 12 }, field: { gap: 4 }, fieldLabel: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 4 },
  label: { fontSize: 14, fontWeight: "700" }, small: { fontSize: 12, lineHeight: 18, fontVariant: ["tabular-nums"] }, body: { fontSize: 14, lineHeight: 21 },
  input: { minHeight: 44, borderWidth: 2, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 16, lineHeight: 23 }, multiline: { minHeight: 120 },
  sectionTitle: { fontSize: 17, fontWeight: "800", marginTop: 8 }, status: { fontSize: 13, fontWeight: "700" }, meta: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  actions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 }, youthRow: { borderWidth: 1, borderRadius: 8, marginTop: 8, padding: 8, gap: 6 }, compare: { padding: 10, borderWidth: 1, borderRadius: 8, gap: 8 },
});
