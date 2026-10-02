import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { TextAction } from "@/components/ui";
import { useConfirmAction } from "@/components/use-confirm-action";
import { useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";
import type { MobileDocument } from "@/lib/types";

export function DocumentDraftActions({ document, reload }: { document: MobileDocument; reload: () => Promise<void> }) {
  const theme = useTheme();
  const confirmation = useConfirmAction();
  const { request } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const actionButton = useRef<View>(null);
  const errorSummary = useRef<View>(null);
  useEffect(() => { if (error) errorSummary.current?.focus(); }, [error]);
  const canRecall = document.canRecall === true && !!document.updatedAt;
  const edit = () => router.replace({ pathname: "/drafts/[id]", params: { id: document.id } });
  const recall = async () => {
    if (!canRecall || lock.current) return;
    lock.current = true; setError("");
    try {
      if (!await confirmation.ask({ title: "회수 확인", confirm: "회수", danger: true, onReturnFocus: () => actionButton.current?.focus(),
        message: `"${document.title}" 문서를 회수하시겠습니까? 결재 진행을 중단하고 수정 화면으로 이동합니다. 회수 기록은 남으며, 재상신하면 결재가 처음부터 진행됩니다.` })) return;
      setBusy(true);
      await request(`/documents/${document.id}/recall`, { method: "POST", body: { expectedUpdatedAt: document.updatedAt } });
      edit();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "회수하지 못했습니다. 최신 상태를 확인하세요.");
    } finally { lock.current = false; setBusy(false); }
  };
  if (!canRecall && document.canEdit !== true) return null;
  return <View style={{ marginBottom: 12 }}>
    {confirmation.dialog}
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      {canRecall ? <TextAction ref={actionButton} label={busy ? "회수 중…" : "회수하고 수정"} icon="create-outline" disabled={busy}
        onPress={() => void recall()} /> : <TextAction label={document.status === "recalled" ? "수정·재상신" : "기안 수정"} icon="create-outline" onPress={edit} />}
    </View>
    {canRecall ? <Text style={{ color: theme.secondary, fontSize: 12, lineHeight: 18 }}>회수하면 현재 결재 진행이 중단됩니다.</Text> : null}
    {error ? <View ref={errorSummary} tabIndex={-1} accessibilityRole="alert" accessibilityLabel={error}
      style={{ backgroundColor: theme.dangerSoft, borderColor: theme.danger, borderWidth: 1, borderRadius: 9, padding: 10, marginTop: 8 }}>
      <Text style={{ color: theme.danger, fontSize: 13, lineHeight: 20 }}>{error}</Text>
      <TextAction label="최신 상태 확인" icon="refresh" disabled={busy} onPress={() => { setError(""); void reload(); }} />
    </View> : null}
  </View>;
}
