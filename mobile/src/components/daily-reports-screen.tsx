import { Stack, router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";
import { AccountFeedback } from "@/components/account-feedback";
import { EmptyState, TextAction } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { dailyReportStatus, formatDailyReportDate, isDailyReportDate } from "@/lib/daily-reports";
import { useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";
import type { MobileDailyReportDirectorRow, MobileDailyReportFilter, MobileDailyReportHistoryItem, MobileDailyReportListResponse, MobileDailyReportStatus } from "@/lib/types";

type ReportParams = { date?: string | string[]; filter?: string | string[]; q?: string | string[]; page?: string | string[] };
type ReportRow = { kind: "employee"; entry: MobileDailyReportHistoryItem } | { kind: "director"; entry: MobileDailyReportDirectorRow };
const filterOptions: { value: MobileDailyReportFilter; label: string }[] = [
  { value: "all", label: "전체" }, { value: "unread", label: "미확인" }, { value: "missing", label: "미제출" }, { value: "reviewed", label: "확인 완료" },
];
const statusLabels: Record<MobileDailyReportStatus, string> = { missing: "미작성", draft: "임시저장 · 미제출", submitted: "제출 완료", reviewed: "확인 완료" };

function reportListPath(params: ReportParams) {
  const query = new URLSearchParams();
  for (const key of ["date", "filter", "q", "page"] as const) {
    const value = params[key];
    if (Array.isArray(value)) for (const item of value.length ? value : [""]) query.append(key, item);
    else if (value !== undefined) query.set(key, value);
  }
  if (!query.has("page")) query.set("page", "1");
  return `/daily-reports?${query.toString()}`;
}

function isReportList(value: unknown, path?: string): value is MobileDailyReportListResponse {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  const count = (n: unknown) => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
  const date = (n: unknown) => typeof n === "string" && isDailyReportDate(n);
  const timestamp = (n: unknown) => n === null || typeof n === "string" && Number.isFinite(Date.parse(n));
  const id = (n: unknown) => typeof n === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(n);
  if (!date(item.today) || typeof item.userName !== "string" || typeof item.canWrite !== "boolean" ||
    !count(item.page) || item.page === 0 || !count(item.totalPages) || item.totalPages === 0 ||
    Number(item.page) > Number(item.totalPages) || !count(item.total)) return false;
  if (item.mode === "employee") return item.pageSize === 15 && typeof item.todayStatus === "string" && Object.hasOwn(statusLabels, item.todayStatus) &&
    Array.isArray(item.history) && item.history.length <= 15 && item.history.every(entry => !!entry && typeof entry === "object" && id(entry.id) && date(entry.workDate) && timestamp(entry.submittedAt) && timestamp(entry.reviewedAt));
  if (item.mode !== "director" || item.canWrite !== false || item.pageSize !== 20 || !date(item.selectedDate) ||
    !filterOptions.some(option => option.value === item.filter) || typeof item.q !== "string" || item.q.length > 200 ||
    !item.counts || typeof item.counts !== "object" || !Array.isArray(item.rows) || item.rows.length > 20) return false;
  if (String(item.selectedDate) > String(item.today)) return false;
  const requestedDates = new URLSearchParams(path?.split("?")[1] ?? "").getAll("date");
  if (requestedDates.length > 1 || requestedDates.length === 1 && requestedDates[0] !== item.selectedDate) return false;
  const counts = item.counts as Record<string, unknown>;
  if (![counts.staff, counts.submitted, counts.missing, counts.unreviewed].every(count) ||
    Number(counts.submitted) + Number(counts.missing) !== counts.staff || Number(counts.unreviewed) > Number(counts.submitted)) return false;
  return item.rows.every(row => {
    if (!row || typeof row !== "object" || !row.staff || typeof row.staff !== "object" || !id(row.staff.id) || typeof row.staff.name !== "string" || typeof row.staff.departmentName !== "string") return false;
    const report = row.report;
    return report === null || !!report && typeof report === "object" && id(report.id) && date(report.workDate) && report.workDate === item.selectedDate &&
      count(report.version) && report.version > 0 && typeof report.submittedAt === "string" && timestamp(report.submittedAt) && timestamp(report.reviewedAt) && typeof report.updatedAt === "string" && timestamp(report.updatedAt);
  });
}

export function DailyReportsScreen() {
  const { token } = useSession();
  const params = useLocalSearchParams<ReportParams>();
  return <DailyReportsContent key={token} path={reportListPath(params)} />;
}

function DailyReportsContent({ path }: { path: string }) {
  const theme = useTheme();
  const { request } = useSession();
  const [result, setResult] = useState<{ path: string; data: MobileDailyReportListResponse } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invalidQuery, setInvalidQuery] = useState(false);
  const [showConditions, setShowConditions] = useState(false);
  const [dateInput, setDateInput] = useState("");
  const [queryInput, setQueryInput] = useState("");
  const [queryError, setQueryError] = useState<string | null>(null);
  const sequence = useRef(0);
  const focused = useRef(false);
  const list = useRef<FlatList<ReportRow>>(null);
  const data = result?.path === path ? result.data : null;
  const selectedDate = data?.mode === "director" ? data.selectedDate : "";
  const selectedQuery = data?.mode === "director" ? data.q : "";

  const load = useCallback(async (refresh = false) => {
    if (!focused.current) return;
    const id = ++sequence.current;
    setLoading(true); setRefreshing(refresh); setError(null); setInvalidQuery(false);
    try {
      const response = await request<unknown>(path);
      if (id !== sequence.current || !focused.current) return;
      if (!isReportList(response, path)) throw new ApiError("업무보고 목록 응답을 확인하지 못했습니다. 다시 불러오세요.", 200);
      setResult({ path, data: response });
    } catch (cause) {
      if (id !== sequence.current || !focused.current) return;
      if (cause instanceof ApiError && (cause.status >= 200 && cause.status < 300 || cause.status >= 400 && cause.status < 500)) setResult(null);
      setInvalidQuery(cause instanceof ApiError && cause.status === 400);
      setError(cause instanceof Error ? cause.message : "업무보고를 불러오지 못했습니다. 다시 시도하세요.");
    } finally {
      if (id === sequence.current && focused.current) { setLoading(false); setRefreshing(false); }
    }
  }, [path, request]);
  useFocusEffect(useCallback(() => {
    focused.current = true; setResult(null); setShowConditions(false); setQueryError(null); void load();
    return () => { focused.current = false; sequence.current++; };
  }, [load]));
  useEffect(() => { list.current?.scrollToOffset({ offset: 0, animated: false }); }, [path]);

  const applyConditions = () => {
    if (loading || data?.mode !== "director") return;
    if (!isDailyReportDate(dateInput) || dateInput > data.today) { setQueryError("오늘 또는 이전의 유효한 보고 날짜를 입력하세요."); return; }
    if (queryInput.trim().length > 200) { setQueryError("검색어는 200자 이내로 입력하세요."); return; }
    setQueryError(null); setShowConditions(false);
    router.setParams({ date: dateInput, q: queryInput.trim(), page: "1" });
  };
  const rows: ReportRow[] = data?.mode === "employee" ? data.history.map(entry => ({ kind: "employee", entry })) :
    data?.mode === "director" ? data.rows.map(entry => ({ kind: "director", entry })) : [];

  const header = <>
    {data?.mode === "employee" ? <EmployeeToday today={data.today} status={data.todayStatus} canWrite={data.canWrite} disabled={loading} /> :
      <View style={styles.summaryRow}>
        <ReportMetric label="제출 / 대상" value={data?.mode === "director" ? `${data.counts.submitted.toLocaleString("ko-KR")} / ${data.counts.staff.toLocaleString("ko-KR")}` : "—"} />
        <ReportMetric label="미확인 / 미제출" value={data?.mode === "director" ? `${data.counts.unreviewed.toLocaleString("ko-KR")} / ${data.counts.missing.toLocaleString("ko-KR")}` : "—"} accent={data?.mode === "director" && data.counts.unreviewed > 0} />
      </View>}
    {data?.mode === "director" ? <>
      {showConditions ? <View style={[styles.conditions, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <ReportInput label="보고 날짜" value={dateInput} onChange={value => { setDateInput(value); setQueryError(null); }} disabled={loading} date invalid={!!queryError && !isDailyReportDate(dateInput)} />
          <TextAction label="오늘" disabled={loading} onPress={() => { setDateInput(data.today); setQueryError(null); }} />
        </View>
        <ReportInput label="직원·보고 내용 검색" value={queryInput} onChange={value => { setQueryInput(value); setQueryError(null); }} disabled={loading} />
        <View style={{ flexDirection: "row", justifyContent: "flex-end" }}><TextAction label="조건 적용" icon="search" disabled={loading} onPress={applyConditions} /></View>
      </View> : null}
      <View style={styles.filters}>
        {filterOptions.map(option => <ReportFilter key={option.value} label={option.label} selected={data.filter === option.value} disabled={loading} onPress={() => router.setParams({ filter: option.value, page: "1" })} />)}
        <Text style={[styles.meta, { color: theme.secondary }]}>{data.selectedDate} · {data.total.toLocaleString("ko-KR")}명 · {data.page}/{data.totalPages}</Text>
      </View>
    </> : data?.mode === "employee" ? <View style={styles.archiveHeader}>
      <Text accessibilityRole="header" aria-level={2} style={{ color: theme.text, fontSize: 15, fontWeight: "800" }}>내 보관함</Text>
      <Text style={[styles.meta, { color: theme.secondary }]}>{data.total.toLocaleString("ko-KR")}건 · {data.page}/{data.totalPages}</Text>
    </View> : null}
    <AccountFeedback error={queryError || error} />
    {error ? <View style={{ alignItems: "flex-start", marginBottom: 4 }}><TextAction label={invalidQuery ? "조회 조건 초기화" : "다시 불러오기"} icon="refresh" disabled={loading} onPress={() => invalidQuery ? router.replace("/daily-reports") : void load(true)} /></View> : null}
    {loading && data ? <Text accessibilityLiveRegion="polite" style={{ color: theme.secondary, fontSize: 12, marginBottom: 4 }}>업무보고 현황을 갱신하는 중…</Text> : null}
  </>;

  return <View style={{ flex: 1, backgroundColor: theme.background }}>
    <Stack.Screen options={{ headerRight: () => <View style={{ flexDirection: "row", alignItems: "center" }}>
      {data?.mode === "director" ? <TextAction label="" icon={showConditions ? "close" : "options"} accessibilityLabel={showConditions ? "조회 조건 닫기" : "업무보고 조회 조건"} disabled={loading} onPress={() => { if (!showConditions) { setDateInput(selectedDate); setQueryInput(selectedQuery); } setShowConditions(value => !value); setQueryError(null); }} /> : null}
      <TextAction label="" icon="refresh" accessibilityLabel="업무보고 새로고침" disabled={loading} onPress={() => void load(true)} />
      {data?.mode === "employee" && data.canWrite ? <TextAction label="작성" icon="create-outline" accessibilityLabel="오늘 업무보고 작성" disabled={loading} onPress={() => router.push({ pathname: "/daily-reports/edit", params: { date: data.today } })} /> : null}
    </View> }} />
    <FlatList ref={list} role="list" accessibilityLabel={data?.mode === "director" ? "직원 업무보고 현황" : "내 업무보고 보관함"} data={rows}
      keyExtractor={row => row.kind === "employee" ? row.entry.id : row.entry.staff.id} contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={theme.accent} />}
      ListHeaderComponent={header} renderItem={({ item }) => <DailyReportRow row={item} disabled={loading} />}
      ListEmptyComponent={loading || !data && !error ? <ReportListLoading /> : error && !data ? null : <EmptyState title={data?.mode === "director" ? "조건에 맞는 직원이 없습니다" : "보관된 업무보고가 없습니다"}
        detail={data?.mode === "director" ? "조회 조건을 바꾸어 보고 현황을 확인하세요." : data?.canWrite ? "작성 버튼으로 오늘 업무보고를 시작하세요." : "본인의 기존 업무보고를 이곳에서 확인할 수 있습니다."} />}
      ListFooterComponent={data && data.totalPages > 1 ? <View style={styles.pager}>
        <TextAction label="이전" icon="chevron-back" disabled={loading || data.page <= 1} onPress={() => router.setParams({ page: String(data.page - 1) })} />
        <Text style={{ color: theme.secondary, fontSize: 13, fontVariant: ["tabular-nums"] }}>{data.page} / {data.totalPages}</Text>
        <TextAction label="다음" icon="chevron-forward" disabled={loading || data.page >= data.totalPages} onPress={() => router.setParams({ page: String(data.page + 1) })} />
      </View> : null} />
  </View>;
}

function ReportMetric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  const theme = useTheme();
  return <View style={[styles.metric, { backgroundColor: theme.surface, borderColor: theme.border }]}>
    <Text style={{ color: theme.secondary, fontSize: 12 }}>{label}</Text><Text style={[styles.count, { color: accent ? theme.accent : theme.text }]}>{value}</Text>
  </View>;
}

function EmployeeToday({ today, status, canWrite, disabled }: { today: string; status: MobileDailyReportStatus; canWrite: boolean; disabled: boolean }) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  return <Pressable accessibilityRole={canWrite ? "link" : undefined} accessibilityLabel={`오늘 ${formatDailyReportDate(today)} 업무보고, ${statusLabels[status]}${canWrite ? ", 작성 또는 수정" : ""}`} disabled={!canWrite || disabled}
    onPress={() => router.push({ pathname: "/daily-reports/edit", params: { date: today } })} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
    style={({ pressed }) => [styles.employeeToday, { borderColor: focused ? theme.accent : theme.border, backgroundColor: pressed || focused ? theme.accentSoft : theme.surface }]}>
    <Text style={{ color: theme.secondary, fontSize: 12 }}>오늘 보고 · {formatDailyReportDate(today)}</Text>
    <Text style={{ color: status === "reviewed" ? theme.success : theme.text, fontSize: 17, fontWeight: "800", marginTop: 3 }}>{statusLabels[status]}{canWrite ? "  ›" : ""}</Text>
  </Pressable>;
}

function DailyReportRow({ row, disabled }: { row: ReportRow; disabled: boolean }) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const report = row.kind === "employee" ? row.entry : row.entry.report;
  const state = dailyReportStatus(report);
  const reportId = report?.id;
  const reportLabel = row.kind === "director" && state.value === "submitted" ? "미확인" : state.label;
  const label = row.kind === "employee" ? `${formatDailyReportDate(row.entry.workDate)}, ${state.label}, 보고서 보기` : `${row.entry.staff.name}, ${row.entry.staff.departmentName}, ${report ? reportLabel : "미제출"}${report ? ", 보고서 보기" : ""}`;
  const body = <>
    <Text numberOfLines={2} style={{ color: theme.text, fontSize: 15, lineHeight: 21, fontWeight: state.value === "submitted" ? "800" : "600" }}>
      {row.kind === "employee" ? formatDailyReportDate(row.entry.workDate) : row.entry.staff.name}
    </Text>
    {row.kind === "director" ? <Text numberOfLines={1} style={{ color: theme.secondary, fontSize: 12, marginTop: 3 }}>{row.entry.staff.departmentName}</Text> : null}
    <Text style={{ color: state.value === "reviewed" ? theme.success : state.value === "submitted" ? theme.accent : theme.secondary, fontSize: 12, marginTop: 4 }}>{report ? reportLabel : "미제출"}</Text>
  </>;
  return <View role="listitem" style={{ backgroundColor: theme.surface, borderBottomWidth: 1, borderColor: theme.border }}>
    {reportId ? <Pressable accessibilityRole="link" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled}
      onPress={() => router.push({ pathname: "/daily-reports/[id]", params: { id: reportId } })} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      style={({ pressed }) => [styles.row, { borderColor: focused ? theme.accent : "transparent", backgroundColor: pressed || focused ? theme.accentSoft : "transparent" }]}>{body}</Pressable> :
      <View accessible accessibilityLabel={label} style={[styles.row, { borderColor: "transparent" }]}>{body}</View>}
  </View>;
}

function ReportFilter({ label, selected, disabled, onPress }: { label: string; selected: boolean; disabled: boolean; onPress: () => void }) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  return <Pressable accessibilityRole="button" accessibilityState={{ selected, disabled }} disabled={disabled} onPress={onPress} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
    style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 8, borderRadius: 8, borderWidth: 2, borderColor: focused ? theme.accent : "transparent", backgroundColor: selected || pressed ? theme.accentSoft : "transparent", alignItems: "center", justifyContent: "center", opacity: disabled ? 0.45 : 1 })}>
    <Text style={{ color: selected ? theme.accent : theme.secondary, fontSize: 14, fontWeight: selected ? "800" : "600" }}>{label}</Text>
  </Pressable>;
}

function ReportInput({ label, value, onChange, disabled, date = false, invalid = false }: { label: string; value: string; onChange: (value: string) => void; disabled: boolean; date?: boolean; invalid?: boolean }) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  return <TextInput accessibilityLabel={label} placeholder={date ? "YYYY-MM-DD" : label} placeholderTextColor={theme.muted} value={value} editable={!disabled} onChangeText={onChange}
    autoCapitalize="none" autoCorrect={false} maxLength={date ? 10 : 200} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
    style={{ flex: 1, minWidth: 0, minHeight: 44, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, color: theme.text, backgroundColor: theme.surface, borderColor: invalid ? theme.danger : focused ? theme.accent : theme.muted, fontSize: 14 }} />;
}

function ReportListLoading() {
  const theme = useTheme();
  return <View accessibilityRole="progressbar" accessibilityLabel="업무보고 불러오는 중">
    {[0, 1, 2].map(key => <View key={key} style={[styles.skeleton, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={{ width: "60%", height: 17, backgroundColor: theme.surfaceMuted }} /><View style={{ width: "40%", height: 12, marginTop: 8, backgroundColor: theme.surfaceMuted }} />
    </View>)}
  </View>;
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24, maxWidth: 720, width: "100%", alignSelf: "center" },
  summaryRow: { flexDirection: "row", gap: 8, marginBottom: 4 },
  metric: { flex: 1, minWidth: 0, minHeight: 64, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  count: { fontSize: 22, fontWeight: "800", marginTop: 2, fontVariant: ["tabular-nums"] },
  employeeToday: { minHeight: 64, borderWidth: 2, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 4 },
  archiveHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 28, marginBottom: 4 },
  filters: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", marginBottom: 4 },
  meta: { fontSize: 12, paddingHorizontal: 4, fontVariant: ["tabular-nums"] },
  conditions: { borderWidth: 1, padding: 8, borderRadius: 10, gap: 8, marginTop: 4, marginBottom: 4 },
  row: { minHeight: 72, borderWidth: 2, paddingHorizontal: 10, paddingVertical: 8, justifyContent: "center" },
  skeleton: { minHeight: 72, padding: 12, borderBottomWidth: 1 },
  pager: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10 },
});
