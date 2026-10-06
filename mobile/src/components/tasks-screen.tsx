import { Stack, router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, View, useWindowDimensions } from "react-native";
import { Feather } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { DetailText as Text } from "@/components/document-detail-ui";
import { focusAccountNotice } from "@/components/account-feedback";
import { ApiError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { formatTaskDueDate, normalizeTaskStatus, taskPage, taskState, taskStatusOptions } from "@/lib/tasks";
import { useHomeTheme } from "@/lib/home-theme";
import type { MobileStaffTaskItem, MobileStaffTaskMutationResponse, MobileStaffTasksResponse, MobileStaffTaskStatus } from "@/lib/types";

type Completion = { task: MobileStaffTaskItem; completed: boolean };

export function TasksScreen() {
  const { token } = useSession();
  const params = useLocalSearchParams<{ status?: string; page?: string }>();
  return <TasksContent key={token} status={normalizeTaskStatus(params.status)} page={taskPage(params.page)} />;
}

function TasksContent({ status, page }: { status: MobileStaffTaskStatus; page: number }) {
  const theme = useHomeTheme();
  const { bottom } = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  const large = fontScale >= 1.3 || width < 320;
  const { request } = useSession();
  const path = `/tasks?status=${status}&page=${page}`;
  const [result, setResult] = useState<{ path: string; data: MobileStaffTasksResponse } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ path: string; text: string } | null>(null);
  const [operation, setOperation] = useState<Completion | null>(null);
  const [failedOperation, setFailedOperation] = useState<Completion | null>(null);
  const [conflict, setConflict] = useState(false);
  const [needsReload, setNeedsReload] = useState(false);
  const list = useRef<FlatList<MobileStaffTaskItem>>(null);
  const summary = useRef<View>(null);
  const sequence = useRef(0);
  const focused = useRef(false);
  const mounted = useRef(true);
  const mutation = useRef(false);
  const verified = useRef<string | null>(null);
  const fetching = useRef<{ id: number; path: string } | null>(null);
  const latestLoad = useRef<(refresh?: boolean) => Promise<void>>(async () => undefined);
  const data = result?.path === path ? result.data : null;
  const message = notice?.path === path ? notice.text : null;
  const busy = operation !== null;

  const load = useCallback(async (refresh = false) => {
    if (!focused.current || mutation.current || fetching.current?.path === path) return;
    const id = ++sequence.current;
    fetching.current = { id, path };
    verified.current = null;
    setLoading(true); setRefreshing(refresh); setError(null); setFailedOperation(null);
    try {
      const response = await request<MobileStaffTasksResponse>(path);
      if (id !== sequence.current || !focused.current) return;
      verified.current = path;
      setResult({ path, data: response }); setConflict(false); setNeedsReload(false);
    } catch (cause) {
      if (id === sequence.current && focused.current) {
        // A revoked or missing own-task list must not leave private cached rows visible.
        if (cause instanceof ApiError && (cause.status === 403 || cause.status === 404)) {
          setResult(null);
          setNotice(null);
        }
        setError(cause instanceof Error ? cause.message : "할 일을 불러오지 못했습니다. 다시 시도하세요.");
      }
    } finally {
      if (fetching.current?.id === id) fetching.current = null;
      if (id === sequence.current && focused.current) { setLoading(false); setRefreshing(false); }
    }
  }, [path, request]);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { latestLoad.current = load; }, [load]);
  useFocusEffect(useCallback(() => {
    focused.current = true;
    // Recheck the current assignee before showing cached rows after returning from detail.
    setResult(null);
    void load();
    return () => { focused.current = false; verified.current = null; fetching.current = null; sequence.current++; };
  }, [load]));
  useEffect(() => { list.current?.scrollToOffset({ offset: 0, animated: false }); }, [path]);
  useEffect(() => { if (message) focusAccountNotice(summary.current); }, [message]);

  const run = async (next: Completion) => {
    if (mutation.current || !focused.current || conflict || verified.current !== path) return;
    mutation.current = true;
    const id = ++sequence.current;
    setOperation(next); setError(null); setNotice(null); setFailedOperation(null); setLoading(false); setRefreshing(false);
    try {
      const response = await request<MobileStaffTaskMutationResponse>(`/tasks/${encodeURIComponent(next.task.id)}/completion`, {
        method: "POST", body: { completed: next.completed, version: next.task.version },
      });
      if (id !== sequence.current || !focused.current) return;
      if (response.ok !== true || response.task?.id !== next.task.id) throw new ApiError("처리 결과를 확인하지 못했습니다. 최신 목록을 확인하세요.", 200);
      // Use only the confirmed server version; the subsequent list fetch updates counts and ordering.
      setResult(previous => !previous || previous.path !== path ? previous : {
        path, data: { ...previous.data, tasks: previous.data.tasks.map(item => item.id === response.task.id ? response.task : item) },
      });
      verified.current = null;
      setNeedsReload(true);
      setNotice({ path, text: response.message });
    } catch (cause) {
      if (id === sequence.current && focused.current) {
        const changed = cause instanceof ApiError && (cause.status === 409 || cause.status === 404 || cause.status === 403 || cause.status >= 200 && cause.status < 300);
        if (changed) verified.current = null;
        setConflict(changed);
        if (cause instanceof ApiError && (cause.status === 404 || cause.status === 403)) setResult(null);
        setError(changed ? `${cause.message} 최신 목록을 불러온 뒤 다시 선택하세요.` : cause instanceof Error ? cause.message : "상태를 변경하지 못했습니다. 다시 시도하세요.");
        if (!changed) setFailedOperation(next);
      }
      return;
    } finally {
      mutation.current = false;
      if (mounted.current) setOperation(null);
      if (focused.current && id !== sequence.current) void latestLoad.current();
    }
    if (focused.current) await latestLoad.current();
  };

  const rows = data?.tasks.filter(item => status === "deleted" ? !!item.deletedAt : !item.deletedAt && (status === "completed" ? !!item.completedAt : status === "all" ? true : !item.completedAt && (status !== "overdue" || !!item.dueDate && item.dueDate < data.today))) ?? [];
  const writesLocked = busy || conflict || loading || needsReload || !!error && !failedOperation;
  const label = taskStatusOptions.find(option => option.value === status)!.label;
  const create = () => router.push("/tasks/new");
  const header = <View style={{ gap: 12, marginBottom: 12 }}>
    <View ref={summary} accessible tabIndex={-1} style={[styles.summaryRow, large && { flexDirection: "column" }]}>
      {[false, true].map(overdue => <View key={String(overdue)} style={[styles.metric, large && { flex: undefined, flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 1, minWidth: 0, flexBasis: large ? 80 : undefined, flexGrow: large ? 1 : undefined }}>
          {overdue && !!data?.counts.overdue ? <Feather name="alert-triangle" size={14} color={theme.danger} accessible={false} aria-hidden /> : null}
          <Text style={{ color: overdue && data?.counts.overdue ? theme.danger : theme.secondary, fontSize: 13, lineHeight: 18, flexShrink: 1 }}>{overdue ? <>기한 초과 <Text style={{ color: theme.secondary }}>· 미완료 중</Text></> : "미완료"}</Text>
        </View>
        <Text style={[styles.count, { color: overdue && data?.counts.overdue ? theme.danger : theme.text }]}>{data && !needsReload ? `${(overdue ? data.counts.overdue : data.counts.pending).toLocaleString("ko-KR")}건` : "—"}</Text>
      </View>)}
    </View>
    <View accessibilityLabel="상태 선택" style={[styles.filters, { backgroundColor: theme.surfaceMuted, borderColor: theme.controlBorder }]}>
      {taskStatusOptions.map(option => <TaskFilter key={option.value} label={option.label} selected={status === option.value} disabled={busy}
        onPress={() => router.setParams({ status: option.value, page: "1" })} />)}
    </View>
    <View style={styles.listline}>
      <Text role="heading" aria-level={2} style={{ color: theme.text, fontSize: 15, lineHeight: 21, fontWeight: "700" }}>{label} {data && !needsReload ? data.total.toLocaleString("ko-KR") : "—"}건</Text>
      {loading || busy || needsReload || error ? <Text accessibilityLiveRegion="polite" style={{ color: theme.secondary, fontSize: 12, lineHeight: 18, flexShrink: 1 }}>{busy ? "처리 중" : loading ? data ? "갱신 중" : "불러오는 중" : "최신 목록 확인 필요"}</Text> : null}
      <Text style={{ color: theme.secondary, fontSize: 13, lineHeight: 20, marginLeft: "auto", fontVariant: ["tabular-nums"] }}>{data ? `${data.page.toLocaleString("ko-KR")} / ${data.totalPages.toLocaleString("ko-KR")}쪽` : "— / —쪽"}</Text>
    </View>
    {message ? <TaskFeedback message={message} /> : null}
    {error ? <TaskFeedback error={error} conflict={conflict} cached={!!data} writeFailure={!!failedOperation} disabled={busy || loading}
      onRetry={() => failedOperation ? void run(failedOperation) : void load(true)} /> : null}
  </View>;

  return <SafeAreaView edges={["top", "left", "right"]} style={{ flex: 1, backgroundColor: theme.surface }}>
    <Stack.Screen options={{ headerShown: false }} />
    <View style={{ borderBottomWidth: 1, borderBottomColor: theme.border }}>
      <View style={styles.heading}>
        <TaskAction label="뒤로" icon="chevron-left" iconOnly onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)")} />
        <Text role="heading" aria-level={1} style={{ flexGrow: 1, flexShrink: 1, flexBasis: large ? "70%" : 0, minWidth: 0, color: theme.text, fontSize: 17, lineHeight: 23, fontWeight: "700" }}>내 할 일</Text>
        <View style={{ marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 4 }}>
        <TaskAction label="할 일 새로고침" icon="refresh-cw" iconOnly disabled={busy || loading} onPress={() => void load(true)} />
        <TaskAction label="등록" icon="plus" primary accessibilityLabel="새 할 일 등록" disabled={busy} onPress={create} />
        </View>
      </View>
    </View>
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <FlatList ref={list} role="list" accessibilityLabel="내 할 일 목록" data={rows} keyExtractor={item => item.id} extraData={{ operation, conflict, writesLocked }}
        contentContainerStyle={[styles.content, { paddingBottom: 24 + bottom }]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={theme.accent} />}
        ListHeaderComponent={header} renderItem={({ item, index }) => <TaskRow item={item} today={data?.today ?? ""} disabled={writesLocked} openDisabled={busy || conflict}
          first={index === 0} last={index === rows.length - 1} pending={operation?.task.id === item.id}
          open={() => router.push({ pathname: "/tasks/[id]", params: { id: item.id } })} complete={() => void run({ task: item, completed: !item.completedAt })} />}
        ListEmptyComponent={loading || busy ? <TasksLoading /> : error ? null : <TaskEmpty status={status} onCreate={create} />}
        ListFooterComponent={data && data.totalPages > 1 ? <View style={styles.pager}>
          <View style={{ flex: 1 }}><TaskAction label="이전" icon="chevron-left" disabled={busy || loading || data.page <= 1} onPress={() => router.setParams({ page: String(data.page - 1) })} /></View>
          <View style={{ flex: 1 }}><TaskAction label="다음" icon="chevron-right" disabled={busy || loading || data.page >= data.totalPages} onPress={() => router.setParams({ page: String(data.page + 1) })} /></View>
        </View> : null} />
    </View>
  </SafeAreaView>;
}

function TaskAction({ label, accessibilityLabel, icon, iconOnly, primary, textOnly, disabled, pending, onPress }: {
  label: string; accessibilityLabel?: string; icon?: keyof typeof Feather.glyphMap; iconOnly?: boolean; primary?: boolean; textOnly?: boolean;
  disabled?: boolean; pending?: boolean; onPress: () => void;
}) {
  const theme = useHomeTheme(), [focus, setFocus] = useState(false);
  const color = primary && !disabled ? "#FFFFFF" : textOnly ? theme.accent : disabled ? theme.secondary : theme.text;
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityState={{ disabled: !!disabled, busy: !!pending }} disabled={disabled}
    onFocus={() => setFocus(true)} onBlur={() => setFocus(false)} onPress={onPress}
    style={({ pressed }) => [styles.action, iconOnly && { width: 44, paddingHorizontal: 0 }, { borderColor: focus ? theme.accent : iconOnly || textOnly ? "transparent" : primary && !disabled ? theme.actionFill : theme.controlBorder,
      backgroundColor: primary && !disabled ? theme.actionFill : iconOnly || textOnly ? "transparent" : pending ? theme.surfaceMuted : theme.surface, opacity: pressed && !disabled ? .8 : 1 }]}>
    {icon ? <Feather name={icon} size={iconOnly ? 22 : 16} color={color} accessible={false} aria-hidden /> : null}
    {!iconOnly ? <Text style={{ color, fontSize: 14, lineHeight: 19, fontWeight: "700", textAlign: "center", flexShrink: 1 }}>{label}</Text> : null}
  </Pressable>;
}

function TaskFilter({ label, selected, disabled, onPress }: { label: string; selected: boolean; disabled: boolean; onPress: () => void }) {
  const theme = useHomeTheme(), [focus, setFocus] = useState(false);
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected, disabled }} aria-pressed={selected} disabled={disabled}
    onPress={onPress} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
    style={({ pressed }) => [styles.filter, { borderColor: selected || focus ? theme.accent : "transparent", backgroundColor: selected ? theme.surface : pressed ? theme.accentSoft : "transparent" }]}>
    <Text style={{ color: selected ? theme.text : theme.secondary, fontSize: 14, lineHeight: 19, fontWeight: selected ? "700" : "500", textAlign: "center" }}>{label}</Text>
  </Pressable>;
}

function TaskRow({ item, today, disabled, openDisabled, pending, first, last, open, complete }: {
  item: MobileStaffTaskItem; today: string; disabled: boolean; openDisabled: boolean; pending: boolean; first: boolean; last: boolean; open: () => void; complete: () => void;
}) {
  const theme = useHomeTheme(), [focus, setFocus] = useState(false);
  const { width, fontScale } = useWindowDimensions();
  const stacked = fontScale >= 1.3 || width < 320;
  const state = taskState(item, today);
  const color = state.tone === "danger" ? theme.danger : state.tone === "accent" ? theme.accent : theme.secondary;
  const due = formatTaskDueDate(item.dueDate).replace(/^기한 (\d{4}-\d{2}-\d{2})$/, "$1까지");
  const icon = state.kind === "overdue" ? "alert-triangle" : state.kind === "dueToday" ? "clock" : state.kind === "completed" ? "check" : state.kind === "deleted" ? "trash-2" : "calendar";
  return <View style={{ width: "100%", borderColor: theme.border, borderLeftWidth: 1, borderRightWidth: 1, borderTopWidth: 1, borderBottomWidth: last ? 1 : 0,
    borderTopLeftRadius: first ? 16 : 0, borderTopRightRadius: first ? 16 : 0, borderBottomLeftRadius: last ? 16 : 0, borderBottomRightRadius: last ? 16 : 0,
    overflow: "hidden", backgroundColor: theme.surface, flexDirection: stacked ? "column" : "row", alignItems: "stretch" }}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${item.title}, ${state.label}, ${due}${item.meetingTitle ? `, 회의 ${item.meetingTitle}` : ""}, 상세 보기`}
      accessibilityState={{ disabled: openDisabled }} disabled={openDisabled} onPress={open} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
      style={({ pressed }) => [styles.task, stacked && { flex: undefined, minHeight: 44, paddingBottom: 8 }, { borderColor: focus ? theme.accent : "transparent", backgroundColor: pressed || focus ? theme.surfaceMuted : "transparent" }]}>
      <View accessible={false} aria-hidden style={{ gap: 3 }}>
        <Text numberOfLines={2} style={{ color: item.completedAt || item.deletedAt ? theme.secondary : theme.text, fontSize: 15, lineHeight: 21, fontWeight: item.completedAt || item.deletedAt ? "500" : "700" }}>{item.title}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Feather name={icon} size={14} color={color} accessible={false} aria-hidden />
          <View style={{ flex: 1, minWidth: 0, flexDirection: "row", flexWrap: "wrap", columnGap: 4 }}>
            <Text style={{ color, fontSize: 13, lineHeight: 20, fontWeight: state.tone !== "neutral" ? "700" : "400" }}>{state.kind === "dueToday" ? "오늘 기한" : state.label} ·</Text>
            <Text style={{ color, fontSize: 13, lineHeight: 20, fontWeight: state.tone !== "neutral" ? "700" : "400", flexShrink: 0, fontVariant: ["tabular-nums"] }}>{due}</Text>
          </View>
        </View>
        {item.meetingTitle ? <Text numberOfLines={1} style={{ color: theme.secondary, fontSize: 12, lineHeight: 18 }}>회의 · {item.meetingTitle}</Text> : null}
      </View>
    </Pressable>
    {!item.deletedAt ? <View style={[{ justifyContent: "center", paddingRight: 12 }, stacked && { alignItems: "flex-start", paddingLeft: 14, paddingBottom: 12 }]}>
      <TaskAction label={pending ? "처리 중" : item.completedAt ? "완료 취소" : "완료"} icon={pending ? "loader" : item.completedAt ? "corner-up-left" : "check-circle"}
        accessibilityLabel={`${item.title}, ${item.completedAt ? "완료 취소" : "완료 처리"}`} disabled={disabled} pending={pending} onPress={complete} />
    </View> : null}
  </View>;
}

function TaskFeedback({ error, message, conflict, cached, writeFailure, disabled, onRetry }: {
  error?: string | null; message?: string | null; conflict?: boolean; cached?: boolean; writeFailure?: boolean; disabled?: boolean; onRetry?: () => void;
}) {
  const theme = useHomeTheme(), notice = useRef<View>(null);
  useEffect(() => { if (error || message) focusAccountNotice(notice.current); }, [error, message]);
  const compact = cached && !conflict;
  return <View ref={notice} tabIndex={-1} accessibilityRole={error ? "alert" : undefined} accessibilityLiveRegion={error ? undefined : "polite"}
    style={[styles.feedback, { borderColor: error ? compact || conflict ? theme.danger : theme.border : theme.success, backgroundColor: error ? theme.surface : theme.successSoft }, compact && { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 4, paddingVertical: 8 }]}>
    <View style={{ flexDirection: "row", gap: 8, flex: compact ? 1 : undefined, minWidth: 0, alignItems: "flex-start", flexBasis: compact ? 190 : undefined }}>
      {!compact ? <Feather name={error ? "alert-circle" : "check-circle"} size={error ? 22 : 18} color={error ? theme.danger : theme.success} accessible={false} aria-hidden style={{ marginTop: 2 }} /> : null}
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        {error && !compact ? <Text style={{ color: theme.text, fontSize: conflict ? 15 : 16, lineHeight: 23, fontWeight: "700" }}>{conflict ? "할 일이 변경되어 확인이 필요해요" : "할 일을 불러오지 못했어요"}</Text> : null}
        <Text style={{ color: error ? theme.secondary : theme.text, fontSize: message ? 14 : 13, lineHeight: message ? 21 : 20 }}>{compact ? <Text style={{ color: theme.danger, fontWeight: "700" }}>{writeFailure ? "완료 처리 실패" : "최근 조회 실패"} · </Text> : null}{error ?? message}</Text>
      </View>
    </View>
    {onRetry ? <TaskAction label={conflict ? "최신 목록 불러오기" : "다시 시도"} icon={compact ? undefined : "refresh-cw"} textOnly={compact} disabled={disabled} onPress={onRetry} /> : null}
  </View>;
}

function TaskEmpty({ status, onCreate }: { status: MobileStaffTaskStatus; onCreate: () => void }) {
  const theme = useHomeTheme();
  return <View accessibilityLiveRegion="polite" style={[styles.feedback, { borderColor: theme.border, backgroundColor: theme.surface }]}>
    <View style={{ gap: 2 }}><Text style={{ color: theme.text, fontSize: 15, lineHeight: 21, fontWeight: "700" }}>{status === "pending" ? "미완료 할 일이 없습니다" : status === "overdue" ? "기한이 지난 할 일이 없습니다" : "표시할 할 일이 없습니다"}</Text>
      <Text style={{ color: theme.secondary, fontSize: 13, lineHeight: 20 }}>{status === "pending" ? "등록 버튼으로 본인의 할 일을 추가하세요." : "다른 상태를 선택해 할 일을 확인하세요."}</Text></View>
    {status === "pending" ? <View style={{ alignSelf: "flex-start" }}><TaskAction label="할 일 등록" icon="plus" onPress={onCreate} /></View> : null}
  </View>;
}

function TasksLoading() {
  const theme = useHomeTheme(), { fontScale } = useWindowDimensions();
  return <View accessibilityRole="progressbar" accessibilityLabel="할 일 불러오는 중" style={{ borderRadius: 16, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface, overflow: "hidden" }}>
    {[0, 1, 2].map(item => <View key={item} accessible={false} aria-hidden style={{ minHeight: 84 * Math.max(1, fontScale * .9), padding: 14, borderTopWidth: item ? 1 : 0, borderTopColor: theme.border, flexDirection: "row", alignItems: "center", gap: 12 }}>
      <View style={{ flex: 1, gap: 8 }}><View style={{ width: "75%", height: 13, borderRadius: 7, backgroundColor: theme.surfaceMuted }} />
        <View style={{ width: "55%", height: 11, borderRadius: 6, backgroundColor: theme.surfaceMuted }} /></View>
      <View style={{ width: 56, height: 32, borderRadius: 10, backgroundColor: theme.surfaceMuted }} />
    </View>)}
  </View>;
}

const styles = StyleSheet.create({
  heading: { width: "100%", maxWidth: 760, alignSelf: "center", flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 4, padding: 4, paddingRight: 12, minHeight: 52 },
  content: { paddingHorizontal: 16, paddingTop: 12, maxWidth: 760, width: "100%", alignSelf: "center" },
  summaryRow: { flexDirection: "row", gap: 8 },
  metric: { flex: 1, minWidth: 0, minHeight: 64, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, gap: 2 },
  count: { fontSize: 20, lineHeight: 26, fontWeight: "700", fontVariant: ["tabular-nums"], flexShrink: 0 },
  filters: { flexDirection: "row", flexWrap: "wrap", gap: 4, padding: 3, borderWidth: 1, borderRadius: 12 },
  filter: { flexGrow: 1, flexShrink: 1, minHeight: 44, paddingVertical: 4, paddingHorizontal: 8, borderWidth: 1.5, borderRadius: 9, justifyContent: "center" },
  listline: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 8, rowGap: 2, paddingHorizontal: 4, minHeight: 24 },
  task: { flex: 1, minWidth: 0, minHeight: 84, borderWidth: 2, paddingLeft: 12, paddingRight: 6, paddingVertical: 8, justifyContent: "center" },
  action: { minWidth: 44, minHeight: 44, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderRadius: 10, flexDirection: "row", gap: 4, alignItems: "center", justifyContent: "center" },
  feedback: { padding: 12, gap: 8, borderWidth: 1, borderRadius: 12 },
  pager: { flexDirection: "row", gap: 8, marginTop: 12 },
});
