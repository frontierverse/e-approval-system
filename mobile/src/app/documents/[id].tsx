import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { ErrorState, PrimaryButton, TextAction } from "@/components/ui";
import { useSession } from "@/lib/session";
import { formatDate, useTheme } from "@/lib/theme";
import { useLoad } from "@/lib/use-load";
import type { MobileDocument } from "@/lib/types";

const statusLabels: Record<string, string> = {
  submitted: "상신", in_progress: "진행 중", approved: "승인", rejected: "반려",
  pending: "대기", completed: "완료", skipped: "건너뜀",
};

export default function DocumentDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { request, user } = useSession();
  const { data, loading, error, reload } = useLoad<{ document: MobileDocument }>("/documents/" + id);
  const document = data?.document;
  const canDecide = user?.canApproveDocuments === true && document?.canDecide === true;
  const [decision, setDecision] = useState<"approve" | "reject" | null>(null);
  const [comment, setComment] = useState("");
  const [pending, setPending] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const submit = async () => {
    if (!decision || !document || !canDecide || pending) return;
    if (decision === "reject" && comment.trim().length < 2) {
      setSubmitError("반려 사유를 2자 이상 입력하세요.");
      return;
    }
    const execute = async () => {
      setPending(true); setSubmitError(null);
      try {
        await request("/documents/" + id + "/decision", { method: "POST", body: { decision, comment } });
        router.back();
      } catch (cause) {
        setSubmitError(cause instanceof Error ? cause.message : "결재를 처리하지 못했습니다. 다시 시도하세요.");
      } finally { setPending(false); }
    };
    if (Platform.OS === "web") {
      if (window.confirm(document.title + " 문서를 " + (decision === "approve" ? "승인" : "반려") + "하시겠습니까?")) void execute();
    } else {
      Alert.alert(decision === "approve" ? "승인 확인" : "반려 확인",
        document.title + " 문서를 " + (decision === "approve" ? "승인" : "반려") + "하시겠습니까?",
        [{ text: "취소", style: "cancel" }, { text: "처리", style: decision === "reject" ? "destructive" : "default", onPress: () => void execute() }]);
    }
  };
  if (loading && !data) return <View style={styles.center}><ActivityIndicator color={theme.accent} /></View>;
  if (error && !data) return <View style={styles.center}><ErrorState message={error} retry={reload} /></View>;
  if (!document) return null;
  return <View style={{ flex: 1, backgroundColor: theme.background }}>
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.titleBlock}>
        <Text style={{ color: theme.secondary, fontSize: 12 }}>{document.documentNo} · {statusLabels[document.status] ?? document.status}</Text>
        <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 21, fontWeight: "800", lineHeight: 29, marginTop: 5 }}>{document.title}</Text>
      </View>
      <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Meta label="기안자" value={document.drafterName} />
        <Meta label="상신일" value={formatDate(document.submittedAt)} />
        <Meta label="문서" value={document.templateName || document.category} />
      </View>
      <Text style={[styles.sectionTitle, { color: theme.text }]}>본문</Text>
      <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={{ color: theme.text, fontSize: 14, lineHeight: 23 }}>{document.content || "내용이 없습니다."}</Text>
      </View>
      {document.attachments.length ? <>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>첨부파일 {document.attachments.length}</Text>
        <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border, padding: 0, overflow: "hidden" }]}>
          {document.attachments.map((attachment, index) => <Pressable key={attachment.id} accessibilityRole="link"
            accessibilityLabel={attachment.name + (attachment.previewKind ? " 미리보기" : " 미리보기 불가")}
            disabled={!attachment.previewKind}
            onPress={() => router.push({ pathname: "/attachments/[id]", params: { id: attachment.id, name: attachment.name, kind: attachment.previewKind ?? "" } })}
            style={({ pressed }) => [styles.fileRow, index > 0 && { borderTopWidth: 1, borderTopColor: theme.border }, pressed && { backgroundColor: theme.surfaceMuted }]}>
            <Ionicons name="attach" size={19} color={theme.secondary} />
            <Text numberOfLines={2} style={{ color: attachment.previewKind ? theme.text : theme.muted, flex: 1, fontSize: 14 }}>{attachment.name}</Text>
            {attachment.previewKind ? <Ionicons name="chevron-forward" size={17} color={theme.muted} /> : <Text style={{ color: theme.muted, fontSize: 12 }}>웹에서 확인</Text>}
          </Pressable>)}
        </View>
      </> : null}
      <Text style={[styles.sectionTitle, { color: theme.text }]}>결재선</Text>
      <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border, padding: 0, overflow: "hidden" }]}>
        {document.approvalSteps.map((step, index) => <View key={step.id} style={[styles.stepRow, index > 0 && { borderTopWidth: 1, borderTopColor: theme.border }]}>
          <Text style={{ color: theme.muted, width: 20, fontVariant: ["tabular-nums"] }}>{step.order}</Text>
          <Text style={{ color: theme.text, flex: 1, fontWeight: "600" }}>{step.name}</Text>
          <Text style={{ color: step.status === "rejected" ? theme.danger : theme.secondary, fontSize: 13 }}>{statusLabels[step.status] ?? step.status}</Text>
        </View>)}
      </View>
      {user?.canApproveDocuments === true && document.decisionBlockedReason ? <Text style={{ color: theme.danger, marginTop: 14, lineHeight: 20 }}>{document.decisionBlockedReason}</Text> : null}
      {error ? <Text style={{ color: theme.danger, marginTop: 12 }}>{error}</Text> : null}
    </ScrollView>
    {canDecide ? <View style={[styles.actionBar, { backgroundColor: theme.surface, borderTopColor: theme.border, paddingBottom: Math.max(insets.bottom, 12) }]}>
      {decision ? <>
        <View style={styles.actionHeading}><Text style={{ color: theme.text, fontWeight: "800", fontSize: 16 }}>{decision === "approve" ? "승인" : "반려"}</Text>
          <TextAction label="취소" onPress={() => { setDecision(null); setSubmitError(null); }} /></View>
        <TextInput accessibilityLabel={decision === "reject" ? "반려 사유" : "결재 의견"}
          placeholder={decision === "reject" ? "반려 사유를 입력하세요 (필수)" : "의견을 입력하세요 (선택)"}
          placeholderTextColor={theme.muted} multiline value={comment} onChangeText={setComment}
          style={[styles.comment, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]} />
        {submitError ? <Text accessibilityRole="alert" style={{ color: theme.danger, marginBottom: 6 }}>{submitError}</Text> : null}
        <PrimaryButton title={pending ? "처리 중..." : decision === "approve" ? "승인 확인" : "반려 확인"} disabled={pending} danger={decision === "reject"} onPress={() => void submit()} />
      </> : <View style={styles.actionButtons}>
        <View style={{ flex: 1 }}><PrimaryButton title="반려" danger onPress={() => { setComment(""); setDecision("reject"); }} /></View>
        <View style={{ flex: 2 }}><PrimaryButton title="승인" onPress={() => { setComment(""); setDecision("approve"); }} /></View>
      </View>}
    </View> : null}
  </View>;
}

function Meta({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return <View style={styles.metaRow}><Text style={{ color: theme.muted, width: 68, fontSize: 13 }}>{label}</Text>
    <Text style={{ color: theme.text, flex: 1, fontSize: 13 }}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", padding: 16 },
  content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 24, maxWidth: 720, width: "100%", alignSelf: "center" },
  titleBlock: { marginBottom: 14 },
  panel: { borderWidth: 1, borderRadius: 12, padding: 14 },
  sectionTitle: { fontSize: 16, fontWeight: "800", marginTop: 20, marginBottom: 8 },
  metaRow: { flexDirection: "row", paddingVertical: 3 },
  fileRow: { minHeight: 53, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 13, paddingVertical: 8 },
  stepRow: { minHeight: 46, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 13 },
  actionBar: { borderTopWidth: 1, padding: 12 },
  actionButtons: { flexDirection: "row", gap: 8 },
  actionHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 34, marginBottom: 5 },
  comment: { minHeight: 60, maxHeight: 110, borderWidth: 1, borderRadius: 9, padding: 10, textAlignVertical: "top", fontSize: 14, marginBottom: 8 },
});
