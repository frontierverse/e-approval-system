import { Feather } from "@expo/vector-icons";
import { router, Stack } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Keyboard, Platform, Pressable, RefreshControl, StyleSheet, View, useWindowDimensions } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardScrollView } from "./keyboard-scroll-view";
import { DocumentActionSheet, type DocumentAction } from "./document-action-sheet";
import { DetailBadge, DetailButton, DetailPanel, DetailSection, DetailText as Text } from "./document-detail-ui";
import { DocumentProgress, RejectionReason } from "./document-progress";
import { ApiError } from "@/lib/api";
import { isDraftDeleteResult } from "@/lib/draft-deletion";
import { attachmentFileSize } from "@/lib/attachment-file";
import { decisionCommentError, documentActions, detailDate, detailStatusLabels } from "@/lib/document-detail";
import { useHomeTheme } from "@/lib/home-theme";
import { useSession } from "@/lib/session";
import { useDocumentDetail } from "@/lib/use-document-detail";
import type { MobileDocument } from "@/lib/types";

export function DocumentDetailScreen({ id }: { id: string }) {
  const theme = useHomeTheme(), insets = useSafeAreaInsets(), { width, fontScale } = useWindowDimensions();
  const largeText = width / fontScale < 300;
  const { user, request } = useSession(), { document, error, loading, unavailable, reload } = useDocumentDetail(id);
  const [action, setAction] = useState<DocumentAction | null>(null), [comments, setComments] = useState({ approve: "", reject: "" });
  const [pending, setPending] = useState(false), [actionError, setActionError] = useState<string | null>(null), [needsCheck, setNeedsCheck] = useState(false);
  const [finished, setFinished] = useState<"back" | "edit" | "drafts" | null>(null);
  const lock = useRef(false), actionButton = useRef<View>(null), approveButton = useRef<View>(null), recallButton = useRef<View>(null), returnButton = useRef<View | null>(null);
  const deleteAttempt = useRef<string | null>(null), deleteButton = useRef<View>(null);
  const { canDecide, canRecall, canEdit, canDelete } = documentActions(document, user?.canApproveDocuments === true);
  const close = () => { if (!lock.current) { Keyboard.dismiss(); setAction(null); requestAnimationFrame(() => returnButton.current?.focus()); } };
  usePreventRemove(!!user && (pending || !!action), () => { if (!lock.current) close(); });
  const [previousUnavailable, setPreviousUnavailable] = useState(unavailable);
  if (previousUnavailable !== unavailable) {
    setPreviousUnavailable(unavailable);
    if (unavailable) { setAction(null); setComments({ approve: "", reject: "" }); }
  }
  // Remove the navigation guard in the committed render before leaving after success.
  useEffect(() => { if (finished && !pending && !action) { if (finished === "edit") router.replace({ pathname: "/drafts/[id]", params: { id } }); else if (finished === "drafts") router.replace("/drafts?folder=drafts"); else router.back(); } }, [finished, pending, action, id]);
  const recheck = async () => {
    if (lock.current) return;
    if (action === "delete" && deleteAttempt.current) { await submit(true); return; }
    const latest = await reload();
    if (latest) { setNeedsCheck(false); setActionError(null); }
  };
  const submit = async (verifyDeletion = false) => {
    if (lock.current || !action || !document || !verifyDeletion && (needsCheck || error)) return;
    const selected = action, comment = selected === "approve" || selected === "reject" ? comments[selected].trim() : "";
    if ((selected === "approve" || selected === "reject") && decisionCommentError(selected, comment)) return;
    lock.current = true; setPending(true); setActionError(null);
    try {
      const latest = selected === "delete" && deleteAttempt.current ? document : await reload();
      if (!latest) throw new Error("최신 상태를 확인하지 못했어요. 문서를 처리하지 않았습니다.");
      if (latest.updatedAt !== document.updatedAt) throw new Error("문서가 변경됐어요. 최신 내용과 의견을 확인해 주세요.");
      if (selected === "delete") {
        if (!deleteAttempt.current) {
          if (!documentActions(latest, user?.canApproveDocuments === true).canDelete || !latest.updatedAt) throw new Error("현재 문서는 삭제할 수 없어요.");
          deleteAttempt.current = latest.updatedAt;
        }
        const result = await request<unknown>(`/drafts/${id}`, { method: "DELETE", body: { expectedUpdatedAt: deleteAttempt.current } });
        if (!isDraftDeleteResult(result, id)) throw new Error("삭제 응답을 확인하지 못했어요. 삭제 결과를 다시 확인해 주세요.");
        setFinished("drafts");
      } else if (selected === "recall") {
        if (!documentActions(latest, user?.canApproveDocuments === true).canRecall || !latest.updatedAt) throw new Error("현재 문서는 회수할 수 없어요.");
        await request(`/documents/${id}/recall`, { method: "POST", body: { expectedUpdatedAt: latest.updatedAt } });
        setFinished("edit");
      } else {
        if (!documentActions(latest, user?.canApproveDocuments === true).canDecide) throw new Error(latest.decisionBlockedReason || "현재 결재 차례가 아니거나 처리 권한이 없어요.");
        await request(`/documents/${id}/decision`, { method: "POST", body: { decision: selected, comment } });
        setFinished("back");
      }
      Keyboard.dismiss(); setAction(null);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status >= 400 && cause.status < 500 && cause.status !== 408) deleteAttempt.current = null;
      setActionError(cause instanceof Error ? cause.message : "서버 응답을 확인하지 못했습니다."); setNeedsCheck(true);
    } finally { lock.current = false; setPending(false); }
  };
  const open = (value: DocumentAction) => { if (!lock.current && !loading && !error) { returnButton.current = value === "approve" ? approveButton.current : value === "recall" ? recallButton.current : value === "delete" ? deleteButton.current : actionButton.current; setAction(value); } };
  const allowed = !loading && !error && (action === "recall" ? canRecall : action === "delete" ? canDelete : canDecide);
  return <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: theme.surface }}>
    <Stack.Screen options={{ headerShown: false, gestureEnabled: !pending && !action }} />
    <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
      <DetailButton label="뒤로" icon="chevron-left" iconOnly iconSize={24} disabled={pending} onPress={() => { if (action) close(); else router.back(); }} style={{ minWidth: 44, borderWidth: 0, paddingHorizontal: 0 }} />
      <Text accessibilityRole="header" aria-level={1} style={{ flex: 1, fontSize: 17, lineHeight: 24, fontWeight: "700", color: theme.text }}>결재 문서</Text>
      {canDecide && canRecall ? <DetailButton ref={recallButton} label="회수하고 수정" disabled={pending || loading || !!error} onPress={() => open("recall")} style={{ minHeight: 44, paddingHorizontal: 8, paddingVertical: 4 }} /> : null}
    </View>
    <KeyboardScrollView style={{ flex: 1, backgroundColor: theme.background }} keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={loading && !!document} onRefresh={() => { if (!lock.current) void recheck(); }} tintColor={theme.accent} />}>
      {document ? <>
        {error ? <DetailPanel style={{ padding: 12, borderColor: theme.danger, gap: 8 }}><Text accessibilityRole="alert" style={{ color: theme.danger, fontSize: 14, lineHeight: 21 }}>최신 상태를 불러오지 못했어요. 이전에 불러온 내용이며 처리는 잠시 멈췄어요.{"\n"}{error}</Text><DetailButton label="다시 시도" disabled={pending || loading} onPress={() => void recheck()} /></DetailPanel> : null}
        <View style={{ gap: 6 }}>
          <View style={styles.metaLine}><DetailBadge label={document.status === "submitted" ? "결재 대기" : detailStatusLabels[document.status] || document.status} status={document.status} />
            <Text style={[styles.meta, { color: theme.secondary }]}>{document.documentNo || "문서번호 미발급"} · {document.templateName || document.category}</Text></View>
          <Text selectable accessibilityRole="header" {...(Platform.OS === "web" ? { "aria-level": 2 } : {})} style={{ color: theme.text, fontSize: 22, fontWeight: "700", lineHeight: 31, letterSpacing: -.3 }}>{document.title}</Text>
          <Text style={{ color: theme.text, fontSize: 14, lineHeight: 21 }}>기안 <Text style={{ fontWeight: "700" }}>{document.drafterName}</Text> · {document.submittedAt ? `상신 ${detailDate(document.submittedAt)}` : "아직 상신하지 않음"}</Text>
          <View style={styles.metaLine}>{document.createdAt ? <Text style={[styles.meta, { color: theme.secondary }]}>작성 {detailDate(document.createdAt)}</Text> : null}
            {document.completedAt ? <Text style={[styles.meta, { color: theme.secondary }]}>{document.status === "rejected" ? "반려" : document.status === "recalled" ? "회수" : "완료"} {detailDate(document.completedAt)}</Text> : null}
            {(document.status === "draft" || document.status === "recalled") && document.updatedAt ? <Text style={[styles.meta, { color: theme.secondary }]}>최종 수정 {detailDate(document.updatedAt)}</Text> : null}</View>
        </View>
        <DocumentNotice document={document} canDecide={canDecide} canApprove={user?.canApproveDocuments === true} />
        <RejectionReason document={document} />
        <DetailSection title="본문"><DetailPanel style={{ paddingVertical: 14, paddingHorizontal: 16 }}><Text selectable style={{ color: document.content.trim() ? theme.text : theme.secondary, fontSize: document.content.trim() ? 16 : 14, lineHeight: document.content.trim() ? 26.4 : 21 }}>{document.content.trim() ? document.content : "본문 내용이 없어요."}</Text></DetailPanel></DetailSection>
        <DetailSection title="첨부파일" extra={String(document.attachments.length)}><DetailPanel>
          {document.attachments.length ? document.attachments.map((attachment, index) => <AttachmentRow key={attachment.id} attachment={attachment} index={index} disabled={pending} />) : <Text style={{ color: theme.secondary, fontSize: 14, lineHeight: 21, paddingVertical: 12, paddingHorizontal: 16 }}>첨부파일이 없어요.</Text>}
        </DetailPanel></DetailSection>
        <DocumentProgress key={document.id} document={document} />
      </> : loading ? <Loading /> : <DetailPanel style={{ padding: 16, gap: 12 }}>
        <View style={{ flexDirection: "row", gap: 10 }}><Feather name={unavailable ? "lock" : "alert-circle"} color={unavailable ? theme.secondary : theme.danger} size={22} accessible={false} aria-hidden />
          <View style={{ flex: 1, gap: 4 }}><Text accessibilityRole="alert" style={{ color: theme.text, fontSize: 16, lineHeight: 23, fontWeight: "700" }}>{unavailable ? "문서를 열 수 없어요" : "문서를 불러오지 못했어요"}</Text>
            <Text style={{ color: theme.secondary, fontSize: 13, lineHeight: 19 }}>{unavailable ? "열람 권한이 없거나 찾을 수 없는 문서예요. 문서 내용은 표시하지 않아요." : error || "연결을 확인한 뒤 다시 시도해 주세요."}</Text></View></View>
        <DetailButton label={unavailable ? "뒤로" : "다시 시도"} onPress={() => { if (unavailable) router.back(); else void reload(); }} />
      </DetailPanel>}
    </KeyboardScrollView>
    {document && (canDecide || canRecall || canEdit) ? <View accessibilityLabel="문서 처리" style={[styles.bar, { flexDirection: largeText && canDelete ? "column" : "row", backgroundColor: theme.surface, borderTopColor: theme.border, paddingBottom: Math.max(insets.bottom, 8) }]}>
      {canDecide ? <><DetailButton ref={actionButton} label="반려" danger disabled={pending || loading || !!error} onPress={() => open("reject")} style={{ flex: 1 }} /><DetailButton ref={approveButton} label="승인" primary disabled={pending || loading || !!error} onPress={() => open("approve")} style={{ flex: largeText ? 1 : 2 }} /></>
        : canRecall ? <DetailButton ref={recallButton} label="회수하고 수정" icon="corner-up-left" disabled={pending || loading || !!error} onPress={() => open("recall")} style={{ flex: 1 }} />
          : <>{canDelete ? <DetailButton ref={deleteButton} label="삭제" icon="trash-2" danger disabled={pending || loading || !!error} onPress={() => open("delete")} style={{ flex: largeText ? undefined : 1 }} /> : null}<DetailButton label={document.status === "recalled" ? "수정·재상신" : "기안 수정"} icon="edit-3" primary disabled={pending || loading || !!error} onPress={() => router.replace({ pathname: "/drafts/[id]", params: { id } })} style={{ flex: largeText && canDelete ? undefined : 2 }} /></>}
    </View> : <View style={{ height: insets.bottom, backgroundColor: theme.background }} />}
    {document && action ? <DocumentActionSheet key={action} action={action} document={document} comment={action === "approve" || action === "reject" ? comments[action] : ""}
      onComment={value => { if (action === "approve" || action === "reject") setComments(values => ({ ...values, [action]: value })); }}
      pending={pending} allowed={allowed} needsCheck={needsCheck} error={actionError} onClose={close} onSubmit={() => void submit()} onRecheck={recheck} /> : null}
  </SafeAreaView>;
}
function DocumentNotice({ document, canDecide, canApprove }: { document: MobileDocument; canDecide: boolean; canApprove: boolean }) {
  const theme = useHomeTheme();
  if (document.status === "rejected") return null;
  const blocked = canApprove && !!document.decisionBlockedReason;
  const active = document.status === "submitted" || document.status === "in_progress";
  const current = document.approvalSteps.find(step => step.status === "pending");
  const title = blocked ? "앱에서 결재할 수 없어요." : canDecide ? "내 결재 차례예요." : active && canApprove && current ? "결재 차례가 아니에요." : "";
  const text = blocked ? document.decisionBlockedReason : canDecide ? `${document.attachments.length ? `본문과 첨부 ${document.attachments.length}개를` : "본문을"} 확인한 뒤 승인 또는 반려하세요.` : `현재 결재자는 ${current?.name}이에요. 열람만 할 수 있어요.`;
  if (!title) return null;
  return <View style={{ paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: blocked ? theme.danger : canDecide ? "transparent" : theme.controlBorder, backgroundColor: canDecide ? theme.accentSoft : theme.surface, flexDirection: "row", gap: 8 }}>
    <Feather name={blocked ? "alert-circle" : "info"} color={blocked ? theme.danger : canDecide ? theme.accent : theme.secondary} size={18} accessible={false} aria-hidden style={{ marginTop: 2 }} />
    <Text style={{ flex: 1, color: theme.secondary, fontSize: 14, lineHeight: 21 }}><Text style={{ color: theme.text, fontWeight: "700" }}>{title} </Text>{text}</Text>
  </View>;
}
function AttachmentRow({ attachment: a, index, disabled }: { attachment: MobileDocument["attachments"][number]; index: number; disabled: boolean }) {
  const theme = useHomeTheme(), [focused, setFocused] = useState(false);
  return <Pressable accessibilityRole="link" accessibilityLabel={`${a.name}, ${a.isSigned ? "서명본" : "원본"}, ${attachmentFileSize(a.size)}, ${a.previewKind ? "미리보기·저장·공유" : "저장·공유"}`} disabled={disabled}
    onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onPress={() => router.push({ pathname: "/attachments/[id]", params: { id: a.id } })}
    style={({ pressed }) => [{ minHeight: 64, paddingVertical: 10, paddingLeft: 12, paddingRight: 10, flexDirection: "row", alignItems: "center", gap: 10,
      borderTopColor: theme.border, borderTopWidth: index ? 1 : 0, borderLeftWidth: 2, borderLeftColor: focused ? theme.accent : "transparent", backgroundColor: pressed || focused ? theme.surfaceMuted : theme.surface }]}>
    <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: theme.surfaceMuted, alignItems: "center", justifyContent: "center" }}><Feather accessible={false} aria-hidden name={a.previewKind === "image" ? "image" : a.previewKind === "pdf" ? "file-text" : "file"} color={theme.secondary} size={20} /></View>
    <View style={{ flex: 1, gap: 3 }}><Text style={{ color: theme.text, fontSize: 15, lineHeight: 21, fontWeight: "500" }}>{a.name}</Text><View style={styles.metaLine}>
      <DetailBadge label={a.isSigned ? "서명본" : "원본"} status={a.isSigned ? "approved" : "original"} /><Text style={{ color: theme.secondary, fontSize: 13, lineHeight: 19 }}>{attachmentFileSize(a.size)}</Text><Text style={{ color: theme.secondary, fontSize: 13, lineHeight: 19 }}>{a.previewKind ? "미리보기·저장·공유" : "저장·공유"}</Text>
      {a.isSigned && a.signedAt ? <Text style={{ color: theme.secondary, fontSize: 13, lineHeight: 19 }}>서명 {detailDate(a.signedAt)}</Text> : null}</View></View>
    <Feather name="chevron-right" size={18} color={theme.muted} accessible={false} aria-hidden />
  </Pressable>;
}
function Loading() {
  const theme = useHomeTheme();
  return <View style={{ gap: 10 }}><View accessibilityRole="progressbar" accessibilityLabel="문서를 불러오는 중" style={{ flexDirection: "row", gap: 8 }}><ActivityIndicator color={theme.accent} /><Text style={{ color: theme.secondary }}>문서를 불러오는 중…</Text></View>
    {[180, "85%", 210, 240].map((width, i) => <View key={i} aria-hidden accessible={false} style={{ width: width as number | "85%", height: i === 1 ? 26 : 14, borderRadius: 7, backgroundColor: theme.surfaceMuted }} />)}
    <DetailPanel style={{ padding: 16, gap: 14 }}>{["92%", "70%", "84%", "60%", "78%"].map((width, i) => <View key={i} aria-hidden accessible={false} style={{ width: width as "92%", height: 14, borderRadius: 7, backgroundColor: theme.surfaceMuted }} />)}</DetailPanel>
    <DetailPanel style={{ height: 128 }} />
  </View>;
}
const styles = StyleSheet.create({
  header: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 4, paddingLeft: 4, paddingRight: 8, borderBottomWidth: 1 },
  content: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 24, gap: 16, maxWidth: 720, width: "100%", alignSelf: "center" },
  metaLine: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 6, rowGap: 2 }, meta: { fontSize: 13, lineHeight: 19 },
  bar: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingTop: 8, borderTopWidth: 1 },
});
