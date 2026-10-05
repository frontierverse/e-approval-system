import { Feather } from "@expo/vector-icons";
import { useState, type ReactNode } from "react";
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useHomeTheme as useTheme } from "@/lib/home-theme";
import type { HomeDocument, HomeResponse, MobileUser } from "@/lib/types";

type Props = {
  user: MobileUser | null; data: HomeResponse | null; loading: boolean; refreshing: boolean; error: string | null;
  reload: () => void; openNew: () => void; openInbox: () => void; openSent: () => void;
  openActiveSent: () => void; openRecalled: () => void; openDocument: (id: string) => void; workShortcuts?: ReactNode;
};

const dayFormat = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" });
const clockFormat = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const shortDateFormat = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric" });
const headingDateFormat = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "short" });

function submittedTime(value: string | null) {
  if (!value) return "상신일 없음";
  const date = new Date(value);
  const now = new Date();
  const yesterday = new Date(now.getTime() - 86_400_000);
  const day = dayFormat.format(date);
  if (day === dayFormat.format(now)) return `오늘 ${clockFormat.format(date)}`;
  if (day === dayFormat.format(yesterday)) return `어제 ${clockFormat.format(date)}`;
  return day.slice(0, 4) === dayFormat.format(now).slice(0, 4) ? shortDateFormat.format(date) :
    new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric" }).format(date);
}

export function HomeDashboard(props: Props) {
  const theme = useTheme();
  const { user, data, loading, refreshing, error, reload } = props;
  // Both the authenticated user and server response must allow the approval queue.
  const canApprove = user?.canApproveDocuments === true && data?.canApproveDocuments === true;
  const userLine = [user?.name, user?.positionName, headingDateFormat.format(new Date())].filter(Boolean).join(" · ");
  return <SafeAreaView edges={["top", "left", "right"]} style={[styles.page, { backgroundColor: theme.background }]}>
    <View style={{ borderBottomWidth: 1, borderBottomColor: theme.border }}>
      <View style={styles.header}>
        <View style={[styles.symbol, { borderColor: theme.border }]}>
          <Image source={require("../../assets/branding/bajaul-home-symbol.png")} accessibilityLabel="바자울" accessibilityIgnoresInvertColors resizeMode="contain" style={styles.symbolImage} />
        </View>
        <View style={styles.heading}>
          <Text accessibilityRole="header" aria-level={1} style={[styles.title, { color: theme.text }]}>오늘의 업무</Text>
          <Text numberOfLines={1} style={[styles.userLine, { color: theme.secondary }]}>{userLine}</Text>
        </View>
        <HomeAction label="새 기안" icon="edit-3" filled onPress={props.openNew} />
      </View>
    </View>
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={theme.accent} />}>
      {error && data ? <View accessibilityRole="alert" style={[styles.refreshError, { backgroundColor: theme.surface, borderColor: theme.danger }]}>
        <Feather aria-hidden accessible={false} name="alert-circle" size={20} color={theme.danger} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.feedbackTitle, { color: theme.danger }]}>새로고침하지 못했어요</Text>
          <Text style={[styles.feedbackDetail, { color: theme.secondary }]}>이전에 불러온 정보를 보여주고 있어요</Text>
        </View>
        <HomeAction label="다시 시도" onPress={reload} disabled={refreshing} />
      </View> : null}
      {loading && !data ? <HomeLoading canApprove={user?.canApproveDocuments === true} /> : error && !data ?
        <View accessibilityRole="alert" style={[styles.error, { borderColor: theme.border, backgroundColor: theme.surface }]}>
          <View style={styles.errorBody}>
            <Feather aria-hidden accessible={false} name="alert-circle" size={22} color={theme.danger} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.errorTitle, { color: theme.text }]}>오늘의 업무를 불러오지 못했어요</Text>
              <Text style={[styles.feedbackDetail, { color: theme.secondary }]}>{error}</Text>
            </View>
          </View>
          <HomeAction label="다시 시도" onPress={reload} disabled={refreshing} surface />
        </View> : data ? <>
          <View style={styles.summaryRow}>
            <Metric label={canApprove ? "처리할 결재" : "내 상신 진행"} count={canApprove ? data.counts.activeInbox ?? 0 : data.counts.activeSent}
              highlighted={canApprove} onPress={canApprove ? props.openInbox : props.openActiveSent} />
            <Metric label={canApprove ? "내 상신 진행" : "회수 문서"} count={canApprove ? data.counts.activeSent : data.counts.recalled}
              onPress={canApprove ? props.openActiveSent : props.openRecalled} />
          </View>
          {canApprove ? <DocumentSection title="처리할 결재" total={data.counts.activeInbox ?? 0} documents={data.inboxDocuments ?? []}
            mode="inbox" openAll={props.openInbox} openDocument={props.openDocument}
            emptyTitle="처리할 결재가 없어요" emptyDetail="새 결재 요청이 오면 여기에 표시돼요." /> : null}
          <DocumentSection title="내가 올린 진행 문서" total={data.counts.activeSent} documents={data.sentDocuments}
            mode="sent" openAll={props.openSent} openDocument={props.openDocument}
            emptyTitle="진행 중인 상신 문서가 없어요" emptyDetail="상단 새 기안으로 문서를 올릴 수 있어요." />
          {props.workShortcuts}
        </> : null}
    </ScrollView>
  </SafeAreaView>;
}

function HomeAction({ label, icon, filled, surface, onPress, disabled }: {
  label: string; icon?: keyof typeof Feather.glyphMap; filled?: boolean; surface?: boolean; onPress: () => void; disabled?: boolean;
}) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const color = filled ? "#FFFFFF" : surface ? theme.text : theme.accent;
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }} disabled={disabled}
    onPress={onPress} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
    style={({ pressed }) => [styles.action, surface && { alignSelf: "stretch" },
      { backgroundColor: filled ? theme.actionFill : surface ? theme.surfaceMuted : pressed ? theme.accentSoft : "transparent",
        borderColor: focused ? (filled ? "#FFFFFF" : theme.accent) : surface ? theme.border : "transparent", opacity: disabled ? 0.5 : pressed ? 0.8 : 1 }]}>
    {icon ? <Feather aria-hidden accessible={false} name={icon} size={18} color={color} /> : null}
    <Text style={[styles.actionText, { color }]}>{label}</Text>
  </Pressable>;
}

function Metric({ label, count, highlighted, onPress }: { label: string; count: number; highlighted?: boolean; onPress: () => void }) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  return <Pressable accessibilityRole="button" accessibilityLabel={`${label} ${count.toLocaleString("ko-KR")}건, 목록 보기`}
    onPress={onPress} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
    style={({ pressed }) => [styles.metric, { backgroundColor: pressed ? theme.surfaceMuted : theme.surface, borderColor: focused ? theme.accent : theme.border }]}>
    <View style={styles.metricLabelRow}><Text style={[styles.metricLabel, { color: theme.secondary }]}>{label}</Text><Feather aria-hidden accessible={false} name="chevron-right" size={16} color={theme.muted} /></View>
    <View style={styles.countRow}><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}
      style={[styles.count, { color: highlighted && count > 0 ? theme.accent : theme.text }]}>{count.toLocaleString("ko-KR")}</Text>
      <Text style={[styles.unit, { color: theme.secondary }]}>건</Text></View>
  </Pressable>;
}

function DocumentSection({ title, total, documents, mode, openAll, openDocument, emptyTitle, emptyDetail }: {
  title: string; total: number; documents: HomeDocument[]; mode: "inbox" | "sent"; openAll: () => void; openDocument: (id: string) => void; workShortcuts?: ReactNode;
  emptyTitle: string; emptyDetail: string;
}) {
  const theme = useTheme();
  return <View style={[styles.section, { borderColor: theme.border, backgroundColor: theme.surface }]}>
    <View style={styles.sectionHeader}>
      <Text accessibilityRole="header" aria-level={2} style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
      {total > documents.length && documents.length > 0 ? <Text style={[styles.sectionNote, { color: theme.muted }]}>최근 {documents.length}건</Text> : <View style={{ flex: 1 }} />}
      {total > 0 ? <SectionLink title={title} onPress={openAll} /> : null}
    </View>
    {documents.length ? <View role="list">{documents.map(document => <View role="listitem" key={document.id}>
      <DocumentRow document={document} mode={mode} onPress={() => openDocument(document.id)} />
    </View>)}</View> : <View style={[styles.empty, { borderTopColor: theme.border }]}>
      <Text style={[styles.emptyTitle, { color: theme.text }]}>{emptyTitle}</Text>
      <Text style={[styles.feedbackDetail, { color: theme.secondary }]}>{emptyDetail}</Text>
    </View>}
  </View>;
}

function SectionLink({ title, onPress }: { title: string; onPress: () => void }) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  return <Pressable accessibilityRole="button" accessibilityLabel={`${title} 전체 보기`} onPress={onPress}
    onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
    style={({ pressed }) => [styles.sectionLink, { borderColor: focused ? theme.accent : "transparent", backgroundColor: pressed ? theme.accentSoft : "transparent" }]}>
    <Text style={[styles.sectionLinkText, { color: theme.accent }]}>전체 보기</Text><Feather aria-hidden accessible={false} name="chevron-right" size={16} color={theme.accent} />
  </Pressable>;
}

function DocumentRow({ document, mode, onPress }: { document: HomeDocument; mode: "inbox" | "sent"; onPress: () => void }) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const waiting = document.status === "submitted";
  const status = waiting ? "결재 대기" : "결재 중";
  const person = mode === "inbox" ? `기안 ${document.drafterName}` : document.currentApproverName ? `결재자 ${document.currentApproverName}` : "결재자 확인 중";
  const time = submittedTime(document.submittedAt);
  return <Pressable accessibilityRole="link" accessibilityLabel={`${document.title}, ${status}, ${person}, ${time}, 문서 열기`}
    onPress={onPress} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
    style={({ pressed }) => [styles.row, { borderTopColor: theme.border, backgroundColor: pressed || focused ? theme.surfaceMuted : "transparent" },
      focused && { borderLeftWidth: 2, borderLeftColor: theme.accent, paddingLeft: 14 }]}>
    <View style={styles.rowBody}>
      <Text numberOfLines={2} style={[styles.rowTitle, { color: theme.text }]}>{document.title}</Text>
      <View style={styles.meta}>
        <View style={[styles.status, { backgroundColor: waiting ? theme.accentSoft : theme.surfaceMuted }]}><Text style={[styles.statusText, { color: waiting ? theme.accent : theme.secondary }]}>{status}</Text></View>
        <Text style={[styles.metaText, { color: theme.secondary }]}>{person}</Text>
        <Text aria-hidden style={[styles.metaText, { color: theme.secondary }]}>·</Text>
        <Text style={[styles.metaText, { color: theme.secondary }]}>{time}</Text>
      </View>
    </View>
    <Feather aria-hidden accessible={false} name="chevron-right" size={18} color={theme.muted} />
  </Pressable>;
}

function HomeLoading({ canApprove }: { canApprove: boolean }) {
  const theme = useTheme();
  const skeleton = (width: number | `${number}%`, height: number) => <View style={{ width, height, borderRadius: 6, backgroundColor: theme.surfaceMuted }} />;
  return <View accessibilityRole="progressbar" accessibilityLabel="오늘의 업무를 불러오는 중" style={{ gap: 12 }}>
    <View style={styles.summaryRow}>{[0, 1].map(index => <View key={index} style={[styles.metric, { borderColor: theme.border, backgroundColor: theme.surface }]}>
      {skeleton(70, 12)}{skeleton(44, 22)}
    </View>)}</View>
    {(canApprove ? [5, 4] : [4]).map((rows, section) => <View key={section} style={[styles.section, { borderColor: theme.border, backgroundColor: theme.surface }]}>
      <View style={styles.sectionHeader}>{skeleton(96, 14)}</View>
      {Array.from({ length: rows }, (_, index) => <View key={index} style={[styles.skeletonRow, { borderTopColor: theme.border }]}>{skeleton(index % 2 ? "65%" : "85%", 14)}{skeleton(150, 11)}</View>)}
    </View>)}
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  header: { minHeight: 64, paddingVertical: 6, paddingHorizontal: 16, maxWidth: 720, width: "100%", alignSelf: "center", flexDirection: "row", flexWrap: "wrap", alignItems: "center", alignContent: "center", gap: 10 },
  symbol: { width: 40, height: 36, borderWidth: 1, borderRadius: 10, padding: 3, backgroundColor: "#FFFFFF" },
  symbolImage: { width: "100%", height: "100%" },
  heading: { flex: 1, flexBasis: 100, minWidth: 100, gap: 1 },
  title: { fontSize: 20, lineHeight: 28, fontWeight: "700", letterSpacing: -0.3 },
  userLine: { fontSize: 13, lineHeight: 18, fontVariant: ["tabular-nums"] },
  action: { minHeight: 44, minWidth: 44, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 2, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, flexShrink: 0 },
  actionText: { fontSize: 15, lineHeight: 20, fontWeight: "700" },
  content: { paddingTop: 12, paddingHorizontal: 16, paddingBottom: 20, gap: 12, maxWidth: 720, width: "100%", alignSelf: "center" },
  summaryRow: { flexDirection: "row", gap: 8 },
  metric: { flex: 1, minWidth: 0, minHeight: 72, borderWidth: 1, borderRadius: 14, paddingVertical: 10, paddingLeft: 14, paddingRight: 12, justifyContent: "space-between", gap: 2 },
  metricLabelRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  metricLabel: { flex: 1, fontSize: 13, lineHeight: 18 },
  countRow: { flexDirection: "row", alignItems: "baseline", gap: 3 },
  count: { flexShrink: 1, fontSize: 24, lineHeight: 30, fontWeight: "700", letterSpacing: -0.4, fontVariant: ["tabular-nums"] },
  unit: { fontSize: 14, lineHeight: 20 },
  section: { borderWidth: 1, borderRadius: 16, overflow: "hidden" },
  sectionHeader: { minHeight: 48, flexDirection: "row", flexWrap: "wrap", alignItems: "center", alignContent: "center", gap: 8, paddingLeft: 16, paddingRight: 4 },
  sectionTitle: { fontSize: 16, lineHeight: 22, fontWeight: "700" },
  sectionNote: { flex: 1, fontSize: 13, lineHeight: 18, minWidth: 0 },
  sectionLink: { minHeight: 44, borderWidth: 2, borderRadius: 12, paddingLeft: 8, paddingRight: 6, flexDirection: "row", alignItems: "center", gap: 2 },
  sectionLinkText: { fontSize: 14, lineHeight: 20, fontWeight: "700" },
  row: { minHeight: 64, borderTopWidth: 1, paddingVertical: 11, paddingLeft: 16, paddingRight: 10, flexDirection: "row", alignItems: "center", gap: 8 },
  rowBody: { flex: 1, minWidth: 0, gap: 6 },
  rowTitle: { fontSize: 16, lineHeight: 22, fontWeight: "500" },
  meta: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 6, rowGap: 2 },
  metaText: { fontSize: 13, lineHeight: 18, fontVariant: ["tabular-nums"] },
  status: { paddingVertical: 1, paddingHorizontal: 7, borderRadius: 6 },
  statusText: { fontSize: 12, lineHeight: 18, fontWeight: "700" },
  empty: { borderTopWidth: 1, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 16, gap: 2 },
  emptyTitle: { fontSize: 15, lineHeight: 22, fontWeight: "700" },
  refreshError: { borderWidth: 1, borderRadius: 12, paddingLeft: 12, paddingRight: 6, paddingVertical: 6, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10 },
  feedbackTitle: { fontSize: 13, lineHeight: 18, fontWeight: "700" },
  feedbackDetail: { fontSize: 13, lineHeight: 18 },
  error: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 12 },
  errorBody: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  errorTitle: { fontSize: 16, lineHeight: 22, fontWeight: "700", marginBottom: 2 },
  skeletonRow: { height: 70, borderTopWidth: 1, paddingHorizontal: 16, justifyContent: "center", gap: 9 },
});
