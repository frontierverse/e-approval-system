import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AccountFeedback, focusAccountNotice } from "@/components/account-feedback";
import { EmptyState, TextAction } from "@/components/ui";
import { useNotifications } from "@/lib/notifications";
import { useSession } from "@/lib/session";
import { formatDate, useTheme } from "@/lib/theme";
import type { MobileNotification, NotificationsResponse } from "@/lib/types";

type ReadResult = { unreadCount: number; updatedCount: number };
type Operation = { kind: "all" } | { kind: "read" | "open"; item: MobileNotification };

export function NotificationsScreen() {
  const { token } = useSession();
  const params = useLocalSearchParams<{ filter?: string; page?: string }>();
  const filter = params.filter === "unread" ? "unread" : "all";
  const value = Number(params.page);
  const page = Number.isSafeInteger(value) && value > 0 ? value : 1;
  return <NotificationsContent key={token} filter={filter} page={page} />;
}

function NotificationsContent({ filter, page }: { filter: "all" | "unread"; page: number }) {
  const theme = useTheme();
  const { request } = useSession();
  const { unreadCount, setUnreadCount, openNotificationDocument, notificationRevision } = useNotifications();
  const path = `/notifications?filter=${filter}&page=${page}`;
  const [result, setResult] = useState<{ path: string; data: NotificationsResponse } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ path: string; text: string } | null>(null);
  const message = notice?.path === path ? notice.text : null;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [operation, setOperation] = useState<Operation | null>(null);
  const [failedOperation, setFailedOperation] = useState<Operation | null>(null);
  const list = useRef<FlatList<MobileNotification>>(null);
  const summary = useRef<View>(null);
  const sequence = useRef(0);
  const focused = useRef(false);
  const mounted = useRef(true);
  const mutation = useRef(false);
  const latestLoad = useRef<(refresh?: boolean) => Promise<void>>(async () => undefined);
  const data = result?.path === path ? result.data : null;
  const busy = operation !== null;

  const load = useCallback(async (refresh = false) => {
    if (!focused.current || mutation.current) return;
    const id = ++sequence.current;
    setLoading(true); setRefreshing(refresh);
    setError(null); setFailedOperation(null);
    try {
      const response = await request<NotificationsResponse>(path);
      if (id !== sequence.current || !focused.current) return;
      setResult({ path, data: response });
      setUnreadCount(response.unreadCount);
    } catch (cause) {
      if (id === sequence.current && focused.current) {
        setError(cause instanceof Error ? cause.message : "알림을 불러오지 못했습니다. 다시 시도하세요.");
      }
    } finally {
      if (id === sequence.current && focused.current) { setLoading(false); setRefreshing(false); }
    }
  }, [path, request, setUnreadCount]);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { latestLoad.current = load; }, [load]);
  useFocusEffect(useCallback(() => {
    focused.current = true;
    void load();
    return () => { focused.current = false; sequence.current++; };
  // Refresh the focused list when the provider receives a push or foreground event.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, notificationRevision]));
  useEffect(() => {
    list.current?.scrollToOffset({ offset: 0, animated: false });
  }, [path]);

  const run = async (next: Operation) => {
    if (mutation.current || !focused.current) return;
    mutation.current = true; sequence.current++;
    setOperation(next); setError(null); setNotice(null); setFailedOperation(null);
    setLoading(false); setRefreshing(false);
    const id = sequence.current;
    try {
      if (next.kind === "open") {
        await openNotificationDocument(next.item.documentId);
      } else {
        const response = await request<ReadResult>(next.kind === "all" ? "/notifications/read-all" : `/notifications/${encodeURIComponent(next.item.id)}/read`, { method: "POST" });
        if (id !== sequence.current || !focused.current) return;
        setUnreadCount(response.unreadCount);
        const now = new Date().toISOString();
        setResult(previous => {
          if (!previous || previous.path !== path) return previous;
          const old = previous.data;
          const isRead = (item: MobileNotification) => next.kind === "all" || item.id === next.item.id;
          const notifications = filter === "unread" ? old.notifications.filter(item => !isRead(item)) : old.notifications.map(item => isRead(item) && !item.readAt ? { ...item, readAt: now } : item);
          return { path, data: { ...old, notifications, unreadCount: response.unreadCount, total: filter === "unread" ? response.unreadCount : old.total } };
        });
        setNotice({ path, text: next.kind === "all" ? "전체 알림을 읽음으로 표시했습니다." : "알림을 읽음으로 표시했습니다." });
      }
    } catch (cause) {
      if (id === sequence.current && focused.current) {
        setError(cause instanceof Error ? cause.message : "알림을 처리하지 못했습니다. 다시 시도하세요.");
        setFailedOperation(next);
      }
      return;
    } finally {
      mutation.current = false;
      if (mounted.current) setOperation(null);
      if (focused.current) {
        // A focus refresh blocked by the mutation must resume after its old response settles.
        if (id !== sequence.current) void latestLoad.current();
      }
    }
    if (focused.current) await latestLoad.current();
  };

  useEffect(() => {
    if (message) focusAccountNotice(summary.current);
  }, [message]);
  const count = unreadCount ?? data?.unreadCount;
  const retry = () => failedOperation ? void run(failedOperation) : void load(true);
  const header = <>
    <View style={styles.heading}>
      <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 23, fontWeight: "800", letterSpacing: -0.6 }}>알림</Text>
      <TextAction label={operation?.kind === "all" ? "처리 중…" : "전체 읽음"} disabled={busy || loading || !count}
        accessibilityState={{ disabled: busy || loading || !count }} onPress={() => void run({ kind: "all" })} />
    </View>
    <View ref={summary} accessible tabIndex={-1}><Text style={[styles.summary, { color: theme.secondary }]} accessibilityLiveRegion="polite">
      {count === undefined || count === null ? "알림을 불러오는 중" : `안 읽음 ${count.toLocaleString("ko-KR")}건`}
      {data && filter === "all" ? ` · 전체 ${data.total.toLocaleString("ko-KR")}건` : ""}
    </Text></View>
    <View style={styles.tools}>
      <NotificationFilter label="전체" selected={filter === "all"} disabled={busy} onPress={() => router.setParams({ filter: "all", page: "1" })} />
      <NotificationFilter label="안 읽음" selected={filter === "unread"} disabled={busy} onPress={() => router.setParams({ filter: "unread", page: "1" })} />
      <Text style={{ color: theme.secondary, fontSize: 12, flex: 1, textAlign: "right", fontVariant: ["tabular-nums"] }}>
        {data ? `${data.page} / ${data.totalPages} 페이지` : ""}
      </Text>
      <TextAction label="" accessibilityLabel="알림 새로고침" icon="refresh" disabled={busy || loading} accessibilityState={{ disabled: busy || loading }} onPress={() => void load(true)} />
    </View>
    <AccountFeedback error={error} message={message} />
    {error ? <View style={styles.retry}><TextAction label="다시 시도" icon="refresh" onPress={retry} disabled={busy || loading} /></View> : null}
    {loading && data ? <Text accessibilityLiveRegion="polite" style={{ color: theme.secondary, fontSize: 12, marginBottom: 8 }}>알림을 갱신하는 중…</Text> : null}
  </>;

  return <SafeAreaView edges={["top", "left", "right"]} style={{ flex: 1, backgroundColor: theme.background }}>
    <FlatList ref={list} role="list" accessibilityLabel="알림 목록" data={data?.notifications ?? []} keyExtractor={item => item.id} extraData={operation}
      contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={theme.accent} />}
      ListHeaderComponent={header}
      renderItem={({ item }) => <NotificationRow item={item} disabled={busy} pending={operation?.kind !== "all" && operation && operation.item.id === item.id ? operation.kind : null}
        open={() => void run({ kind: "open", item })} read={() => void run({ kind: "read", item })} />}
      ListEmptyComponent={loading ? <NotificationLoading /> : error ? null : <EmptyState title={filter === "unread" ? "읽지 않은 알림이 없습니다" : "알림이 없습니다"}
        detail={filter === "unread" ? "새 알림이 도착하면 여기에서 확인하세요." : "결재 진행 소식이 여기에 표시됩니다."} />}
      ListFooterComponent={data && data.totalPages > 1 ? <View style={styles.pager}>
        <TextAction label="이전" icon="chevron-back" disabled={busy || loading || data.page <= 1}
          accessibilityState={{ disabled: busy || loading || data.page <= 1 }} onPress={() => router.setParams({ page: String(data.page - 1) })} />
        <Text style={{ color: theme.secondary, fontSize: 13, fontVariant: ["tabular-nums"] }}>{data.page} / {data.totalPages}</Text>
        <TextAction label="다음" icon="chevron-forward" disabled={busy || loading || data.page >= data.totalPages}
          accessibilityState={{ disabled: busy || loading || data.page >= data.totalPages }} onPress={() => router.setParams({ page: String(data.page + 1) })} />
      </View> : null} />
  </SafeAreaView>;
}

function NotificationFilter({ label, selected, disabled, onPress }: { label: string; selected: boolean; disabled: boolean; onPress: () => void }) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  return <Pressable accessibilityRole="button" accessibilityState={{ selected, disabled }} disabled={disabled} onPress={onPress}
    onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
    style={({ pressed }) => ({ minHeight: 44, minWidth: 44, paddingHorizontal: 10, alignItems: "center", justifyContent: "center", borderRadius: 8,
      borderWidth: 2, borderColor: focused ? theme.accent : "transparent", backgroundColor: selected || pressed ? theme.accentSoft : "transparent", opacity: disabled ? 0.45 : 1 })}>
    <Text style={{ color: selected ? theme.accent : theme.secondary, fontSize: 14, fontWeight: selected ? "800" : "600" }}>{label}</Text>
  </Pressable>;
}

function NotificationRow({ item, disabled, pending, open, read }: { item: MobileNotification; disabled: boolean; pending: "read" | "open" | null; open: () => void; read: () => void }) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  return <View role="listitem" style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}>
    <Pressable onPress={open} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} disabled={disabled}
      accessibilityRole="link" accessibilityState={{ disabled }} accessibilityLabel={`${item.readAt ? "읽음" : "안 읽음"}, ${item.title}, 문서 열기`}
      style={({ pressed }) => [styles.document, { borderColor: focused ? theme.accent : "transparent", backgroundColor: pressed || focused ? theme.accentSoft : "transparent" }]}>
      <Text numberOfLines={2} style={{ color: theme.text, fontSize: 15, fontWeight: item.readAt ? "600" : "800", lineHeight: 21 }}>{item.title}</Text>
      <Text numberOfLines={1} style={{ color: theme.secondary, fontSize: 13, marginTop: 3 }}>{item.message}</Text>
      <Text style={{ color: !item.readAt ? theme.accent : theme.secondary, fontSize: 12, marginTop: 4 }}>
        {pending === "open" ? "문서 여는 중…" : item.readAt ? "읽음" : "안 읽음"} · {formatDate(item.createdAt)}
      </Text>
    </Pressable>
    {!item.readAt ? <TextAction label={pending === "read" ? "처리 중…" : "읽음"} accessibilityLabel={`${item.title}, 읽음으로 표시`}
      disabled={disabled} accessibilityState={{ disabled }} onPress={read} /> : null}
  </View>;
}

function NotificationLoading() {
  const theme = useTheme();
  return <View accessibilityRole="progressbar" accessibilityLabel="알림 불러오는 중">
    {[0, 1, 2].map(item => <View key={item} style={[styles.skeleton, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={{ height: 17, width: "75%", backgroundColor: theme.surfaceMuted }} />
      <View style={{ height: 12, width: "55%", marginTop: 8, backgroundColor: theme.surfaceMuted }} />
    </View>)}
  </View>;
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingBottom: 24, maxWidth: 720, width: "100%", alignSelf: "center" },
  heading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 8 },
  summary: { fontSize: 13, marginBottom: 4, fontVariant: ["tabular-nums"] },
  tools: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 8 },
  retry: { alignItems: "flex-start", marginBottom: 8 },
  row: { flexDirection: "row", alignItems: "center", borderBottomWidth: 1, paddingRight: 6 },
  document: { flex: 1, minWidth: 0, minHeight: 84, paddingHorizontal: 10, paddingVertical: 9, borderWidth: 2 },
  pager: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10 },
  skeleton: { minHeight: 84, padding: 14, borderBottomWidth: 1, justifyContent: "center" },
});
