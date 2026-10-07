import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { AccountFeedback } from "@/components/account-feedback";
import { EmptyState, PrimaryButton, TextAction } from "@/components/ui";
import { useConfirmAction } from "@/components/use-confirm-action";
import { ApiError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { formatTaskDueDate, formatTaskTimestamp, isTaskId, taskState } from "@/lib/tasks";
import { useTheme } from "@/lib/theme";
import type { MobileStaffTaskHistoryLog, MobileStaffTaskHistoryResponse, MobileStaffTaskMutationResponse } from "@/lib/types";

type Mutation = "complete" | "delete";
export function TaskDetailScreen({ taskId, page = 1, created = false, assigned = false }: { taskId: string; page?: number; created?: boolean; assigned?: boolean }) {
  const { token } = useSession();
  const currentToken = useRef(token);
  useLayoutEffect(() => { currentToken.current = token; }, [token]);
  const isCurrentAccount = useCallback(() => !!token && currentToken.current === token, [token]);
  return token ? <TaskDetailContent key={`${token}:${taskId}:${assigned}`} taskId={taskId} page={page} created={created} assigned={assigned} isCurrentAccount={isCurrentAccount} /> : null;
}
function TaskDetailContent({ taskId, page, created, assigned, isCurrentAccount }: { taskId: string; page: number; created: boolean; assigned: boolean; isCurrentAccount: () => boolean }) {
  const { request } = useSession();
  const theme = useTheme();
  const confirmation = useConfirmAction();
  const [result, setResult] = useState<{ page: number; data: MobileStaffTaskHistoryResponse } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(created ? "할 일을 등록했습니다." : null);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [busy, setBusy] = useState<Mutation | null>(null);
  const focused = useRef(false);
  const alive = useRef(true);
  const generation = useRef(0);
  const sequence = useRef(0);
  const locked = useRef(false);
  const latestLoad = useRef<(refresh?: boolean, resolveConflict?: boolean) => Promise<void>>(async () => undefined);
  const content = useRef<ScrollView>(null);
  const invalidateScope = useCallback(() => { generation.current++; sequence.current++; }, []);
  useEffect(() => {
    alive.current = true; invalidateScope();
    return () => { alive.current = false; invalidateScope(); locked.current = false; };
  }, [invalidateScope]);
  const active = useCallback((scope: number, operation: number) => alive.current && focused.current && generation.current === scope && sequence.current === operation && isCurrentAccount(), [isCurrentAccount]);
  const data = result?.page === page ? result.data : null;
  const task = result?.data.task ?? null;
  const load = useCallback(async (refresh = false, resolveConflict = false) => {
    if (!focused.current || locked.current || !isCurrentAccount()) return;
    const scope = generation.current;
    const operation = ++sequence.current;
    setLoading(true); setRefreshing(refresh); setLoadError(null);
    if (!isTaskId(taskId)) {
      setResult(null); setLoadError("확인할 할 일을 찾을 수 없습니다. 목록에서 다시 선택하세요."); setLoading(false); setRefreshing(false); return;
    }
    try {
      const response = await request<MobileStaffTaskHistoryResponse>(`/tasks/${encodeURIComponent(taskId)}/history?page=${page}${assigned ? "&assigned=1" : ""}`);
      if (!active(scope, operation)) return;
      if (response.task?.id !== taskId) throw new ApiError("할 일 응답을 확인하지 못했습니다. 다시 불러오세요.", 200);
      setResult({ page, data: response });
      if (resolveConflict) { setNeedsRefresh(false); setActionError(null); setNotice("최신 내용을 불러왔습니다. 상태를 확인한 뒤 다시 실행하세요."); }
      if (response.page !== page) router.setParams({ page: String(response.page) });
    } catch (cause) {
      if (!active(scope, operation)) return;
      if (cause instanceof ApiError && (cause.status === 404 || cause.status === 403)) setResult(null);
      setLoadError(cause instanceof Error ? cause.message : "업무와 이력을 불러오지 못했습니다. 다시 시도하세요.");
    } finally {
      if (active(scope, operation)) { setLoading(false); setRefreshing(false); }
    }
  }, [active, assigned, isCurrentAccount, page, request, taskId]);
  useEffect(() => { latestLoad.current = load; }, [load]);
  useFocusEffect(useCallback(() => {
    focused.current = true; void load();
    return () => { focused.current = false; sequence.current++; };
  }, [load]));
  useEffect(() => { content.current?.scrollTo({ y: 0, animated: false }); }, [page]);

  const run = async (kind: Mutation) => {
    if (assigned || result?.data.readOnly || locked.current || loading || loadError || needsRefresh || !task || task.deletedAt || !focused.current || !isCurrentAccount()) return;
    const scope = generation.current;
    const operation = ++sequence.current;
    locked.current = true; setBusy(kind); setLoading(false); setRefreshing(false);
    let saved = false;
    try {
      if (kind === "delete") {
        const accepted = await confirmation.ask({ title: "할 일 삭제 확인", message: `${task.title}\n\n내 할 일 목록에서 제외됩니다. 업무 내용과 삭제 이력은 보존되며 관리자도 확인할 수 있습니다. 삭제 후 복구할 수 없습니다.`, confirm: "삭제", danger: true });
        if (!accepted || !active(scope, operation)) return;
      }
      setActionError(null); setNotice(null);
      const response = await request<MobileStaffTaskMutationResponse>(kind === "delete" ? `/tasks/${encodeURIComponent(taskId)}` : `/tasks/${encodeURIComponent(taskId)}/completion`, {
        method: kind === "delete" ? "DELETE" : "POST", body: kind === "delete" ? { version: task.version } : { completed: !task.completedAt, version: task.version },
      });
      if (!active(scope, operation)) return;
      if (response.ok !== true || response.task?.id !== taskId) throw new ApiError("처리 결과를 확인하지 못했습니다. 최신 내용을 확인하세요.", 200);
      setResult(previous => previous ? { ...previous, data: { ...previous.data, task: response.task } } : previous);
      setNeedsRefresh(false); setNotice(response.message); saved = true;
    } catch (cause) {
      if (!active(scope, operation)) return;
      if (cause instanceof ApiError && (cause.status === 403 || cause.status === 404)) {
        setResult(null); setLoadError(cause.message); setActionError(null);
      } else {
        setActionError(cause instanceof Error ? cause.message : "상태를 저장하지 못했습니다. 최신 내용을 확인하세요.");
        setNeedsRefresh(!(cause instanceof ApiError) || cause.status === 0 || cause.status === 409 || cause.status >= 500 || (cause.status >= 200 && cause.status < 300));
      }
    } finally {
      if (generation.current === scope) locked.current = false;
      if (alive.current && generation.current === scope && isCurrentAccount()) setBusy(null);
      if (focused.current && generation.current === scope && isCurrentAccount() && (saved || sequence.current !== operation)) void latestLoad.current();
    }
  };
  const disabled = !!busy || loading || !!loadError || needsRefresh;
  const state = task ? taskState(task, result!.data.today) : null;
  return <ScrollView ref={content} style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content}
    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true, needsRefresh)} tintColor={theme.accent} />}>
    {task ? <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Text accessibilityRole="header" aria-level={2} style={[styles.title, { color: theme.text }]}>{task.title}</Text>
      <View style={styles.meta}><Text style={[styles.status, { color: state?.tone === "danger" ? theme.danger : state?.tone === "accent" ? theme.accent : theme.secondary }]}>{state?.label}</Text>
        <Text style={[styles.small, { color: theme.secondary }]}>{formatTaskDueDate(task.dueDate)}</Text></View>
      {task.meetingTitle ? <Text style={[styles.body, { color: theme.secondary }]}>회의 · {task.meetingTitle}</Text> : null}
      {task.description ? <Text style={[styles.body, { color: theme.text }]}>{task.description}</Text> : null}
      {task.completedAt ? <Text style={[styles.small, { color: theme.secondary }]}>완료 · {formatTaskTimestamp(task.completedAt)}</Text> : null}
      {task.deletedAt ? <><Text style={[styles.small, { color: theme.secondary }]}>삭제 · {formatTaskTimestamp(task.deletedAt)}</Text><Text style={[styles.small, { color: theme.secondary }]}>목록에서 제외된 업무입니다. 내용과 이력은 보존됩니다.</Text></> : assigned || data?.readOnly ? <Text style={[styles.small, { color: theme.secondary }]}>배정한 업무의 처리 상태입니다. 담당 직원이 완료·삭제를 처리합니다.</Text> : <View style={styles.actions}>
        <View style={{ flex: 1 }}><PrimaryButton title={busy === "complete" ? "저장 중..." : task.completedAt ? "완료 취소" : "완료 처리"} disabled={disabled} onPress={() => void run("complete")} /></View>
        <TextAction label={busy === "delete" ? "확인 중..." : "삭제"} disabled={disabled} onPress={() => void run("delete")} accessibilityLabel={`${task.title} 삭제`} />
      </View>}
    </View> : null}
    <AccountFeedback message={notice} />
    <AccountFeedback error={actionError ?? loadError} />
    {needsRefresh ? <View style={styles.recovery}><Text style={[styles.small, { color: theme.secondary }]}>이전 요청을 자동으로 다시 실행하지 않습니다. 최신 업무 상태를 확인한 뒤 다시 실행하세요.</Text><TextAction label="최신 내용 확인" icon="refresh" disabled={!!busy || loading} onPress={() => void load(true, true)} /></View>
      : loadError ? <TextAction label="다시 불러오기" icon="refresh" disabled={!!busy || loading} onPress={() => void load(true)} /> : null}
    {!task && !loading ? <TextAction label="내 할 일 목록" icon="arrow-back" onPress={() => router.push("/tasks")} /> : null}
    <View style={styles.historyHeader}><Text accessibilityRole="header" aria-level={2} style={{ color: theme.text, fontSize: 17, fontWeight: "800" }}>처리 이력{data ? ` ${data.total.toLocaleString("ko-KR")}건` : ""}</Text>
      <TextAction label={loading ? "확인 중..." : "새로고침"} icon="refresh" disabled={!!busy || loading} onPress={() => void load(true, needsRefresh)} /></View>
    {loading ? <HistoryLoading /> : data?.logs.length ? <View role="list" accessibilityLabel="처리 이력" style={[styles.history, { borderColor: theme.border }]}>{data.logs.map(log => <HistoryRow key={log.id} log={log} />)}</View> : data && !loadError ? <EmptyState title="저장된 처리 이력이 없습니다" /> : null}
    {data && data.totalPages > 1 ? <View style={styles.pager}><Text style={[styles.small, { color: theme.secondary }]}>{data.page.toLocaleString("ko-KR")} / {data.totalPages.toLocaleString("ko-KR")}페이지</Text>
      <View style={styles.actions}><TextAction label="이전" disabled={!!busy || loading || data.page <= 1} onPress={() => router.setParams({ page: String(data.page - 1) })} /><TextAction label="다음" disabled={!!busy || loading || data.page >= data.totalPages} onPress={() => router.setParams({ page: String(data.page + 1) })} /></View></View> : null}
    {confirmation.dialog}
  </ScrollView>;
}
const historyLabels = { "staffTask.create": "할 일을 등록했습니다.", "staffTask.update": "할 일을 수정했습니다.", "staffTask.complete": "완료했습니다.", "staffTask.reopen": "완료를 취소했습니다.", "staffTask.delete": "삭제했습니다." };
function HistoryRow({ log }: { log: MobileStaffTaskHistoryLog }) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);
  const display = (field: string, value: string | null) => field.endsWith("At") ? formatTaskTimestamp(value) : value || "없음";
  return <View role="listitem" style={[styles.historyRow, { backgroundColor: theme.surface, borderColor: theme.border }]}>
    <Text style={{ color: theme.text, fontSize: 14, lineHeight: 20, fontWeight: "700" }}>{log.message || (log.changeType ? historyLabels[log.changeType] : "업무 처리 기록")}</Text>
    <Text style={[styles.small, { color: theme.secondary }]}>{log.actorName} · {formatTaskTimestamp(log.createdAt)}</Text>
    {log.changes.length ? <TextAction label={`${expanded ? "변경 내용 접기" : "변경 내용"} ${log.changes.length}개`} accessibilityLabel={`${formatTaskTimestamp(log.createdAt)} 변경 내용 ${expanded ? "접기" : "펼치기"}`} accessibilityState={{ expanded }} onPress={() => setExpanded(value => !value)} /> : null}
    {expanded ? <View style={[styles.changes, { backgroundColor: theme.surfaceMuted }]}>{log.changes.map(change => <View key={change.field} style={{ gap: 3 }}>
      <Text style={[styles.small, { color: theme.text, fontWeight: "700" }]}>{change.label}</Text>
      {log.changeType !== "staffTask.create" ? <Text style={[styles.small, { color: theme.secondary }]}>변경 전: {display(change.field, change.before)}</Text> : null}
      <Text style={[styles.small, { color: theme.text }]}>{log.changeType === "staffTask.create" ? "등록 내용" : "변경 후"}: {display(change.field, change.after)}</Text>
    </View>)}</View> : null}
  </View>;
}
function HistoryLoading() {
  const theme = useTheme();
  return <View accessibilityRole="progressbar" accessibilityLabel="업무와 처리 이력 불러오는 중">
    <View style={styles.meta}><ActivityIndicator color={theme.accent} /><Text style={[styles.small, { color: theme.secondary }]}>업무와 이력을 불러오는 중...</Text></View>
    {[0, 1].map(index => <View key={index} style={[styles.skeleton, { backgroundColor: theme.surface, borderColor: theme.border }]}><View style={{ width: "70%", height: 15, backgroundColor: theme.surfaceMuted }} /><View style={{ width: "50%", height: 12, marginTop: 8, backgroundColor: theme.surfaceMuted }} /></View>)}
  </View>;
}
const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24, maxWidth: 720, width: "100%", alignSelf: "center" },
  panel: { padding: 12, borderWidth: 1, borderRadius: 12, gap: 8 },
  title: { fontSize: 19, fontWeight: "800", lineHeight: 27 },
  meta: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  status: { fontSize: 13, fontWeight: "700" },
  small: { fontSize: 12, lineHeight: 18, fontVariant: ["tabular-nums"] },
  body: { fontSize: 14, lineHeight: 21 },
  actions: { flexDirection: "row", alignItems: "center", gap: 8 },
  recovery: { marginTop: 6, gap: 2 },
  historyHeader: { marginTop: 12, marginBottom: 4, minHeight: 44, flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 4 },
  history: { borderWidth: 1, borderRadius: 12, overflow: "hidden" },
  historyRow: { padding: 10, minHeight: 68, gap: 3, borderBottomWidth: 1 },
  changes: { padding: 10, borderRadius: 8, gap: 10 },
  pager: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 4, marginTop: 8 },
  skeleton: { minHeight: 72, padding: 12, marginTop: 6, borderWidth: 1, borderRadius: 10 },
});
