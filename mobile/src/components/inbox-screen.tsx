import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Keyboard, KeyboardAvoidingView, Platform, Pressable, RefreshControl, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { documentPeriodError, formatDocumentDate } from "@/lib/document-library";
import { useHomeTheme as useTheme } from "@/lib/home-theme";
import { inboxPath, type InboxFilters, type InboxPage } from "@/lib/inbox";
import { useSession } from "@/lib/session";
import { useFocusedPage } from "@/lib/use-focused-page";
import type { InboxDocument } from "@/lib/types";

type Icon = keyof typeof Feather.glyphMap;
export function InboxScreen() {
  const p = useLocalSearchParams<{ q?: string; dateFrom?: string; dateTo?: string; sort?: string; page?: string }>();
  const { user, token } = useSession();
  const requestedPage = Number(p.page);
  if (!user?.canApproveDocuments) return <AccessFeedback />;
  // Remount staged input when the account changes, along with the response scope.
  return <InboxContent key={JSON.stringify([token, user.id])} filters={{ query: typeof p.q === "string" ? p.q : "", dateFrom: typeof p.dateFrom === "string" ? p.dateFrom : "",
    dateTo: typeof p.dateTo === "string" ? p.dateTo : "", sort: p.sort === "oldest" ? "oldest" : "latest", page: Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1 }} />;
}
function InboxContent({ filters }: { filters: InboxFilters }) {
  const theme = useTheme(), { width, fontScale } = useWindowDimensions();
  const largeText = width / fontScale < 300;
  const { query, dateFrom, dateTo, sort } = filters;
  const path = inboxPath(filters);
  const { data, loading, refreshing, error, errorStatus, loadedAt, reload } = useFocusedPage<InboxPage>(path);
  const list = useRef<FlatList<InboxDocument>>(null), searchInput = useRef<TextInput>(null), startInput = useRef<TextInput>(null), endInput = useRef<TextInput>(null), periodButton = useRef<View>(null);
  const periodY = useRef(0), dateFieldsY = useRef(0), startY = useRef(0), endY = useRef(0);
  const [search, setSearch] = useState(query), [from, setFrom] = useState(dateFrom), [to, setTo] = useState(dateTo);
  const [dateError, setDateError] = useState<string | null>(null), [errorField, setErrorField] = useState<"from" | "to" | null>(null);
  const [showPeriod, setShowPeriod] = useState(false), [searchFocused, setSearchFocused] = useState(false), [keyboardOpen, setKeyboardOpen] = useState(false);
  const [pageNotice, setPageNotice] = useState<{ message: string; totalPages: number } | null>(null);
  useEffect(() => { list.current?.scrollToOffset({ offset: 0, animated: false }); }, [path]);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", () => setKeyboardOpen(true));
    const hide = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", () => setKeyboardOpen(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  const [correctedScope, setCorrectedScope] = useState<string | null>(null);
  if (data && data.page !== filters.page && correctedScope !== path) {
    setCorrectedScope(path);
    setPageNotice({ message: `목록이 바뀌어 ${filters.page}페이지가 없어졌어요. ${data.page}/${data.totalPages}페이지를 보여드려요.`, totalPages: data.totalPages });
  }
  useEffect(() => { if (data && data.page !== filters.page) router.setParams({ page: String(data.page) }); }, [data, filters.page]);
  const blocked = errorStatus === 401 || errorStatus === 403;
  const inputScope = JSON.stringify([query, dateFrom, dateTo, blocked]);
  const [previousInputScope, setPreviousInputScope] = useState(inputScope);
  if (previousInputScope !== inputScope) {
    setPreviousInputScope(inputScope); setSearch(blocked ? "" : query); setFrom(blocked ? "" : dateFrom); setTo(blocked ? "" : dateTo);
    setDateError(null); setErrorField(null); setShowPeriod(false);
  }
  const update = (values: Record<string, string>) => { setPageNotice(null); router.setParams({ page: "1", ...values }); };
  const submitSearch = () => { Keyboard.dismiss(); update({ q: search.trim() }); };
  const closePeriod = () => { Keyboard.dismiss(); setShowPeriod(false); setFrom(dateFrom); setTo(dateTo); setDateError(null); setErrorField(null); periodButton.current?.focus?.(); };
  const applyPeriod = () => {
    const message = documentPeriodError(from, to); setDateError(message);
    if (message) {
      const field = !documentPeriodError(from, "") && documentPeriodError("", to) ? "to" : "from";
      setErrorField(field);
      requestAnimationFrame(() => (field === "to" ? endInput : startInput).current?.focus());
      return;
    }
    Keyboard.dismiss(); setShowPeriod(false); update({ dateFrom: from, dateTo: to }); periodButton.current?.focus?.();
  };
  const clearPeriod = () => { setFrom(""); setTo(""); setDateError(null); setErrorField(null); if (dateFrom || dateTo) update({ dateFrom: "", dateTo: "" }); };
  const reset = () => { Keyboard.dismiss(); setSearch(""); setFrom(""); setTo(""); setDateError(null); setErrorField(null); setShowPeriod(false); update({ q: "", dateFrom: "", dateTo: "", sort: "latest" }); };
  const filtered = !!(query || dateFrom || dateTo);
  const appliedPeriod = dateFrom || dateTo ? `${dateFrom || "처음"} ~ ${dateTo || "전체"}` : "전체 기간";
  const periodName = dateFrom || dateTo ? `${dateFrom ? dateFrom.slice(5).replace("-", ".") : ""} ~ ${dateTo ? dateTo.slice(5).replace("-", ".") : ""}` : "기간";
  const queryDirty = search.trim() !== query;
  const loadedTime = loadedAt ? new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Seoul" }).format(loadedAt) : "이전 조회";
  const countLine = data ? `${filtered ? "검색 결과" : "대기"} ${data.total.toLocaleString("ko-KR")}건${data.totalPages > 1 ? `${largeText ? "\n" : " · "}${data.page}/${data.totalPages.toLocaleString("ko-KR")} 페이지` : ""}${loading ? " · 갱신 중" : error ? ` · ${loadedTime} 기준` : ""}` : error ? "불러오지 못함" : filtered ? "검색 결과 불러오는 중" : "불러오는 중";
  if (errorStatus === 403 || errorStatus === 401) return <AccessFeedback expired={errorStatus === 401} denied />;
  const dockActions = showPeriod && keyboardOpen;
  const periodActions = <><Action label="취소" outlined onPress={closePeriod} /><Action label="적용" filled onPress={applyPeriod} /></>;
  const header = <View style={styles.controls}>
    <View style={styles.searchRow}>
      <View style={[styles.searchField, { backgroundColor: theme.surface, borderColor: searchFocused ? theme.accent : theme.controlBorder }]}>
        <Feather aria-hidden accessible={false} name="search" size={18} color={theme.muted} />
        <TextInput ref={searchInput} accessibilityLabel="받은결재 검색" accessibilityHint="제목·문서번호·분류·기안자, 최대 100자. 검색 버튼을 누르면 적용됩니다."
          placeholder={largeText ? "검색어" : "제목·문서번호·분류·기안자"} placeholderTextColor={theme.muted} value={search} onChangeText={setSearch} onSubmitEditing={submitSearch} returnKeyType="search" maxLength={100}
          onFocus={() => { setSearchFocused(true); list.current?.scrollToOffset({ offset: 0, animated: false }); }} onBlur={() => setSearchFocused(false)} autoCapitalize="none" autoCorrect={false} style={[styles.searchInput, { color: theme.text }]} />
        {search ? <Action label="" icon="x" accessibilityLabel="입력한 검색어 지우기" onPress={() => { setSearch(""); searchInput.current?.focus(); }} /> : null}
      </View><Action label="검색" outlined onPress={submitSearch} />
    </View>
    {queryDirty || largeText ? <Text style={[styles.hint, { color: theme.secondary }]}>{queryDirty ? query ? `적용된 검색어는 ‘${query}’예요. 검색을 눌러야 바뀐 검색어가 적용돼요.` : "아직 적용하지 않은 검색어예요. 검색을 누르면 적용돼요." : "제목·문서번호·분류·기안자로 검색해요."}</Text> : null}
    <View style={styles.toolsRow}>
      <Action compact={largeText} ref={periodButton} label={periodName} icon="calendar" trailingIcon={showPeriod ? "chevron-up" : "chevron-down"} accessibilityLabel={`상신일 기간: ${appliedPeriod}`} expanded={showPeriod} selected={!!(dateFrom || dateTo)}
        onPress={() => { if (showPeriod) closePeriod(); else { setFrom(dateFrom); setTo(dateTo); setDateError(null); setErrorField(null); setShowPeriod(true); } }} />
      <Action compact={largeText} label={sort === "latest" ? "최신순" : "오래된순"} icon={sort === "latest" ? "arrow-down" : "arrow-up"} accessibilityLabel={`정렬: ${sort === "latest" ? "최신순, 오래된순으로 변경" : "오래된순, 최신순으로 변경"}`} onPress={() => { Keyboard.dismiss(); update({ sort: sort === "latest" ? "oldest" : "latest" }); }} />
      {filtered || sort !== "latest" ? <View style={{ marginLeft: "auto" }}><Action label="초기화" icon="rotate-ccw" selected accessibilityLabel="검색·기간 초기화, 최신순 1페이지로" onPress={reset} /></View> : null}
    </View>
    {showPeriod ? <View onLayout={e => { periodY.current = e.nativeEvent.layout.y; }} style={[styles.period, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.periodHeading}><Text accessibilityRole="header" aria-level={2} style={[styles.smallLabel, { color: theme.text }]}>상신일 기간 · 한국 날짜</Text><Text style={[styles.hint, { color: theme.secondary }]}>적용됨: {appliedPeriod}</Text></View>
      <View style={styles.dateFields} onLayout={e => { dateFieldsY.current = e.nativeEvent.layout.y; }}>
        <DateField ref={startInput} label="시작일" value={from} error={errorField === "from" ? dateError : null} onChange={setFrom} onLayout={y => { startY.current = y; }} onFocus={() => list.current?.scrollToOffset({ offset: Math.max(0, periodY.current + dateFieldsY.current + startY.current - 8), animated: false })} onCancel={closePeriod} />
        <DateField ref={endInput} label="종료일" value={to} error={errorField === "to" ? dateError : null} onChange={setTo} onSubmit={applyPeriod} onLayout={y => { endY.current = y; }} onFocus={() => list.current?.scrollToOffset({ offset: Math.max(0, periodY.current + dateFieldsY.current + endY.current - 8), animated: false })} onCancel={closePeriod} />
      </View>
      {!dateError && (from !== dateFrom || to !== dateTo) ? <Text style={[styles.hint, { color: theme.secondary }]}>적용하지 않은 변경이 있어요. 취소하면 적용된 기간이 그대로 유지돼요.</Text> : null}
      <View style={styles.periodActions}><View style={{ marginRight: "auto" }}><Action label="기간 지우기" selected onPress={clearPeriod} /></View>{dockActions ? null : periodActions}</View>
      <Text style={[styles.hint, { color: theme.secondary }]}>한쪽 날짜만 입력해도 조회할 수 있어요.</Text>
    </View> : null}
    {pageNotice && data?.totalPages === pageNotice.totalPages ? <View accessibilityRole="text" accessibilityLiveRegion="polite" style={[styles.notice, { backgroundColor: theme.accentSoft }]}><Feather aria-hidden accessible={false} name="info" size={16} color={theme.accent} /><Text style={[styles.detail, { color: theme.text, flex: 1 }]}>{pageNotice.message}</Text></View> : null}
  </View>;
  const documents = data?.documents ?? [];
  return <SafeAreaView edges={["top", "left", "right"]} style={[styles.page, { backgroundColor: theme.background }]}>
    <View style={{ borderBottomWidth: 1, borderBottomColor: theme.border }}><View style={styles.heading}>
      <View style={styles.headingBody}><Text accessibilityRole="header" aria-level={1} style={[styles.title, { color: theme.text }]}>받은결재</Text><Text accessibilityLiveRegion="polite" style={[styles.countLine, { color: theme.secondary }]}>{countLine}</Text></View>
      <Action label="" icon="refresh-cw" accessibilityLabel={loading ? "받은결재 새로고침 중" : "받은결재 새로고침, 같은 조건 유지"} disabled={loading} loading={loading && !!data} onPress={reload} />
    </View></View>
    {error && data ? <View accessibilityRole="alert" style={[styles.refreshError, { backgroundColor: theme.surface, borderColor: theme.danger }]}>
      <Feather aria-hidden accessible={false} name="alert-circle" size={18} color={theme.danger} /><Text style={[styles.detail, { flex: 1, minWidth: 0, color: theme.secondary }]}><Text style={{ fontWeight: "700", color: theme.danger }}>새로고침 실패</Text> · {loadedTime}에 불러온 이전 목록이에요. 그 뒤 처리된 문서가 있을 수 있어요.</Text><Action label="다시 시도" selected onPress={reload} disabled={loading} />
    </View> : null}
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <FlatList ref={list} data={documents} keyExtractor={item => item.id} style={styles.page} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === "web" ? "none" : "on-drag"} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={theme.accent} />} ListHeaderComponent={header}
        renderItem={({ item, index }) => <DocumentRow document={item} first={index === 0} last={index === documents.length - 1} largeText={largeText} />}
        ListEmptyComponent={loading ? <Loading /> : error ? <View accessibilityRole="alert" style={[styles.feedback, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Feather aria-hidden accessible={false} name="alert-circle" size={20} color={theme.danger} /><Text style={[styles.feedbackTitle, { color: theme.text }]}>받은결재를 불러오지 못했어요</Text><Text style={[styles.detail, { color: theme.secondary }]}>{error}</Text>{filtered ? <Text style={[styles.hint, { color: theme.secondary }]}>입력한 검색 조건은 그대로예요.</Text> : null}<Action label="다시 시도" outlined onPress={reload} />
        </View> : <View accessibilityRole="text" style={[styles.feedback, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Feather aria-hidden accessible={false} name={filtered ? "search" : "inbox"} size={20} color={theme.muted} /><Text style={[styles.feedbackTitle, { color: theme.text }]}>{filtered ? "조건에 맞는 결재가 없어요" : "대기 중인 결재가 없어요"}</Text>
          <Text style={[styles.detail, { color: theme.secondary }]}>{filtered ? "검색어·상신일 기간을 바꾸거나 조건을 초기화해 보세요." : "새 결재가 도착하면 이 목록에 나타나요."}</Text>
          {filtered ? <Action label="조건 초기화" outlined onPress={reset} /> : null}
        </View>}
        ListFooterComponent={data && data.totalPages > 1 ? <View style={styles.pager}><Action label="이전" icon="chevron-left" outlined disabled={loading || data.page <= 1} onPress={() => { setPageNotice(null); router.setParams({ page: String(data.page - 1) }); }} /><Text style={[styles.countLine, { color: theme.secondary }]}>{data.page} / {data.totalPages} 페이지</Text><Action label="다음" trailingIcon="chevron-right" outlined disabled={loading || data.page >= data.totalPages} onPress={() => { setPageNotice(null); router.setParams({ page: String(data.page + 1) }); }} /></View> : null} />
      {dockActions ? <View style={[styles.keyboardActions, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>{periodActions}</View> : null}
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
function Action({ label, icon, trailingIcon, onPress, filled, outlined, disabled, selected, expanded, loading, accessibilityLabel, compact, ref }: {
  label: string; compact?: boolean; icon?: Icon; trailingIcon?: Icon; onPress: () => void; filled?: boolean; outlined?: boolean; disabled?: boolean; selected?: boolean; expanded?: boolean; loading?: boolean; accessibilityLabel?: string; ref?: React.Ref<View>;
}) {
  const theme = useTheme(), [focused, setFocused] = useState(false);
  const foreground = filled ? "#FFFFFF" : selected ? theme.accent : theme.text;
  return <Pressable ref={ref} accessibilityRole="button" accessibilityLabel={accessibilityLabel || label} accessibilityState={{ disabled: !!disabled, expanded, busy: loading }} disabled={disabled} onPress={onPress} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
    style={({ pressed }) => [styles.action, compact && { paddingHorizontal: 4, gap: 4 }, label === "검색" && styles.searchAction, !label && styles.iconAction, { opacity: disabled ? 0.6 : 1, borderColor: focused ? theme.accent : outlined ? theme.controlBorder : "transparent", backgroundColor: filled ? theme.actionFill : pressed || focused ? theme.surfaceMuted : outlined ? theme.surface : "transparent" }]}>
    {loading ? <ActivityIndicator size="small" color={foreground} /> : icon ? <Feather aria-hidden accessible={false} name={icon} size={label ? 18 : 20} color={foreground} /> : null}
    {label ? <Text style={[styles.actionText, label === "검색" && { fontSize: 15 }, { color: foreground }]}>{label}</Text> : null}{trailingIcon ? <Feather aria-hidden accessible={false} name={trailingIcon} size={16} color={foreground} /> : null}
  </Pressable>;
}
function DateField({ label, value, error, onChange, onFocus, onSubmit, onCancel, onLayout, ref }: {
  label: string; value: string; error: string | null; onChange: (value: string) => void; onFocus: () => void; onSubmit?: () => void; onCancel: () => void; onLayout: (y: number) => void; ref?: React.Ref<TextInput>;
}) {
  const theme = useTheme(), [focused, setFocused] = useState(false);
  return <View style={styles.dateField} onLayout={e => onLayout(e.nativeEvent.layout.y)}><Text style={[styles.smallLabel, { color: theme.secondary, fontWeight: "500" }]}>{label}</Text>
    <TextInput ref={ref} accessibilityLabel={`기간 ${label}`} accessibilityHint={`YYYY-MM-DD, 한국 날짜. ${error || "한쪽 날짜만 입력할 수 있어요."}`} aria-invalid={!!error} placeholder="YYYY-MM-DD" placeholderTextColor={theme.muted} value={value} onChangeText={onChange}
      onFocus={() => { setFocused(true); onFocus(); }} onBlur={() => setFocused(false)} onSubmitEditing={onSubmit} onKeyPress={e => { if (e.nativeEvent.key === "Escape") onCancel(); }} autoCapitalize="none" autoCorrect={false} maxLength={10} returnKeyType={onSubmit ? "search" : "next"}
      style={[styles.dateInput, { color: theme.text, borderColor: error ? theme.danger : focused ? theme.accent : theme.controlBorder }]} />
    {error ? <Text accessibilityRole="alert" style={[styles.detail, { color: theme.danger }]}>{error} {label}을 확인하세요.</Text> : null}
  </View>;
}
function DocumentRow({ document: d, first, last, largeText }: { document: InboxDocument; first: boolean; last: boolean; largeText: boolean }) {
  const theme = useTheme(), [focused, setFocused] = useState(false);
  const status = d.status === "in_progress" ? "결재 중" : "상신", step = typeof d.stepOrder === "number" && d.stepOrder > 1 ? `내 결재 단계 ${d.stepOrder}` : "";
  return <Pressable accessibilityRole="link" accessibilityLabel={`${d.title}, ${status}, 기안자 ${d.drafterName}${d.submittedAt ? `, 상신 ${formatDocumentDate(d.submittedAt)}` : ""}${d.documentNo ? `, 문서번호 ${d.documentNo}` : ""}${d.attachmentCount ? `, 첨부 ${d.attachmentCount}개` : ""}${step ? `, ${step}` : ""}, 문서 열기`}
    onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onPress={() => { Keyboard.dismiss(); router.push(`/documents/${d.id}`); }} style={({ pressed }) => [styles.document, first && styles.firstDocument, last && styles.lastDocument, { backgroundColor: pressed || focused ? theme.surfaceMuted : theme.surface, borderColor: focused ? theme.accent : theme.border }]}>
    <View style={styles.documentBody}><Text numberOfLines={largeText ? 5 : 3} style={[styles.documentTitle, { color: theme.text }]}>{d.title}</Text>
      <View style={styles.documentMeta}><View style={[styles.badge, { backgroundColor: d.status === "in_progress" ? theme.surfaceMuted : theme.accentSoft }]}><Text style={[styles.badgeText, { color: d.status === "in_progress" ? theme.secondary : theme.accent }]}>{status}</Text></View><Text style={[styles.metaText, { color: theme.secondary }]}>{d.drafterName}</Text>{d.submittedAt ? <><Text aria-hidden style={[styles.metaText, { color: theme.secondary }]}>·</Text><Text style={[styles.metaText, { color: theme.secondary }]}>{formatDocumentDate(d.submittedAt)}</Text></> : null}</View>
      {d.documentNo || d.attachmentCount > 0 || step ? <View style={styles.documentMeta}>{d.documentNo ? <Text style={[styles.smallMeta, { color: theme.secondary }]}>{d.documentNo}</Text> : null}{d.attachmentCount > 0 ? <>{d.documentNo ? <Text aria-hidden style={[styles.smallMeta, { color: theme.secondary }]}>·</Text> : null}<View style={styles.attachment}><Feather aria-hidden accessible={false} name="paperclip" size={13} color={theme.secondary} /><Text style={[styles.smallMeta, { color: theme.secondary }]}>{d.attachmentCount}</Text></View></> : null}{step ? <>{d.documentNo || d.attachmentCount ? <Text aria-hidden style={[styles.smallMeta, { color: theme.secondary }]}>·</Text> : null}<Text style={[styles.smallMeta, { color: theme.secondary }]}>{step}</Text></> : null}</View> : null}
    </View><Feather aria-hidden accessible={false} name="chevron-right" size={18} color={theme.muted} />
  </Pressable>;
}
function Loading() {
  const theme = useTheme();
  return <View accessibilityLabel="받은결재를 불러오는 중" accessibilityRole="progressbar" style={[styles.loading, { backgroundColor: theme.surface, borderColor: theme.border }]}>{[0, 1, 2, 3, 4, 5].map(i => <View key={i} style={[styles.skeletonRow, { borderTopColor: theme.border, borderTopWidth: i ? 1 : 0 }]}><View style={{ width: i % 2 ? "62%" : "78%", height: 14, borderRadius: 7, backgroundColor: theme.surfaceMuted }} /><View style={{ width: 140, height: 11, borderRadius: 6, backgroundColor: theme.surfaceMuted }} /><View style={{ width: 190, height: 11, borderRadius: 6, backgroundColor: theme.surfaceMuted }} /></View>)}</View>;
}
function AccessFeedback({ expired, denied }: { expired?: boolean; denied?: boolean }) {
  const theme = useTheme();
  return <SafeAreaView edges={["top", "left", "right"]} style={[styles.page, { backgroundColor: theme.background }]}><View style={styles.heading}><Text accessibilityRole="header" aria-level={1} style={[styles.title, { color: theme.text }]}>받은결재</Text></View><View style={styles.content}><View accessibilityRole="alert" style={[styles.feedback, { backgroundColor: theme.surface, borderColor: theme.border }]}>
    <Feather aria-hidden accessible={false} name="lock" size={20} color={denied ? theme.danger : theme.muted} /><Text style={[styles.feedbackTitle, { color: theme.text }]}>{expired ? "로그인이 만료됐어요" : denied ? "받은결재 권한이 확인되지 않아요" : "시설장만 사용할 수 있어요"}</Text>
    <Text style={[styles.detail, { color: theme.secondary }]}>{expired ? "보안을 위해 이전 목록을 지웠어요. 다시 로그인해 주세요." : denied ? "서버에서 접근을 거절해 이전 목록을 지웠어요. 직급이나 결재 권한이 바뀌었을 수 있어요." : "현재 직급이 시설장이고 결재 권한이 있는 직원에게 제공돼요."}</Text>
    <Action label={expired ? "다시 로그인" : "홈으로"} outlined onPress={() => router.replace(expired ? "/login" : "/")} />
  </View></View></SafeAreaView>;
}
const styles = StyleSheet.create({
  page: { flex: 1 }, heading: { minHeight: 60, paddingVertical: 6, paddingLeft: 16, paddingRight: 8, maxWidth: 720, width: "100%", alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 8 }, headingBody: { flex: 1, minWidth: 0, gap: 1 }, title: { fontSize: 20, lineHeight: 28, fontWeight: "700", letterSpacing: -0.3 }, countLine: { fontSize: 13, lineHeight: 18, fontVariant: ["tabular-nums"] },
  content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16, maxWidth: 720, width: "100%", alignSelf: "center" }, controls: { gap: 8, paddingBottom: 8 },
  searchRow: { flexDirection: "row", alignItems: "stretch", gap: 8 }, searchField: { flex: 1, minWidth: 0, minHeight: 46, flexDirection: "row", alignItems: "center", paddingLeft: 12, borderWidth: 1, borderRadius: 12 }, searchInput: { flex: 1, minWidth: 0, minHeight: 44, paddingHorizontal: 8, paddingVertical: 0, fontSize: 15 }, toolsRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 4, marginVertical: -2, marginLeft: -4 }, action: { minHeight: 44, minWidth: 44, paddingHorizontal: 8, paddingVertical: 6, borderWidth: 1, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }, searchAction: { paddingHorizontal: 14 }, iconAction: { width: 44, height: 44 }, actionText: { fontSize: 14, lineHeight: 20, fontWeight: "700" },
  period: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 8 }, periodHeading: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignItems: "baseline", gap: 4 }, dateFields: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, dateField: { flex: 1, flexBasis: 140, minWidth: 0, gap: 4 }, dateInput: { minHeight: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, fontSize: 15, paddingVertical: 8 }, smallLabel: { fontSize: 13, lineHeight: 18, fontWeight: "700" }, hint: { fontSize: 12, lineHeight: 17 }, periodActions: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "flex-end" }, keyboardActions: { borderTopWidth: 1, paddingHorizontal: 16, paddingVertical: 6, flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 8 },
  document: { minHeight: 84, paddingVertical: 10, paddingLeft: 16, paddingRight: 10, borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, flexDirection: "row", alignItems: "center", gap: 8 }, firstDocument: { borderTopWidth: 1, borderTopLeftRadius: 16, borderTopRightRadius: 16 }, lastDocument: { borderBottomLeftRadius: 16, borderBottomRightRadius: 16 }, documentBody: { flex: 1, minWidth: 0, gap: 3 }, documentTitle: { fontSize: 16, lineHeight: 22, fontWeight: "500" }, documentMeta: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 6, rowGap: 2 }, metaText: { fontSize: 13, lineHeight: 18, fontVariant: ["tabular-nums"], flexShrink: 1 }, smallMeta: { fontSize: 12, lineHeight: 17, fontVariant: ["tabular-nums"], flexShrink: 1 }, badge: { paddingVertical: 1, paddingHorizontal: 7, borderRadius: 6 }, badgeText: { fontSize: 12, lineHeight: 17, fontWeight: "700" }, attachment: { flexDirection: "row", alignItems: "center", gap: 2 },
  refreshError: { marginHorizontal: 16, marginTop: 8, paddingLeft: 12, paddingRight: 4, borderWidth: 1, borderRadius: 12, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }, notice: { padding: 12, borderRadius: 12, flexDirection: "row", gap: 8 }, feedback: { padding: 16, borderWidth: 1, borderRadius: 16, alignItems: "flex-start", gap: 6 }, feedbackTitle: { fontSize: 15, lineHeight: 22, fontWeight: "700" }, detail: { fontSize: 13, lineHeight: 19 }, loading: { borderWidth: 1, borderRadius: 16, overflow: "hidden" }, skeletonRow: { minHeight: 84, paddingHorizontal: 16, paddingVertical: 12, justifyContent: "center", gap: 9 }, pager: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", marginTop: 12, gap: 4 },
});
