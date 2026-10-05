import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { FlatList, Keyboard, KeyboardAvoidingView, Platform, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { documentFolders, documentLibraryPath, documentPeriodError, documentStatuses, documentStatusLabels, formatDocumentDate,
  type DocumentFolder, type DocumentLibraryFilters, type LibraryDocument } from "@/lib/document-library";
import { useHomeTheme as useTheme } from "@/lib/home-theme";
import { useDocumentLibrary } from "@/lib/use-document-library";

type Icon = keyof typeof Feather.glyphMap;
export function DocumentLibraryScreen() {
  const p = useLocalSearchParams<{ folder?: string; status?: string; q?: string; dateFrom?: string; dateTo?: string; sort?: string; page?: string }>();
  const folder: DocumentFolder = p.folder === "drafts" || p.folder === "completed" ? p.folder : "sent";
  const status = documentStatuses[folder].some(o => o.value === p.status) ? p.status! : "all";
  const requestedPage = Number(p.page);
  return <LibraryContent filters={{ folder, status, query: typeof p.q === "string" ? p.q : "", dateFrom: typeof p.dateFrom === "string" ? p.dateFrom : "",
    dateTo: typeof p.dateTo === "string" ? p.dateTo : "", sort: p.sort === "oldest" ? "oldest" : "latest", page: Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1 }} />;
}
function LibraryContent({ filters }: { filters: DocumentLibraryFilters }) {
  const theme = useTheme();
  const { folder, status, query, dateFrom, dateTo, sort } = filters;
  const path = documentLibraryPath(filters);
  const { data, loading, refreshing, error, reload } = useDocumentLibrary(path);
  const list = useRef<FlatList<LibraryDocument>>(null), startInput = useRef<TextInput>(null), endInput = useRef<TextInput>(null), periodButton = useRef<View>(null), periodY = useRef(0);
  const [search, setSearch] = useState(query), [from, setFrom] = useState(dateFrom), [to, setTo] = useState(dateTo);
  const [dateError, setDateError] = useState<string | null>(null), [errorField, setErrorField] = useState<"from" | "to" | null>(null);
  const [showPeriod, setShowPeriod] = useState(false), [searchFocused, setSearchFocused] = useState(false);
  useEffect(() => { list.current?.scrollToOffset({ offset: 0, animated: false }); }, [path]);
  const inputScope = JSON.stringify([folder, query, dateFrom, dateTo]);
  const [previousInputScope, setPreviousInputScope] = useState(inputScope);
  // Reset staged input only when applied route conditions change, not on refresh.
  if (previousInputScope !== inputScope) {
    setPreviousInputScope(inputScope); setSearch(query); setFrom(dateFrom); setTo(dateTo);
    setDateError(null); setErrorField(null); setShowPeriod(false);
  }
  const update = (values: Record<string, string>) => router.setParams({ page: "1", ...values });
  const submitSearch = () => { Keyboard.dismiss(); update({ q: search.trim() }); };
  const closePeriod = () => { Keyboard.dismiss(); setShowPeriod(false); setFrom(dateFrom); setTo(dateTo); setDateError(null); setErrorField(null); periodButton.current?.focus?.(); };
  const applyPeriod = () => {
    const message = documentPeriodError(from, to); setDateError(message);
    if (message) {
      const field = !documentPeriodError(from, "") && documentPeriodError("", to) ? "to" : "from";
      setErrorField(field);
      // Focus the committed error field, after the list header has rerendered.
      requestAnimationFrame(() => (field === "to" ? endInput : startInput).current?.focus());
      return;
    }
    Keyboard.dismiss(); update({ dateFrom: from, dateTo: to }); setShowPeriod(false); periodButton.current?.focus?.();
  };
  const filtered = !!(query || dateFrom || dateTo || status !== "all");
  const reset = () => { Keyboard.dismiss(); setSearch(""); setFrom(""); setTo(""); setDateError(null); setErrorField(null); setShowPeriod(false); update({ q: "", status: "all", dateFrom: "", dateTo: "", sort: "latest" }); };
  const basis = folder === "drafts" ? "수정일" : folder === "completed" ? "완료일" : "상신일";
  const folderLabel = documentFolders.find(o => o.value === folder)!.label;
  const appliedPeriod = dateFrom || dateTo ? `${dateFrom || "처음"} ~ ${dateTo || "전체"}` : "전체 기간";
  const periodName = dateFrom || dateTo ? `${dateFrom ? dateFrom.slice(5).replace("-", ".") : "처음"} ~ ${dateTo ? dateTo.slice(5).replace("-", ".") : "전체"}` : "기간";
  const countLine = data ? `${folderLabel} · ${query ? `‘${query.length > 12 ? query.slice(0, 12) + "…" : query}’ ` : ""}${filtered ? "검색 결과 " : ""}${data.total.toLocaleString("ko-KR")}건` : `${folderLabel} · ${error ? "조회 실패" : "불러오는 중"}`;
  const header = <View style={styles.controls}>
    <View accessibilityLabel="문서함 분류" style={[styles.folders, { backgroundColor: theme.surfaceMuted }]}>
      {documentFolders.map(o => <Choice key={o.value} label={o.label} selected={folder === o.value} folder onPress={() => { Keyboard.dismiss(); update({ folder: o.value, status: "all", dateFrom: "", dateTo: "" }); }} />)}
    </View>
    <View style={styles.searchRow}>
      <View style={[styles.searchField, { backgroundColor: theme.surface, borderColor: searchFocused ? theme.accent : theme.controlBorder }]}>
        <Feather aria-hidden accessible={false} name="search" size={18} color={theme.muted} />
        <TextInput accessibilityLabel="문서 검색" accessibilityHint="제목·문서번호·분류·기안자, 최대 100자. 검색 버튼을 누르면 적용됩니다."
          placeholder="제목·문서번호·분류·기안자" placeholderTextColor={theme.muted} value={search} onChangeText={setSearch} onSubmitEditing={submitSearch} returnKeyType="search" maxLength={100}
          onFocus={() => setSearchFocused(true)} onBlur={() => setSearchFocused(false)} autoCapitalize="none" autoCorrect={false} style={[styles.searchInput, { color: theme.text }]} />
        {search ? <Action label="" icon="x" accessibilityLabel="검색어 지우기" onPress={() => setSearch("")} /> : null}
      </View><Action label="검색" outlined onPress={submitSearch} />
    </View>
    <View accessibilityLabel="상태 필터" style={styles.statusRow}>{documentStatuses[folder].map(o => <Choice key={o.value} label={o.label} selected={status === o.value} onPress={() => update({ status: o.value })} />)}</View>
    <View style={styles.toolsRow}>
      <Action ref={periodButton} label={periodName} icon="calendar" trailingIcon={showPeriod ? "chevron-up" : "chevron-down"} accessibilityLabel={`${basis} 기간: ${appliedPeriod}`} expanded={showPeriod} selected={!!(dateFrom || dateTo)}
        onPress={() => { if (showPeriod) closePeriod(); else { setFrom(dateFrom); setTo(dateTo); setDateError(null); setErrorField(null); setShowPeriod(true); } }} />
      <Action label={sort === "latest" ? "최신순" : "오래된순"} icon="arrow-down" accessibilityLabel={`정렬: ${sort === "latest" ? "최신순, 오래된순으로 변경" : "오래된순, 최신순으로 변경"}`} onPress={() => update({ sort: sort === "latest" ? "oldest" : "latest" })} />
      {filtered ? <Action label="초기화" icon="rotate-ccw" accessibilityLabel="검색 조건 초기화" onPress={reset} /> : null}
      {folder === "drafts" ? <Action label="작성 복구" icon="rotate-ccw" outlined accessibilityLabel="작성 복구, 별도 보관된 미확정 작성 입력 확인" onPress={() => router.push("/drafts/recovery")} /> : null}
    </View>
    {showPeriod ? <View onLayout={e => { periodY.current = e.nativeEvent.layout.y; }} style={[styles.period, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.periodHeading}><Text accessibilityRole="header" aria-level={2} style={[styles.smallLabel, { color: theme.text }]}>{basis} 기간</Text><Text style={[styles.hint, { color: theme.secondary }]}>적용됨: {appliedPeriod}</Text></View>
      <View style={styles.dateFields}>
        <DateField ref={startInput} label="시작일" value={from} error={errorField === "from"} onChange={setFrom} onFocus={() => list.current?.scrollToOffset({ offset: Math.max(0, periodY.current - 8), animated: false })} />
        <DateField ref={endInput} label="종료일" value={to} error={errorField === "to"} onChange={setTo} onSubmit={applyPeriod} onFocus={() => list.current?.scrollToOffset({ offset: Math.max(0, periodY.current - 8), animated: false })} />
      </View>
      {dateError ? <Text accessibilityRole="alert" style={[styles.detail, { color: theme.danger }]}>{dateError}</Text> : from !== dateFrom || to !== dateTo ? <Text style={[styles.hint, { color: theme.secondary }]}>적용하지 않은 변경이 있어요.</Text> : null}
      <View style={styles.periodActions}><Action label="취소" onPress={closePeriod} /><Action label="지우기" outlined onPress={() => { Keyboard.dismiss(); setFrom(""); setTo(""); setDateError(null); setErrorField(null); setShowPeriod(false); update({ dateFrom: "", dateTo: "" }); periodButton.current?.focus?.(); }} /><Action label="적용" filled onPress={applyPeriod} /></View>
      <Text style={[styles.hint, { color: theme.secondary }]}>한국 시간 기준 · 한쪽 날짜만 입력해도 조회할 수 있어요.</Text>
    </View> : null}
  </View>;
  const documents = data?.documents ?? [];
  return <SafeAreaView edges={["top", "left", "right"]} style={[styles.page, { backgroundColor: theme.background }]}>
    <View style={{ borderBottomWidth: 1, borderBottomColor: theme.border }}><View style={styles.heading}>
      <View style={styles.headingBody}><Text accessibilityRole="header" aria-level={1} style={[styles.title, { color: theme.text }]}>문서함</Text><Text accessibilityLiveRegion="polite" style={[styles.countLine, { color: theme.secondary }]}>{countLine}</Text></View>
      <Action label="새 기안" icon="edit-3" filled onPress={() => router.push("/drafts/new")} />
    </View></View>
    {error && data ? <View accessibilityRole="alert" style={[styles.refreshError, { backgroundColor: theme.surface, borderColor: theme.danger }]}>
      <Feather aria-hidden accessible={false} name="alert-circle" size={18} color={theme.danger} /><View style={{ flex: 1, minWidth: 0 }}><Text style={[styles.smallLabel, { color: theme.danger }]}>새로고침 실패</Text><Text style={[styles.hint, { color: theme.secondary }]}>이전에 불러온 목록을 표시 중</Text></View><Action label="다시 시도" selected onPress={reload} disabled={loading} />
    </View> : null}
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <FlatList ref={list} data={documents} keyExtractor={item => item.id} style={styles.page} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === "web" ? "none" : "on-drag"} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={theme.accent} />} ListHeaderComponent={header}
        renderItem={({ item, index }) => <DocumentRow document={item} folder={folder} first={index === 0} last={index === documents.length - 1} />}
        ListEmptyComponent={loading ? <Loading /> : error ? <View accessibilityRole="alert" style={[styles.feedback, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.feedbackTitle, { color: theme.text }]}>문서 목록을 불러오지 못했어요</Text><Text style={[styles.detail, { color: theme.secondary }]}>{error}</Text><Text style={[styles.hint, { color: theme.secondary }]}>입력한 검색 조건은 그대로예요.</Text><Action label="다시 시도" outlined onPress={reload} />
        </View> : <View accessibilityRole="text" style={[styles.feedback, { backgroundColor: theme.surface, borderColor: filtered ? theme.controlBorder : theme.border }]}>
          <Text style={[styles.feedbackTitle, { color: theme.text }]}>{filtered ? "조건에 맞는 문서가 없어요" : folder === "drafts" ? "임시저장·회수 문서가 없어요" : folder === "completed" ? "완료된 문서가 없어요" : "제출한 문서가 없어요"}</Text>
          <Text style={[styles.detail, { color: theme.secondary }]}>{filtered ? "검색어·상태·기간을 바꾸거나 조건을 초기화해 보세요." : folder === "drafts" ? "작성 중 저장하거나 회수한 문서가 여기에 표시돼요." : folder === "completed" ? "승인 또는 반려가 끝난 문서가 여기에 표시돼요." : "상신한 문서가 여기에 표시돼요. 새 기안으로 문서를 올릴 수 있어요."}</Text>
          {filtered ? <View style={{ alignSelf: "flex-start", marginTop: 8 }}><Action label="조건 초기화" outlined onPress={reset} /></View> : null}
        </View>}
        ListFooterComponent={data && data.totalPages > 1 ? <View style={styles.pager}><Action label="이전" icon="chevron-left" outlined disabled={loading || data.page <= 1} onPress={() => router.setParams({ page: String(data.page - 1) })} /><Text style={[styles.countLine, { color: theme.secondary }]}>{data.page} / {data.totalPages} 페이지</Text><Action label="다음" trailingIcon="chevron-right" outlined disabled={loading || data.page >= data.totalPages} onPress={() => router.setParams({ page: String(data.page + 1) })} /></View> : null} />
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
function Action({ label, icon, trailingIcon, onPress, filled, outlined, disabled, selected, expanded, accessibilityLabel, ref }: {
  label: string; icon?: Icon; trailingIcon?: Icon; onPress: () => void; filled?: boolean; outlined?: boolean; disabled?: boolean; selected?: boolean; expanded?: boolean; accessibilityLabel?: string; ref?: React.Ref<View>;
}) {
  const theme = useTheme(), [focused, setFocused] = useState(false);
  const color = filled ? "#FFFFFF" : selected ? theme.accent : theme.text;
  return <Pressable ref={ref} accessibilityRole="button" accessibilityLabel={accessibilityLabel || label} accessibilityState={{ disabled: !!disabled, expanded }} disabled={disabled}
    onPress={onPress} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={({ pressed }) => [styles.action, (filled || outlined) && { paddingHorizontal: 14 }, label === "새 기안" && { minWidth: 96 }, !label && { width: 44, paddingHorizontal: 0 },
      { backgroundColor: filled ? theme.actionFill : pressed || focused ? theme.accentSoft : outlined ? theme.surface : "transparent", borderColor: focused ? filled ? "#FFFFFF" : theme.accent : outlined ? theme.controlBorder : "transparent", opacity: disabled ? 0.5 : pressed ? 0.8 : 1 }]}>
    {icon ? <Feather aria-hidden accessible={false} name={icon} size={18} color={color} /> : null}{label ? <Text style={[styles.actionText, { color, fontSize: filled ? 15 : 14 }]}>{label}</Text> : null}{trailingIcon ? <Feather aria-hidden accessible={false} name={trailingIcon} size={16} color={color} /> : null}
  </Pressable>;
}
function Choice({ label, selected, onPress, folder = false }: { label: string; selected: boolean; onPress: () => void; folder?: boolean }) {
  const theme = useTheme(), [focused, setFocused] = useState(false);
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected }} onPress={onPress} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={[styles.choiceTarget, folder && { flex: 1 }]}>
    {({ pressed }) => <View style={[folder ? styles.folderChoice : styles.statusChoice, { borderColor: focused ? theme.accent : selected ? folder ? theme.controlBorder : theme.accent : folder ? "transparent" : theme.border,
      backgroundColor: folder ? selected ? theme.surface : pressed ? theme.accentSoft : "transparent" : selected || pressed ? theme.accentSoft : theme.surface }]}><Text style={[styles.choiceText, { color: folder ? selected ? theme.text : theme.secondary : selected ? theme.accent : theme.secondary, fontWeight: selected ? "700" : "500" }]}>{label}</Text></View>}
  </Pressable>;
}
function DateField({ label, value, error, onChange, onFocus, onSubmit, ref }: { label: string; value: string; error: boolean; onChange: (value: string) => void; onFocus: () => void; onSubmit?: () => void; ref: React.Ref<TextInput> }) {
  const theme = useTheme(), [focused, setFocused] = useState(false);
  return <View style={styles.dateField}><Text style={[styles.smallLabel, { color: theme.secondary }]}>{label}</Text><TextInput ref={ref} accessibilityLabel={`기간 ${label}`} aria-invalid={error} placeholder="YYYY-MM-DD" placeholderTextColor={theme.muted} value={value}
    onChangeText={next => { const digits = next.replace(/[^0-9]/g, "").slice(0, 8); onChange(digits.length > 6 ? `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}` : digits.length > 4 ? `${digits.slice(0, 4)}-${digits.slice(4)}` : digits); }}
    autoCapitalize="none" autoCorrect={false} inputMode="numeric" maxLength={10} returnKeyType="done" onSubmitEditing={onSubmit} onFocus={() => { setFocused(true); onFocus(); }} onBlur={() => setFocused(false)}
    style={[styles.dateInput, { color: theme.text, borderColor: error ? theme.danger : focused ? theme.accent : theme.controlBorder }]} /></View>;
}
function DocumentRow({ document: d, folder, first, last }: { document: LibraryDocument; folder: DocumentFolder; first: boolean; last: boolean }) {
  const theme = useTheme(), [focused, setFocused] = useState(false);
  const editable = d.status === "draft" || d.status === "recalled", active = d.status === "submitted" || d.status === "in_progress";
  const date = folder === "drafts" ? d.updatedAt : folder === "completed" ? d.completedAt ?? d.submittedAt ?? d.createdAt : d.submittedAt ?? d.createdAt;
  const prefix = folder === "drafts" ? "수정" : folder === "completed" ? "완료" : "상신";
  const status = d.status === "submitted" ? "결재 대기" : documentStatusLabels[d.status] ?? d.status;
  const person = folder === "completed" ? `기안 ${d.drafterName}` : active && d.currentApproverName ? `결재자 ${d.currentApproverName}` : "";
  const foreground = d.status === "rejected" ? theme.danger : d.status === "approved" ? theme.success : d.status === "submitted" ? theme.accent : theme.secondary;
  const background = d.status === "rejected" ? theme.dangerSoft : d.status === "submitted" ? theme.accentSoft : theme.surfaceMuted;
  return <Pressable accessibilityRole="link" accessibilityLabel={`${d.title}, ${status}, ${d.documentNo || d.category}, ${prefix} ${formatDocumentDate(date)}${person ? `, ${person}` : ""}${d.attachmentCount ? `, 첨부 ${d.attachmentCount}개` : ""}, ${editable ? "계속 작성" : "문서 열기"}`}
    onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onPress={() => router.push((editable ? "/drafts/" : "/documents/") + d.id)} style={({ pressed }) => [styles.document, first && styles.firstDocument, last && styles.lastDocument, { backgroundColor: pressed || focused ? theme.surfaceMuted : theme.surface, borderColor: focused ? theme.accent : theme.border }]}>
    <View style={styles.documentBody}><Text numberOfLines={2} style={[styles.documentTitle, { color: theme.text }]}>{d.title}</Text>
      <View style={styles.documentMeta}><View style={[styles.badge, { backgroundColor: d.status === "recalled" ? "transparent" : background, borderColor: d.status === "recalled" ? theme.controlBorder : "transparent" }]}><Text style={[styles.badgeText, { color: foreground }]}>{status}</Text></View><Text style={[styles.metaText, { color: theme.secondary }]}>{d.documentNo || d.category}</Text>{d.documentNo ? <><Text aria-hidden style={[styles.metaText, { color: theme.secondary }]}>·</Text><Text style={[styles.metaText, { color: theme.secondary }]}>{d.category}</Text></> : null}</View>
      <View style={styles.documentMeta}><Text style={[styles.metaText, { color: theme.secondary }]}>{prefix} {formatDocumentDate(date)}</Text>{person ? <><Text aria-hidden style={[styles.metaText, { color: theme.secondary }]}>·</Text><Text style={[styles.metaText, { color: theme.secondary }]}>{person}</Text></> : null}{d.attachmentCount ? <><Text aria-hidden style={[styles.metaText, { color: theme.secondary }]}>·</Text><View style={styles.attachment}><Feather aria-hidden accessible={false} name="paperclip" size={14} color={theme.secondary} /><Text style={[styles.metaText, { color: theme.secondary }]}>{d.attachmentCount}</Text></View></> : null}</View>
    </View><Feather aria-hidden accessible={false} name={editable ? "edit-3" : "chevron-right"} size={18} color={theme.muted} />
  </Pressable>;
}
function Loading() {
  const theme = useTheme();
  return <View accessibilityLabel="문서 목록을 불러오는 중" accessibilityRole="progressbar" style={[styles.loading, { backgroundColor: theme.surface, borderColor: theme.border }]}>{[0, 1, 2, 3, 4, 5].map(i => <View key={i} style={[styles.skeletonRow, { borderTopColor: theme.border, borderTopWidth: i ? 1 : 0 }]}><View style={{ width: i % 2 ? "62%" : "78%", height: 14, borderRadius: 7, backgroundColor: theme.surfaceMuted }} /><View style={{ width: 140, height: 11, borderRadius: 6, backgroundColor: theme.surfaceMuted }} /><View style={{ width: 190, height: 11, borderRadius: 6, backgroundColor: theme.surfaceMuted }} /></View>)}</View>;
}
const styles = StyleSheet.create({
  page: { flex: 1 }, heading: { minHeight: 64, paddingVertical: 8, paddingHorizontal: 16, maxWidth: 720, width: "100%", alignSelf: "center", flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 12 }, headingBody: { flex: 1, minWidth: 100, gap: 1 }, title: { fontSize: 20, lineHeight: 28, fontWeight: "700", letterSpacing: -0.3 }, countLine: { fontSize: 13, lineHeight: 18, fontVariant: ["tabular-nums"] },
  content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16, maxWidth: 720, width: "100%", alignSelf: "center" }, controls: { gap: 8, paddingBottom: 8 }, folders: { flexDirection: "row", borderRadius: 13, padding: 3, gap: 3 }, choiceTarget: { minHeight: 44, minWidth: 44, justifyContent: "center" }, folderChoice: { flex: 1, minHeight: 44, paddingVertical: 4, paddingHorizontal: 6, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center" }, statusChoice: { paddingVertical: 5, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1 }, choiceText: { fontSize: 14, lineHeight: 20, textAlign: "center" },
  searchRow: { flexDirection: "row", alignItems: "stretch", gap: 8 }, searchField: { flex: 1, minWidth: 0, minHeight: 46, flexDirection: "row", alignItems: "center", paddingLeft: 12, borderWidth: 1, borderRadius: 12 }, searchInput: { flex: 1, minWidth: 0, minHeight: 44, paddingHorizontal: 8, paddingVertical: 0, fontSize: 15 }, statusRow: { flexDirection: "row", flexWrap: "wrap", columnGap: 6 }, toolsRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 4, marginTop: -4 }, action: { minHeight: 44, minWidth: 44, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }, actionText: { fontSize: 14, lineHeight: 20, fontWeight: "700" },
  period: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 8 }, periodHeading: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignItems: "baseline", gap: 4 }, dateFields: { flexDirection: "row", flexWrap: "wrap", gap: 8 }, dateField: { flex: 1, flexBasis: 130, minWidth: 0, gap: 4 }, dateInput: { minHeight: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, fontSize: 15, paddingVertical: 8 }, smallLabel: { fontSize: 13, lineHeight: 18, fontWeight: "700" }, hint: { fontSize: 12, lineHeight: 17 }, periodActions: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "flex-end" },
  document: { minHeight: 85, paddingVertical: 9, paddingLeft: 16, paddingRight: 10, borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, flexDirection: "row", alignItems: "center", gap: 8 }, firstDocument: { borderTopWidth: 1, borderTopLeftRadius: 16, borderTopRightRadius: 16 }, lastDocument: { borderBottomLeftRadius: 16, borderBottomRightRadius: 16 }, documentBody: { flex: 1, minWidth: 0, gap: 3 }, documentTitle: { fontSize: 16, lineHeight: 22, fontWeight: "500" }, documentMeta: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 6, rowGap: 2 }, metaText: { fontSize: 13, lineHeight: 18, fontVariant: ["tabular-nums"], flexShrink: 1 }, badge: { paddingVertical: 1, paddingHorizontal: 7, borderRadius: 6, borderWidth: 1 }, badgeText: { fontSize: 12, lineHeight: 17, fontWeight: "700" }, attachment: { flexDirection: "row", alignItems: "center", gap: 2 },
  refreshError: { marginHorizontal: 16, marginTop: 8, paddingLeft: 12, paddingRight: 4, borderWidth: 1, borderRadius: 12, flexDirection: "row", alignItems: "center", gap: 8 }, feedback: { padding: 16, borderWidth: 1, borderRadius: 16, gap: 2 }, feedbackTitle: { fontSize: 15, lineHeight: 22, fontWeight: "700" }, detail: { fontSize: 13, lineHeight: 19 }, loading: { borderWidth: 1, borderRadius: 16, overflow: "hidden" }, skeletonRow: { height: 85, paddingHorizontal: 16, justifyContent: "center", gap: 9 }, pager: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", marginTop: 12, gap: 4 },
});
