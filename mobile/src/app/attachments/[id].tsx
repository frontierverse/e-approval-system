import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PdfPreview } from "@/components/pdf-preview";
import { ErrorState, PrimaryButton, TextAction } from "@/components/ui";
import { ApiError, apiUrl } from "@/lib/api";
import { attachmentFileSize } from "@/lib/attachment-file";
import { startAttachmentTransfer } from "@/lib/attachment-transfer";
import { useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";
import { useFocusedPage } from "@/lib/use-focused-page";
import type { MobileAttachment } from "@/lib/types";

export default function AttachmentPreview() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token } = useSession();
  return <AttachmentScreen key={token + ":" + id} id={id} />;
}

function AttachmentScreen({ id }: { id: string }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { token, signOut } = useSession();
  const { data, error, reload } = useFocusedPage<{ attachment: MobileAttachment }>("/attachments/" + encodeURIComponent(id));
  const attachment = data?.attachment;
  const transfer = useRef<ReturnType<typeof startAttachmentTransfer> | null>(null);
  const active = useRef(true);
  const sequence = useRef(0);
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const errorSummary = useRef<View>(null);
  useEffect(() => { if (failure) errorSummary.current?.focus(); }, [failure]);
  useFocusEffect(useCallback(() => {
    active.current = true;
    if (!transfer.current) setPending(false);
    return () => { active.current = false; sequence.current++; transfer.current?.cancel(); transfer.current = null; };
  }, []));

  const run = async (action: "save" | "share") => {
    if (!token || !attachment || transfer.current) return;
    const operation = ++sequence.current;
    const isCurrent = () => active.current && operation === sequence.current;
    setPending(true); setProgress(null); setMessage(null); setFailure(null);
    const task = startAttachmentTransfer({ id: attachment.id, token, action, onProgress: (value) => { if (isCurrent()) setProgress(value); } });
    transfer.current = task;
    try {
      const result = await task.promise;
      if (isCurrent()) setMessage(result ?? "취소했습니다.");
    } catch (cause) {
      if (!isCurrent()) return;
      if (cause instanceof ApiError && cause.status === 401) await signOut();
      else setFailure(cause instanceof Error ? cause.message : "파일을 받지 못했습니다. 다시 시도하세요.");
    } finally {
      if (transfer.current === task) transfer.current = null;
      if (isCurrent()) setPending(false);
    }
  };

  if (!token) return null;
  if (!attachment) return <View style={[styles.center, { backgroundColor: theme.background }]}>
    {error ? <ErrorState message={error} retry={reload} /> : <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}><ActivityIndicator color={theme.accent} /><Text accessibilityLiveRegion="polite" style={{ color: theme.secondary }}>파일 정보를 불러오는 중...</Text></View>}
  </View>;
  return <View style={{ flex: 1, backgroundColor: theme.background }}>
    <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={styles.header}>
      <Text accessibilityRole="header" {...(Platform.OS === "web" ? { "aria-level": 2 } : {})} style={{ color: theme.text, fontSize: 16, fontWeight: "800", lineHeight: 23 }}>{attachment.name}</Text>
      <Text style={{ color: theme.secondary, fontSize: 12, marginTop: 4 }}>{attachment.isSigned ? "서명본" : "원본"} · {attachmentFileSize(attachment.size)}</Text>
      <View style={styles.actions}>
        <View style={{ flex: 1 }}><PrimaryButton title="파일 저장" disabled={pending || !!error} onPress={() => void run("save")} /></View>
        <TextAction label="공유" icon="share-outline" disabled={pending || !!error || Platform.OS === "web"} onPress={() => void run("share")} />
      </View>
      {pending ? <View style={styles.feedback}>
        <ActivityIndicator color={theme.accent} size="small" />
        <Text accessibilityLiveRegion="polite" style={{ color: theme.secondary, flex: 1, fontVariant: ["tabular-nums"] }}>{progress === null ? "파일을 준비하는 중..." : progress < 1 ? `다운로드 중 ${Math.round(progress * 100)}%` : "저장·공유 화면을 여는 중..."}</Text>
        <TextAction label="취소" onPress={() => transfer.current?.cancel()} />
      </View> : null}
      {failure ? <View ref={errorSummary} tabIndex={-1} accessibilityRole="alert" style={styles.notice}><Text style={{ color: theme.danger, fontSize: 13, lineHeight: 20 }}>{failure}</Text></View> : null}
      {message ? <Text accessibilityLiveRegion="polite" style={[styles.notice, { color: theme.secondary }]}>{message}</Text> : null}
      {error ? <View style={styles.feedback}><Text accessibilityRole="alert" style={{ color: theme.danger, flex: 1 }}>{error}</Text><TextAction label="다시 시도" onPress={reload} /></View> : null}
      {Platform.OS === "ios" ? <Text style={[styles.notice, { color: theme.secondary }]}>저장 화면에서 ‘파일에 저장’을 선택하세요.</Text> : null}
      {Platform.OS === "web" ? <Text style={[styles.notice, { color: theme.secondary }]}>공유는 설치한 모바일 앱에서 사용할 수 있습니다.</Text> : null}
    </ScrollView>
    <View style={{ flex: 1, paddingBottom: insets.bottom }}>
      {attachment.previewKind ? <AttachmentContent key={attachment.id} attachment={attachment} token={token} /> : <View style={styles.unsupported}>
        <Ionicons name="document-text-outline" color={theme.secondary} size={24} />
        <Text style={{ color: theme.text, fontWeight: "700", marginTop: 8 }}>이 파일은 앱 미리보기를 지원하지 않습니다.</Text>
        <Text style={{ color: theme.secondary, textAlign: "center", marginTop: 5, lineHeight: 21 }}>파일을 저장하거나 공유한 뒤 해당 문서 앱에서 여세요.</Text>
      </View>}
    </View>
  </View>;
}

function AttachmentContent({ attachment, token }: { attachment: MobileAttachment; token: string }) {
  const theme = useTheme();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  let uri: string;
  try { uri = apiUrl("/attachments/" + encodeURIComponent(attachment.id) + "/preview"); }
  catch { return <View style={styles.center}><Text style={{ color: theme.danger }}>앱 서버 주소를 확인할 수 없습니다. 관리자에게 문의하세요.</Text></View>; }
  if (attachment.previewKind === "pdf") return <PdfPreview uri={uri} token={token} />;
  return failed ? <View style={styles.center}><ErrorState message="이미지를 열지 못했습니다. 연결을 확인하고 다시 시도하세요." retry={() => { setFailed(false); setAttempt(value => value + 1); }} /></View> : <Image key={attempt} accessibilityLabel={attachment.name} source={{ uri, headers: { Authorization: "Bearer " + token } }} style={{ flex: 1 }} resizeMode="contain" onError={() => setFailed(true)} />;
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", padding: 16 },
  header: { padding: 12, maxWidth: 720, width: "100%", alignSelf: "center" },
  actions: { flexDirection: "row", gap: 8, alignItems: "center", marginTop: 10 },
  feedback: { flexDirection: "row", gap: 8, alignItems: "center", marginTop: 4 },
  notice: { fontSize: 13, lineHeight: 20, marginTop: 6 },
  unsupported: { paddingHorizontal: 16, paddingTop: 20, alignItems: "center" },
});
