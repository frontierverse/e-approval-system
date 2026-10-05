import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, ScrollView, TextInput, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DetailButton, DetailPanel, DetailText as Text } from "./document-detail-ui";
import { useHomeTheme } from "@/lib/home-theme";
import { decisionCommentError } from "@/lib/document-detail";
import type { MobileDocument } from "@/lib/types";

export type DocumentAction = "approve" | "reject" | "recall" | "delete";
export function DocumentActionSheet({ action, document, comment, onComment, pending, error, needsCheck, allowed, onClose, onSubmit, onRecheck }: {
  action: DocumentAction | null; document: MobileDocument; comment: string; onComment: (value: string) => void;
  pending: boolean; error: string | null; needsCheck: boolean; allowed: boolean;
  onClose: () => void; onSubmit: () => void; onRecheck: () => Promise<void>;
}) {
  const theme = useHomeTheme(), insets = useSafeAreaInsets(), { height, width, fontScale } = useWindowDimensions();
  const stackedActions = width / fontScale < 300;
  const [confirm, setConfirm] = useState(action === "recall" || action === "delete"), [validation, setValidation] = useState<string | null>(null), [focused, setFocused] = useState(false);
  const input = useRef<TextInput>(null), cancel = useRef<View>(null), alert = useRef<View>(null), body = useRef<ScrollView>(null);
  const current = [...document.approvalSteps].sort((a, b) => a.order - b.order).find(step => step.status === "pending");
  const next = current ? [...document.approvalSteps].sort((a, b) => a.order - b.order).find(step => step.order > current.order) : undefined;
  const approveResult = next ? `승인하면 다음 결재자 ${next.name}에게 넘어가요.` : "승인하면 이 문서의 결재가 완료돼요.";
  const verb = action === "approve" ? "승인" : action === "reject" ? "반려" : action === "delete" ? "삭제" : "회수";
  const title = confirm ? action === "recall" ? "회수하고 수정할까요?" : action === "delete" ? "임시저장 기안을 삭제할까요?" : `${verb}할까요?` : action === "reject" ? "반려 사유" : "승인 의견";
  useEffect(() => { if (action) requestAnimationFrame(() => { if (confirm) { cancel.current?.focus(); body.current?.scrollTo({ y: 0, animated: false }); } else input.current?.focus(); }); }, [action, confirm]);
  useEffect(() => { if (error) alert.current?.focus(); }, [error]);
  const advance = () => {
    const message = action === "approve" || action === "reject" ? decisionCommentError(action, comment) : null;
    setValidation(message);
    if (message) { input.current?.focus(); return; }
    setConfirm(true);
  };
  const close = () => { if (!pending) onClose(); };
  return <Modal visible={!!action} transparent animationType="none" accessibilityLabel={`${verb}${confirm ? " 확인" : " 의견 입력"}`} onRequestClose={close}
    onShow={() => { if (confirm) cancel.current?.focus(); else input.current?.focus(); }}>
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : Platform.OS === "android" ? "height" : undefined}
      style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(17,21,27,0.5)" }}>
      <View accessibilityViewIsModal style={{ width: "100%", maxWidth: 720, alignSelf: "center", maxHeight: Math.max(200, height - insets.top - 16),
        backgroundColor: theme.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: "hidden", paddingBottom: Math.max(insets.bottom, 8) }}>
        <View style={{ flexDirection: "row", alignItems: "center", paddingLeft: 16, paddingRight: 4, paddingTop: 8, paddingBottom: 4, gap: 8 }}>
          <Text accessibilityRole="header" aria-level={2} style={{ flex: 1, fontSize: 18, lineHeight: 26, fontWeight: "700", color: theme.text }}>{title}</Text>
          <DetailButton label="닫기" icon="x" iconOnly disabled={pending} onPress={close} style={{ width: 44, borderWidth: 0, paddingHorizontal: 0 }} />
        </View>
        <ScrollView ref={body} testID="document-action-content" style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12, gap: 10 }}>
          {!confirm ? <>
            <Text style={{ color: theme.secondary, fontSize: 14, lineHeight: 21 }}>{action === "reject" ? "반려하면 결재가 중단되고, 반려 사유가 문서 상단에 표시돼요." : approveResult}</Text>
            <Text style={{ color: theme.text, fontSize: 14, lineHeight: 21, fontWeight: "700" }}>{action === "reject" ? "반려 사유 (필수)" : "결재 의견 (선택)"}</Text>
            <TextInput ref={input} accessibilityLabel={action === "reject" ? "반려 사유" : "결재 의견"} aria-invalid={!!validation}
              accessibilityHint={action === "reject" ? "앞뒤 공백을 제외하고 2자 이상, 2000자 이하" : "선택 입력, 2000자 이하"}
              placeholder={action === "reject" ? "반려 사유를 입력하세요" : "의견을 입력하세요 (선택)"} placeholderTextColor={theme.muted}
              multiline editable={!pending} value={comment} onChangeText={value => { onComment(value); setValidation(null); }}
              onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
              style={{ minHeight: 128, padding: 12, borderWidth: 1, borderRadius: 12, borderColor: validation ? theme.danger : focused ? theme.accent : theme.controlBorder,
                backgroundColor: theme.surface, color: theme.text, fontSize: 16, lineHeight: 25, textAlignVertical: "top" }} />
            <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 8 }}>
              <Text style={{ color: theme.secondary, fontSize: 13, lineHeight: 19 }}>{action === "reject" ? "앞뒤 공백 제외 2~2000자" : "최대 2000자 · 선택"}</Text>
              <Text style={{ color: comment.trim().length > 2000 ? theme.danger : theme.secondary, fontSize: 13, lineHeight: 19 }}>{comment.trim().length}/2000</Text></View>
            {validation ? <Text accessibilityRole="alert" style={{ color: theme.danger, fontSize: 14, lineHeight: 21 }}>{validation}</Text> : null}
          </> : <>
            <DetailPanel style={{ padding: 12, gap: 4, backgroundColor: theme.background }}>
              <Text style={{ color: theme.secondary, fontSize: 13, lineHeight: 19 }}>{document.documentNo || "문서번호 없음"} · 기안 {document.drafterName}</Text>
              <Text style={{ color: theme.text, fontSize: 16, lineHeight: 24, fontWeight: "700" }}>{document.title}</Text>
            </DetailPanel>
            {action === "delete" ? <Text style={{ color: theme.text, fontSize: 15, lineHeight: 24 }}>임시저장한 문서와 첨부파일을 영구 삭제해요.{"\n"}삭제 후 복구할 수 없어요.</Text> : action === "recall" ? <Text style={{ color: theme.text, fontSize: 15, lineHeight: 24 }}>현재 결재 진행이 중단돼요.{"\n"}회수 기록은 처리 이력에 남아요.{"\n"}수정 후 재상신하면 결재가 처음부터 다시 시작돼요.</Text> : <>
              <Text style={{ color: theme.text, fontSize: 15, lineHeight: 24 }}>{action === "approve" ? approveResult : "반려하면 결재가 중단되고 기안자에게 반려 사유가 표시돼요."} 앱에서 되돌릴 수 없어요.</Text>
              <Text style={{ color: theme.secondary, fontSize: 13, lineHeight: 19, fontWeight: "700" }}>{action === "reject" ? "반려 사유" : "결재 의견"}</Text>
              <Text selectable style={{ color: theme.text, fontSize: 14, lineHeight: 22, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: theme.surfaceMuted }}>{comment.trim() || "의견 없음"}</Text>
            </>}
          </>}
          {error ? <View ref={alert} tabIndex={-1} accessibilityRole="alert" style={{ borderColor: theme.danger, borderWidth: 1, borderRadius: 12, padding: 12, backgroundColor: theme.dangerSoft, gap: 8 }}>
            <Text style={{ color: theme.text, fontSize: 14, lineHeight: 21 }}><Text style={{ color: theme.danger, fontWeight: "700" }}>처리 결과를 확인해 주세요.{"\n"}</Text>{error}{"\n"}{action === "delete" ? "삭제 결과를 확인한 뒤 다시 판단해 주세요." : "입력한 내용은 유지했어요. 최신 상태를 확인한 뒤 다시 판단해 주세요."}</Text>
            <DetailButton label={action === "delete" ? "삭제 결과 확인" : "최신 상태 확인"} onPress={() => void onRecheck()} disabled={pending} />
          </View> : !allowed ? <Text accessibilityRole="alert" style={{ color: theme.danger, fontSize: 14, lineHeight: 21 }}>현재 상태에서는 처리할 수 없어요. 최신 상태를 확인해 주세요.</Text> : null}
        </ScrollView>
        <View style={{ flexDirection: stackedActions ? "column" : "row", gap: 8, borderTopWidth: 1, borderTopColor: theme.border, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8 }}>
          <DetailButton ref={cancel} label={confirm && (action === "approve" || action === "reject") ? "의견 수정" : "취소"} disabled={pending}
            onPress={() => { if (confirm && (action === "approve" || action === "reject")) setConfirm(false); else close(); }} style={{ flex: stackedActions ? undefined : 1 }} />
          <DetailButton label={pending ? "처리 중…" : confirm ? `${verb}하기` : `${verb} 확인`} primary danger={confirm && (action === "reject" || action === "delete")}
            disabled={pending || !allowed || needsCheck} onPress={() => { if (confirm) onSubmit(); else advance(); }} style={{ flex: stackedActions ? undefined : 2 }} />
        </View>
        {pending ? <View accessibilityRole="progressbar" accessibilityLabel="서버에서 처리 중" style={{ paddingHorizontal: 16, flexDirection: "row", gap: 8 }}><ActivityIndicator color={theme.accent} /><Text style={{ color: theme.secondary, fontSize: 13, lineHeight: 19 }}>처리 결과를 기다리고 있어요.</Text></View> : null}
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}
