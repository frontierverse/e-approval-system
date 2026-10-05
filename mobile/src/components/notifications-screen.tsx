import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Platform, Pressable, RefreshControl, StyleSheet, Text, useWindowDimensions, View, type TextStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { focusAccountNotice } from "@/components/account-feedback";
import { formatDocumentDate } from "@/lib/document-library";
import { useHomeTheme as useTheme } from "@/lib/home-theme";
import { useSession } from "@/lib/session";
import { useNotificationPage } from "@/lib/use-notification-page";
import type { MobileNotification } from "@/lib/types";

type Icon = React.ComponentProps<typeof Feather>["name"];
const wordWrap = Platform.OS === "web" ? { wordBreak: "keep-all", overflowWrap: "anywhere" } as TextStyle : undefined;
export function NotificationsScreen() {
  const { token, user } = useSession();
  const params = useLocalSearchParams<{ filter?: string; page?: string }>();
  const filter = params.filter === "unread" ? "unread" : "all";
  const value = Number(params.page);
  const page = Number.isSafeInteger(value) && value > 0 ? value : 1;
  return <NotificationsContent key={JSON.stringify([token, user?.id])} filter={filter} page={page} />;
}

function NotificationsContent({ filter, page }: { filter: "all" | "unread"; page: number }) {
  const theme = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const largeText = fontScale >= 1.3 || width / fontScale < 300;
  const { path, data, loadedAt, loading, refreshing, busy, operation, error, message, run, reload, retry, dismissError } = useNotificationPage(filter, page);
  const list = useRef<FlatList<MobileNotification>>(null), feedback = useRef<View>(null);
  const correctedPath = useRef<string | null>(null);
  const [pageNotice, setPageNotice] = useState<{ filter: string; page: number; totalPages: number; text: string } | null>(null);
  useEffect(() => { list.current?.scrollToOffset({ offset: 0, animated: false }); }, [path]);
  useEffect(() => {
    if (data?.page === page) correctedPath.current = null;
    if (data && data.page !== page && correctedPath.current !== path) {
      correctedPath.current = path;
      setPageNotice({ filter, page: data.page, totalPages: data.totalPages, text: `알림 수가 바뀌어 ${data.page}페이지로 이동했어요.` });
      router.setParams({ page: String(data.page) });
    }
  }, [data, filter, page, path]);
  useEffect(() => {
    if (message || error) { list.current?.scrollToOffset({ offset: 0, animated: false }); focusAccountNotice(feedback.current); }
  }, [message, error]);
  const blocked = error?.status === 401 || error?.status === 403;
  const disabled = busy || loading;
  const observed = loadedAt ? new Date(loadedAt).toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }) : "";
  const count = data ? `안 읽음 ${data.unreadCount.toLocaleString("ko-KR")}건${filter === "all" ? `${largeText ? "\n" : " · "}전체 ${data.total.toLocaleString("ko-KR")}건` : ""}${loading ? " · 갱신 중" : error && !error.operation ? ` · ${observed} 기준` : ""}` : error ? "목록과 건수를 확인하지 못했어요" : "알림 건수 확인 중";
  const changeFilter = (next: "all" | "unread") => { if (!busy) { setPageNotice(null); router.setParams({ filter: next, page: "1" }); } };
  const changePage = (next: number) => { if (!disabled) { setPageNotice(null); router.setParams({ page: String(next) }); } };
  const notice = message || (pageNotice?.filter === filter && pageNotice.page === data?.page && pageNotice.totalPages === data.totalPages ? pageNotice.text : null);
  const header = <View style={styles.listHeader}>
    <View style={styles.tools}>
      <View role="group" accessibilityLabel="알림 필터" style={[styles.filters, { backgroundColor: theme.surfaceMuted }]}>
        <NotificationFilter label="전체" selected={filter === "all"} disabled={busy} onPress={() => changeFilter("all")} />
        <NotificationFilter label="안 읽음" selected={filter === "unread"} disabled={busy} onPress={() => changeFilter("unread")} />
      </View>
      <View style={styles.toolsRight}>
        {data && data.totalPages > 1 ? <Text style={[styles.pageHint, { color: theme.secondary }]}>{data.page}/{data.totalPages} 페이지</Text> : null}
        <Action label="" icon="refresh-cw" accessibilityLabel="알림 새로고침" disabled={disabled || !data} pending={refreshing} onPress={() => void reload()} />
      </View>
    </View>
    {notice && !blocked ? <View ref={feedback} accessible tabIndex={-1} accessibilityLiveRegion="polite" style={[styles.notice, { backgroundColor: theme.accentSoft }]}>
      <Feather aria-hidden accessible={false} name={message ? "check-circle" : "info"} size={16} color={message ? theme.success : theme.accent} />
      <Text style={[styles.noticeText, { color: theme.text }]}>{notice}</Text>
    </View> : null}
    {error?.operation && !blocked ? <View style={[styles.actionError, { backgroundColor: theme.surface, borderColor: theme.danger }]}>
      <View ref={feedback} accessible tabIndex={-1} accessibilityRole="alert" style={{ gap: 6 }}><View style={styles.errorHeading}><Feather aria-hidden accessible={false} name="alert-circle" size={16} color={theme.danger} /><Text style={[styles.errorTitle, { color: theme.text }]}>{error.status === 404 ? error.operation.kind === "open" ? "문서를 찾을 수 없어요" : "알림을 찾을 수 없어요" : "처리 결과를 확인하지 못했어요"}</Text></View>
      <Text style={[styles.noticeText, { color: theme.secondary }]}>{error.message}</Text></View>
      <View style={styles.errorActions}><Action label="닫기" onPress={dismissError} disabled={disabled} /><Action label={error.operation.kind === "open" ? "문서 열기 재시도" : "읽음 처리 재시도"} icon="refresh-cw" outline disabled={disabled} onPress={() => void retry()} /></View>
    </View> : null}
  </View>;
  let empty;
  if (blocked) empty = <Feedback noticeRef={feedback} icon="lock" title={error.status === 401 ? "다시 로그인해 주세요" : "알림 접근 권한이 바뀌었어요"} detail="이전 목록과 건수는 표시하지 않아요. 권한을 확인한 뒤 다시 시도해 주세요.">
    <Action label={error.status === 401 ? "로그인으로 이동" : "다시 시도"} outline onPress={() => error.status === 401 ? router.replace("/login") : void reload()} disabled={busy} />
  </Feedback>;
  else if (loading) empty = <NotificationLoading />;
  else if (error && !error.operation) empty = <Feedback noticeRef={feedback} icon="alert-circle" title="알림을 불러오지 못했어요" detail={error.message}><Action label="다시 시도" icon="refresh-cw" outline disabled={busy} onPress={() => void retry()} /></Feedback>;
  else if (error?.operation) empty = null;
  else empty = <Feedback title={filter === "unread" ? "읽지 않은 알림이 없어요" : "받은 알림이 없어요"} detail="새 결재 소식이 도착하면 여기에서 확인할 수 있어요.">{filter === "unread" ? <Action label="전체 알림 보기" outline onPress={() => changeFilter("all")} /> : null}</Feedback>;

  return <SafeAreaView edges={["top", "left", "right"]} style={{ flex: 1, backgroundColor: theme.background }}>
    <View style={[styles.heading, { borderBottomColor: theme.border }]}>
      <View style={styles.headingBody}><Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>알림</Text><Text accessibilityLiveRegion="polite" style={[styles.summary, { color: theme.secondary }]}>{count}</Text></View>
      <Action label={operation?.kind === "all" ? "처리 중" : "전체 읽음"} icon="check" accessibilityLabel="모든 페이지의 안 읽은 알림을 읽음으로 표시" disabled={disabled || !data?.unreadCount} pending={operation?.kind === "all"} onPress={() => void run({ kind: "all" })} />
    </View>
    {data && error && !error.operation ? <View style={[styles.refreshError, { borderColor: theme.danger, backgroundColor: theme.surface }]}><Feather aria-hidden accessible={false} name="alert-circle" size={18} color={theme.danger} /><View ref={feedback} accessible tabIndex={-1} accessibilityRole="alert" style={{ flex: 1 }}><Text style={[styles.noticeText, { color: theme.secondary }]}>{error.message} {observed}에 확인한 목록이에요.</Text></View><Action label="재시도" icon="refresh-cw" disabled={disabled} onPress={() => void retry()} /></View> : null}
    <FlatList ref={list} showsVerticalScrollIndicator={false} role="list" accessibilityLabel={`${filter === "unread" ? "안 읽음" : "전체"} 알림 목록${data ? `, ${data.page}페이지, ${data.notifications.length}건 표시` : ""}`} data={data?.notifications ?? []} keyExtractor={item => item.id} extraData={operation}
      contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void reload()} tintColor={theme.accent} />} ListHeaderComponent={header}
      renderItem={({ item, index }) => <NotificationRow item={item} first={index === 0} last={index === (data?.notifications.length ?? 0) - 1} largeText={largeText} disabled={disabled} pending={operation?.kind !== "all" && operation?.item.id === item.id ? operation.kind : null} open={() => void run({ kind: "open", item })} read={() => void run({ kind: "read", item })} />}
      ListEmptyComponent={empty} ListFooterComponent={data && data.totalPages > 1 ? <View style={styles.pager}>
        <Action label="이전" icon="chevron-left" outline disabled={disabled || data.page <= 1} onPress={() => changePage(data.page - 1)} /><Text style={[styles.pageHint, { color: theme.secondary }]}>{data.page} / {data.totalPages}</Text><Action label="다음" icon="chevron-right" outline disabled={disabled || data.page >= data.totalPages} onPress={() => changePage(data.page + 1)} />
      </View> : null} />
  </SafeAreaView>;
}

function Action({ label, icon, accessibilityLabel, disabled = false, pending = false, outline = false, onPress }: { label: string; icon?: Icon; accessibilityLabel?: string; disabled?: boolean; pending?: boolean; outline?: boolean; onPress: () => void }) {
  const theme = useTheme(), [focused, setFocused] = useState(false);
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel || label} accessibilityState={{ disabled, busy: pending }} disabled={disabled} onPress={onPress} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={({ pressed }) => [styles.action, { borderColor: focused ? theme.accent : outline ? theme.controlBorder : "transparent", backgroundColor: pressed || focused ? theme.accentSoft : "transparent" }]}>
    {pending ? <ActivityIndicator size="small" color={theme.accent} /> : icon ? <Feather aria-hidden accessible={false} name={icon} size={label ? 18 : 20} color={disabled ? theme.muted : label ? theme.accent : theme.text} /> : null}
    {label ? <Text style={[styles.actionText, { color: disabled ? theme.muted : theme.accent }]}>{label}</Text> : null}
  </Pressable>;
}
function NotificationFilter({ label, selected, disabled, onPress }: { label: string; selected: boolean; disabled: boolean; onPress: () => void }) {
  const theme = useTheme(), [focused, setFocused] = useState(false);
  const webState = Platform.OS === "web" ? { "aria-pressed": selected } : {};
  return <Pressable {...webState} accessibilityRole="button" accessibilityState={Platform.OS === "web" ? { disabled } : { selected, disabled }} disabled={disabled} onPress={onPress} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={({ pressed }) => [styles.filter, { borderColor: focused ? theme.accent : selected ? theme.controlBorder : "transparent", backgroundColor: pressed || focused ? theme.accentSoft : selected ? theme.surface : "transparent" }]}><Text style={[styles.filterText, { color: selected ? theme.text : theme.secondary, fontWeight: selected ? "700" : "500" }]}>{label}</Text></Pressable>;
}
function NotificationRow({ item, first, last, largeText, disabled, pending, open, read }: { item: MobileNotification; first: boolean; last: boolean; largeText: boolean; disabled: boolean; pending: "read" | "open" | null; open: () => void; read: () => void }) {
  const theme = useTheme(), [openFocused, setOpenFocused] = useState(false), [readFocused, setReadFocused] = useState(false);
  const unread = !item.readAt, date = formatDocumentDate(item.createdAt);
  return <View role="listitem" style={[styles.row, first && styles.firstRow, last && styles.lastRow, largeText && { flexWrap: "wrap" }, { backgroundColor: theme.surface, borderColor: theme.border }]}>
    <Pressable accessibilityRole="link" accessibilityLabel={`${unread ? "안 읽음" : "읽음"}, ${item.title}, ${item.message}, ${date}, 문서 열기`} accessibilityState={{ disabled, busy: pending === "open" }} disabled={disabled} onPress={open} onFocus={() => setOpenFocused(true)} onBlur={() => setOpenFocused(false)} style={({ pressed }) => [styles.document, largeText && { flexBasis: "100%" }, { borderColor: openFocused ? theme.accent : "transparent", backgroundColor: pressed || openFocused ? theme.accentSoft : "transparent" }]}>
      <View aria-hidden style={[styles.dot, { backgroundColor: unread ? theme.accent : "transparent" }]} />
      <View style={styles.documentBody}><Text numberOfLines={largeText ? 4 : 2} style={[styles.rowTitle, wordWrap, { color: theme.text, fontWeight: unread ? "700" : "500" }]}>{item.title}</Text><Text numberOfLines={largeText ? 6 : 2} style={[styles.rowMessage, wordWrap, { color: theme.secondary }]}>{item.message}</Text>
        <View style={styles.meta}><Text style={[styles.metaText, { color: unread ? theme.accent : theme.secondary, fontWeight: unread ? "700" : "400" }]}>{pending === "open" ? "문서 확인 중" : unread ? "안 읽음" : "읽음"}</Text><Text aria-hidden style={[styles.metaText, { color: theme.secondary }]}>·</Text><Text style={[styles.metaText, { color: theme.secondary, flexShrink: 1 }]}>{date}</Text></View>
      </View><Feather aria-hidden accessible={false} name="chevron-right" size={18} color={theme.muted} />
    </Pressable>
    {unread ? <Pressable accessibilityRole="button" accessibilityLabel={`${item.title}, ${item.message}, 읽음으로 표시`} accessibilityState={{ disabled, busy: pending === "read" }} disabled={disabled} onPress={read} onFocus={() => setReadFocused(true)} onBlur={() => setReadFocused(false)} style={[styles.readTarget, largeText && styles.readTargetLarge, { borderColor: readFocused ? theme.accent : "transparent" }]}><View style={[styles.readPill, { borderColor: readFocused ? theme.accent : theme.controlBorder, backgroundColor: readFocused ? theme.accentSoft : theme.surface }]}>{pending === "read" ? <ActivityIndicator size="small" color={theme.accent} /> : <Feather aria-hidden accessible={false} name="check" size={13} color={disabled ? theme.muted : theme.accent} />}<Text style={[styles.readText, { color: disabled ? theme.muted : theme.accent }]}>{pending === "read" ? "처리 중" : "읽음"}</Text></View></Pressable> : null}
  </View>;
}
function Feedback({ icon, title, detail, children, noticeRef }: { icon?: Icon; title: string; detail: string; children?: React.ReactNode; noticeRef?: React.Ref<View> }) {
  const theme = useTheme();
  return <View style={[styles.feedback, { backgroundColor: theme.surface, borderColor: theme.border }]}><View ref={noticeRef} accessible={!!noticeRef} tabIndex={noticeRef ? -1 : undefined} accessibilityRole={noticeRef ? "alert" : undefined} style={styles.errorHeading}>{icon ? <Feather aria-hidden accessible={false} name={icon} size={22} color={theme.danger} /> : null}<View style={{ flex: 1, gap: 2 }}><Text accessibilityRole="header" style={[styles.feedbackTitle, { color: theme.text }]}>{title}</Text><Text style={[styles.noticeText, wordWrap, { color: theme.secondary }]}>{detail}</Text></View></View>{children}</View>;
}
function NotificationLoading() {
  const theme = useTheme();
  return <View accessibilityRole="progressbar" accessibilityLabel="알림 불러오는 중" style={[styles.skeletonGroup, { backgroundColor: theme.surface, borderColor: theme.border }]}>{Array.from({ length: 7 }, (_, i) => <View key={i} style={[styles.skeleton, { borderTopWidth: i ? 1 : 0, borderColor: theme.border }]}><View style={{ height: 13, width: "54%", backgroundColor: theme.surfaceMuted }} /><View style={{ height: 11, width: "90%", backgroundColor: theme.surfaceMuted }} /><View style={{ height: 10, width: "70%", backgroundColor: theme.surfaceMuted }} /></View>)}</View>;
}
const styles = StyleSheet.create({
  heading: { minHeight: 60, paddingVertical: 6, paddingLeft: 16, paddingRight: 8, borderBottomWidth: 1, flexDirection: "row", alignItems: "center", gap: 8 }, headingBody: { flex: 1, minWidth: 0, gap: 1 }, title: { fontSize: 20, lineHeight: 28, fontWeight: "700", letterSpacing: -0.3 }, summary: { fontSize: 13, lineHeight: 18.2 },
  content: { paddingTop: 10, paddingHorizontal: 16, paddingBottom: 16, width: "100%", maxWidth: 720, alignSelf: "center" }, listHeader: { gap: 8, marginBottom: 8 }, tools: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 4, flexWrap: "wrap" }, filters: { flexDirection: "row", padding: 3, gap: 3, borderRadius: 13 }, filter: { minHeight: 44, minWidth: 64, paddingVertical: 4, paddingHorizontal: 14, borderWidth: 1, borderRadius: 10, alignItems: "center", justifyContent: "center" }, filterText: { fontSize: 14, lineHeight: 20 }, toolsRight: { flexDirection: "row", alignItems: "center", gap: 2, marginLeft: "auto" }, pageHint: { fontSize: 13, lineHeight: 19, fontVariant: ["tabular-nums"] }, action: { minHeight: 44, minWidth: 44, paddingVertical: 6, paddingHorizontal: 10, borderWidth: 1, borderRadius: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }, actionText: { fontSize: 14, lineHeight: 20, fontWeight: "700", flexShrink: 1 },
  row: { flexDirection: "row", alignItems: "stretch", borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, overflow: "hidden" }, firstRow: { borderTopWidth: 1, borderTopLeftRadius: 16, borderTopRightRadius: 16 }, lastRow: { borderBottomLeftRadius: 16, borderBottomRightRadius: 16 }, document: { flex: 1, minWidth: 0, minHeight: 64, paddingVertical: 9, paddingLeft: 11, paddingRight: 5, borderWidth: 1, flexDirection: "row", alignItems: "center", gap: 8 }, dot: { width: 8, height: 8, borderRadius: 4, alignSelf: "flex-start", marginTop: 8 }, documentBody: { flex: 1, minWidth: 0, gap: 2 }, rowTitle: { fontSize: 15, lineHeight: 21 }, rowMessage: { fontSize: 13, lineHeight: 18.85 }, meta: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 }, metaText: { fontSize: 12, lineHeight: 16.8 }, readTarget: { minHeight: 44, minWidth: 44, paddingHorizontal: 2, borderWidth: 1, borderRadius: 24, marginRight: 5, alignSelf: "center", justifyContent: "center" }, readTargetLarge: { marginLeft: 24, marginBottom: 6 }, readPill: { minHeight: 32, paddingHorizontal: 10, borderWidth: 1, borderRadius: 24, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 }, readText: { fontSize: 13, lineHeight: 19, fontWeight: "700" },
  notice: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, flexDirection: "row", alignItems: "flex-start", gap: 8 }, noticeText: { fontSize: 13, lineHeight: 19, flexShrink: 1 }, actionError: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 6 }, errorHeading: { flexDirection: "row", alignItems: "flex-start", gap: 6 }, errorTitle: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: "700" }, errorActions: { flexDirection: "row", justifyContent: "flex-end", flexWrap: "wrap", gap: 4 }, refreshError: { marginHorizontal: 16, marginTop: 8, padding: 10, borderWidth: 1, borderRadius: 12, flexDirection: "row", alignItems: "center", gap: 8 }, feedback: { padding: 16, borderWidth: 1, borderRadius: 16, gap: 8 }, feedbackTitle: { fontSize: 15, lineHeight: 21, fontWeight: "700" }, skeletonGroup: { borderWidth: 1, borderRadius: 16, overflow: "hidden" }, skeleton: { minHeight: 84, paddingVertical: 14, paddingLeft: 28, paddingRight: 16, gap: 8 }, pager: { marginTop: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
});
