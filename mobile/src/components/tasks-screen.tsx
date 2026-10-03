import { Stack, router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { AccountFeedback, focusAccountNotice } from "@/components/account-feedback";
import { EmptyState, TextAction } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { formatTaskDueDate, normalizeTaskStatus, taskPage, taskState, taskStatusOptions } from "@/lib/tasks";
import { useTheme } from "@/lib/theme";
import type { MobileStaffTaskItem, MobileStaffTaskMutationResponse, MobileStaffTasksResponse, MobileStaffTaskStatus } from "@/lib/types";

type Completion = { task: MobileStaffTaskItem; completed: boolean };

export function TasksScreen() {
  const { token } = useSession();
  const params = useLocalSearchParams<{ status?: string; page?: string }>();
  return <TasksContent key={token} status={normalizeTaskStatus(params.status)} page={taskPage(params.page)} />;
}

function TasksContent({ status, page }: { status: MobileStaffTaskStatus; page: number }) {
  const theme = useTheme();
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
  const latestLoad = useRef<(refresh?: boolean) => Promise<void>>(async () => undefined);
  const data = result?.path === path ? result.data : null;
  const message = notice?.path === path ? notice.text : null;
  const busy = operation !== null;

  const load = useCallback(async (refresh = false) => {
    if (!focused.current || mutation.current) return;
    const id = ++sequence.current;
    setLoading(true); setRefreshing(refresh); setError(null); setFailedOperation(null);
    try {
      const response = await request<MobileStaffTasksResponse>(path);
      if (id !== sequence.current || !focused.current) return;
      setResult({ path, data: response }); setConflict(false); setNeedsReload(false);
    } catch (cause) {
      if (id === sequence.current && focused.current) {
        setError(cause instanceof Error ? cause.message : "할 일을 불러오지 못했습니다. 다시 시도하세요.");
      }
    } finally {
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
    return () => { focused.current = false; sequence.current++; };
  }, [load]));
  useEffect(() => { list.current?.scrollToOffset({ offset: 0, animated: false }); }, [path]);
  useEffect(() => { if (message) focusAccountNotice(summary.current); }, [message]);

  const run = async (next: Completion) => {
    if (mutation.current || !focused.current || conflict) return;
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
      setNeedsReload(true);
      setNotice({ path, text: response.message });
    } catch (cause) {
      if (id === sequence.current && focused.current) {
        const changed = cause instanceof ApiError && (cause.status === 409 || cause.status === 404 || cause.status === 403 || cause.status >= 200 && cause.status < 300);
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

  const header = <>
    <View ref={summary} accessible tabIndex={-1} style={styles.summaryRow}>
      <View style={[styles.metric, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={{ color: theme.secondary, fontSize: 12 }}>미완료</Text>
        <Text style={[styles.count, { color: theme.text }]}>{data && !needsReload ? `${data.counts.pending.toLocaleString("ko-KR")}건` : "—"}</Text>
      </View>
      <View style={[styles.metric, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={{ color: theme.secondary, fontSize: 12 }}>기한 초과</Text>
        <Text style={[styles.count, { color: data?.counts.overdue ? theme.danger : theme.text }]}>{data && !needsReload ? `${data.counts.overdue.toLocaleString("ko-KR")}건` : "—"}</Text>
      </View>
    </View>
    <View style={styles.filters}>
      {taskStatusOptions.map(option => <TaskFilter key={option.value} label={option.label} selected={status === option.value} disabled={busy}
        onPress={() => router.setParams({ status: option.value, page: "1" })} />)}
      <Text accessibilityLiveRegion="polite" style={{ color: theme.secondary, fontSize: 12, alignSelf: "center", paddingHorizontal: 6, fontVariant: ["tabular-nums"] }}>
        {busy && !data ? "변경을 처리하는 중…" : needsReload ? "변경된 건수와 목록을 다시 불러오세요" : data ? `${status === "pending" || status === "overdue" ? "" : `${data.total.toLocaleString("ko-KR")}건 · `}${data.page} / ${data.totalPages} 페이지` : error ? "최신 목록을 확인하세요" : "할 일을 불러오는 중"}
      </Text>
    </View>
    <AccountFeedback error={error} message={message} />
    {error ? <View style={{ alignItems: "flex-start", marginBottom: 8 }}>
      <TextAction label={conflict ? "최신 목록 불러오기" : "다시 시도"} icon="refresh" disabled={busy || loading}
        onPress={() => failedOperation ? void run(failedOperation) : void load(true)} />
    </View> : null}
    {loading && data ? <Text accessibilityLiveRegion="polite" style={{ color: theme.secondary, fontSize: 12, marginBottom: 8 }}>건수와 목록을 갱신하는 중…</Text> : null}
  </>;

  return <View style={{ flex: 1, backgroundColor: theme.background }}>
    <Stack.Screen options={{ headerRight: () => <View style={{ flexDirection: "row", alignItems: "center" }}><TextAction label="" accessibilityLabel="할 일 새로고침" icon="refresh" disabled={busy || loading} onPress={() => void load(true)} /><TextAction label="등록" icon="add" accessibilityLabel="새 할 일 등록" disabled={busy} onPress={() => router.push("/tasks/new")} /></View> }} />
    <FlatList ref={list} role="list" accessibilityLabel="내 할 일 목록" data={data?.tasks.filter(item => status === "deleted" ? !!item.deletedAt : !item.deletedAt && (status === "completed" ? !!item.completedAt : status === "all" ? true : !item.completedAt && (status !== "overdue" || !!item.dueDate && item.dueDate < data.today))) ?? []} keyExtractor={item => item.id} extraData={{ operation, conflict }}
      contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={theme.accent} />}
      ListHeaderComponent={header} renderItem={({ item }) => <TaskRow item={item} today={data?.today ?? ""} disabled={busy || conflict}
        pending={operation?.task.id === item.id} open={() => router.push({ pathname: "/tasks/[id]", params: { id: item.id } })}
        complete={() => void run({ task: item, completed: !item.completedAt })} />}
      ListEmptyComponent={loading || busy ? <TasksLoading /> : error ? null : <EmptyState title={status === "pending" ? "미완료 할 일이 없습니다" : status === "overdue" ? "기한이 지난 할 일이 없습니다" : "표시할 할 일이 없습니다"}
        detail={status === "pending" ? "등록 버튼으로 본인의 할 일을 추가하세요." : "다른 상태를 선택해 할 일을 확인하세요."} />}
      ListFooterComponent={data && data.totalPages > 1 ? <View style={styles.pager}>
        <TextAction label="이전" icon="chevron-back" disabled={busy || loading || data.page <= 1} onPress={() => router.setParams({ page: String(data.page - 1) })} />
        <Text style={{ color: theme.secondary, fontSize: 13, fontVariant: ["tabular-nums"] }}>{data.page} / {data.totalPages}</Text>
        <TextAction label="다음" icon="chevron-forward" disabled={busy || loading || data.page >= data.totalPages} onPress={() => router.setParams({ page: String(data.page + 1) })} />
      </View> : null} />
  </View>;
}

function TaskFilter({ label, selected, disabled, onPress }: { label: string; selected: boolean; disabled: boolean; onPress: () => void }) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  return <Pressable accessibilityRole="button" accessibilityState={{ selected, disabled }} disabled={disabled} onPress={onPress}
    onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 9, borderRadius: 8,
      borderWidth: 2, borderColor: focused ? theme.accent : "transparent", backgroundColor: selected || pressed ? theme.accentSoft : "transparent", opacity: disabled ? 0.45 : 1,
      alignItems: "center", justifyContent: "center" })}>
    <Text style={{ color: selected ? theme.accent : theme.secondary, fontSize: 14, fontWeight: selected ? "800" : "600" }}>{label}</Text>
  </Pressable>;
}

function TaskRow({ item, today, disabled, pending, open, complete }: {
  item: MobileStaffTaskItem; today: string; disabled: boolean; pending: boolean; open: () => void; complete: () => void;
}) {
  const theme = useTheme();
  const state = taskState(item, today);
  const [focused, setFocused] = useState(false);
  const color = state.tone === "danger" ? theme.danger : state.tone === "accent" ? theme.accent : theme.secondary;
  return <View role="listitem" style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}>
    <Pressable accessibilityRole="link" accessibilityLabel={`${state.label}, ${item.title}, 상세와 이력 보기`} disabled={disabled}
      accessibilityState={{ disabled }} onPress={open} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      style={({ pressed }) => [styles.task, { borderColor: focused ? theme.accent : "transparent", backgroundColor: pressed || focused ? theme.accentSoft : "transparent" }]}>
      <Text numberOfLines={2} style={{ color: theme.text, fontSize: 15, lineHeight: 21, fontWeight: item.completedAt || item.deletedAt ? "600" : "800" }}>{item.title}</Text>
      <Text style={{ color, fontSize: 12, marginTop: 4 }}>{state.label} · {formatTaskDueDate(item.dueDate)}</Text>
      {item.meetingTitle ? <Text numberOfLines={1} style={{ color: theme.secondary, fontSize: 12, marginTop: 3 }}>{item.meetingTitle}</Text> : null}
    </Pressable>
    {!item.deletedAt ? <TextAction label={pending ? "처리 중…" : item.completedAt ? "취소" : "완료"}
      accessibilityLabel={`${item.title}, ${item.completedAt ? "완료 취소" : "완료 처리"}`} disabled={disabled} onPress={complete} /> : null}
  </View>;
}

function TasksLoading() {
  const theme = useTheme();
  return <View accessibilityRole="progressbar" accessibilityLabel="할 일 불러오는 중">
    {[0, 1, 2].map(item => <View key={item} style={[styles.skeleton, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={{ width: "75%", height: 17, backgroundColor: theme.surfaceMuted }} />
      <View style={{ width: "55%", height: 12, marginTop: 8, backgroundColor: theme.surfaceMuted }} />
    </View>)}
  </View>;
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24, maxWidth: 720, width: "100%", alignSelf: "center" },
  summaryRow: { flexDirection: "row", gap: 8, marginBottom: 4 },
  metric: { flex: 1, minWidth: 0, minHeight: 64, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  count: { fontSize: 22, fontWeight: "800", fontVariant: ["tabular-nums"], marginTop: 2 },
  filters: { flexDirection: "row", flexWrap: "wrap", gap: 0, marginBottom: 4 },
  row: { flexDirection: "row", alignItems: "center", borderBottomWidth: 1, paddingRight: 6 },
  task: { flex: 1, minWidth: 0, minHeight: 84, borderWidth: 2, paddingHorizontal: 10, paddingVertical: 10 },
  pager: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10 },
  skeleton: { minHeight: 84, padding: 14, borderBottomWidth: 1 },
});
