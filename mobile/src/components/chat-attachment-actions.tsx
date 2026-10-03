import { router } from "expo-router";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Modal, Platform, ScrollView, Text, View } from "react-native";
import { AccountFeedback } from "@/components/account-feedback";
import { PrimaryButton, TextAction } from "@/components/ui";
import { useConfirmAction } from "@/components/use-confirm-action";
import { ApiError } from "@/lib/api";
import { chatError, chatPreviewKind, newChatRequestId } from "@/lib/chat";
import { chatFileSize, createChatFileTransfer, registerChatPreviewAttachment } from "@/lib/chat-file-transfer";
import { useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";
import type { ChatAttachment } from "@/lib/types";
export function ChatAttachmentActions({ attachment, peerId, messageId, isSender, isCurrent, enabled, onChanged, onClose, onPending }: {
  attachment: ChatAttachment;
  peerId: string;
  messageId: string;
  isSender: boolean;
  isCurrent: () => boolean;
  enabled: boolean;
  onChanged: () => void;
  onClose: () => void;
  onPending: (pending: boolean) => void;
}) {
  const { token, user, expireSession } = useSession();
  const theme = useTheme();
  const confirmation = useConfirmAction();
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [handoff, setHandoff] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const alive = useRef(false);
  const guard = useRef(isCurrent);
  const available = useRef(enabled);
  const locked = useRef(false);
  const handed = useRef(false);
  const unresolved = useRef(false);
  const transfer = useRef<ReturnType<typeof createChatFileTransfer> | null>(null);
  const cancelButton = useRef<View>(null);
  useLayoutEffect(() => {
    guard.current = isCurrent;
    available.current = enabled;
  }, [isCurrent, enabled]);
  const scopeCurrent = useCallback(() => alive.current && guard.current(), []);
  const current = useCallback(() => scopeCurrent() && available.current, [scopeCurrent]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      transfer.current?.cancel();
      transfer.current?.release();
      onPending(false);
    };
  }, [onPending]);
  const operation = () => {
    if (!transfer.current && token && user)
      transfer.current = createChatFileTransfer({ attachment, token, requestId: newChatRequestId(), isSender, actorId: user.id, peerId, messageId, isCurrent: scopeCurrent, onProgress: value => {
          if (current())
            setProgress(value);
        } });
    return transfer.current;
  };
  const restore = useRef(operation);
  useLayoutEffect(() => { restore.current = operation; });
  useEffect(() => {
    let valid = true;
    void Promise.resolve().then(() => {
      if (!valid || !scopeCurrent()) return;
      const state = restore.current()?.getState();
      if (!state) return;
      setReady(state.ready); setHandoff(state.exported && !isSender); handed.current = state.exported && !isSender;
      setUnknown(state.completionPending); unresolved.current = state.completionPending; setCompleted(state.completed);
      onPending(!isSender && (state.ready || state.completionPending));
      if (state.completionPending) setNotice("이전 수신 완료 결과를 원래 수신 키로 확인하세요.");
      else if (state.completed) setNotice("이미 수신 완료한 파일입니다.");
    });
    return () => { valid = false; };
  }, [isSender, onPending, scopeCurrent]);
  const run = async (action: () => Promise<void>) => {
    if (!current() || locked.current)
      return;
    locked.current = true;
    setBusy(true);
    setError(null);
    onPending(true);
    try {
      await action();
    }
    catch (cause) {
      if (scopeCurrent()) {
        if (cause instanceof ApiError && cause.status === 401 && token) {
          await expireSession(token);
          return;
        }
        setError(chatError(cause));
      }
    }
    finally {
      locked.current = false;
      if (scopeCurrent()) {
        setBusy(false);
        setProgress(null);
        onPending(!isSender && (!!transfer.current?.isReady() || unresolved.current));
      }
    }
  };
  const exportFile = (action: "save" | "share") => run(async () => {
    const op = operation();
    if (!op)
      return;
    if (!op.isReady()) {
      const downloaded = await op.download();
      if (!scopeCurrent() || !downloaded)
        return;
      setReady(true);
    }
    const result = await op[action]();
    if (!scopeCurrent() || !result)
      return;
    setNotice(result.message);
    if (isSender) {
      onPending(false);
      return;
    }
    handed.current = true;
    setHandoff(true);
    setNotice(result.requiresConfirmation ? "저장·공유 화면을 닫았습니다. 파일이 실제로 저장됐는지 확인한 뒤 아래 버튼을 누르세요." : "파일 저장을 확인했습니다. 아래에서 수신 완료를 확인하세요.");
  });
  const complete = () => run(async () => {
    const op = transfer.current;
    if (!op || !handed.current || !op.isReady())
      return;
    const accepted = await confirmation.ask({ title: "파일 수신 완료", message: "파일을 외부에 저장했는지 확인하세요. 수신 완료하면 서버의 원본 파일은 삭제되며 다시 받을 수 없습니다.", confirm: "파일을 저장했습니다", danger: true });
    if (!accepted || !current())
      return;
    unresolved.current = true;
    setUnknown(true);
    try { await op.complete({ confirmedSaved: true }); }
    catch (cause) {
      if (scopeCurrent()) { const state = op.getState(); unresolved.current = state.completionPending; setUnknown(state.completionPending); if (!state.completionPending) setNotice("수신 완료 요청을 보내지 않았습니다. 수신 정보가 맞지 않으면 파일 작업을 닫을 수 있습니다."); }
      throw cause;
    }
    if (!scopeCurrent())
      return;
    unresolved.current = false;
    setUnknown(false);
    setCompleted(true);
    handed.current = false;
    setHandoff(false);
    setNotice("파일 수신을 완료했습니다. 서버 원본 파일이 삭제되었습니다.");
    onPending(false);
    onChanged();
  });
  const retryComplete = () => run(async () => {
    const op = transfer.current;
    if (!op || !unresolved.current)
      return;
    const status = await op.status();
    if (!current())
      return;
    if (!status.match)
      throw new ApiError("이전 수신 키가 더 이상 일치하지 않습니다. 새 다운로드로 수신 완료를 대신하지 않습니다.", 409);
    try { await op.complete({ confirmedSaved: true }); }
    catch (cause) {
      if (scopeCurrent()) { const state = op.getState(); unresolved.current = state.completionPending; setUnknown(state.completionPending); if (!state.completionPending) setNotice("수신 완료 요청을 보내지 않았습니다. 수신 정보가 맞지 않으면 파일 작업을 닫을 수 있습니다."); }
      throw cause;
    }
    if (!scopeCurrent())
      return;
    unresolved.current = false;
    setUnknown(false);
    setCompleted(true);
    handed.current = false;
    setHandoff(false);
    setNotice("수신 완료 상태를 확인했습니다.");
    onPending(false);
    onChanged();
  });
  const close = async () => {
    if (!current() || locked.current)
      return;
    if (unresolved.current) { setError("수신 완료 결과가 불명확합니다. 원래 수신 완료 상태를 먼저 확인하세요."); return; }
    if (transfer.current?.isReady() || unresolved.current) {
      const accepted = await confirmation.ask({ title: "파일 작업 닫기", message: unresolved.current ? "수신 완료 결과가 불명확합니다. 이 작업을 닫으면 원래 수신 키로 확인할 수 없습니다. 먼저 수신 완료 상태를 확인하세요. 닫으시겠습니까?" : "수신 완료 전입니다. 외부 저장 여부를 확인하지 않으면 서버 원본은 삭제하지 않습니다. 닫으시겠습니까?", confirm: "닫기", danger: unresolved.current });
      if (!accepted || !current())
        return;
    }
    onClose();
  };
  const preview = () => {
    if (!current() || locked.current || transfer.current?.isReady() || unresolved.current || !token)
      return;
    registerChatPreviewAttachment({ attachment, token, peerId });
    onClose();
    router.push({ pathname: "/chat/file-preview", params: { attachmentId: attachment.id, peerId } });
  };
  if (!enabled)
    return null;
  return <Modal visible transparent animationType="none" accessibilityLabel="채팅 파일" onRequestClose={() => void close()} onShow={() => cancelButton.current?.focus()}><View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 16 }}><View style={{ width: "100%", maxWidth: 520, maxHeight: "95%", borderRadius: 12, backgroundColor: theme.surface, padding: 16, gap: 8 }}><Text accessibilityRole="header" aria-level={2} style={{ color: theme.text, fontSize: 17, fontWeight: "700" }}>채팅 파일</Text><ScrollView><Text selectable style={{ color: theme.text, fontSize: 14, lineHeight: 21 }}>{attachment.originalName}</Text><Text style={{ color: theme.secondary, fontSize: 13, marginTop: 4 }}>{chatFileSize(attachment.size)} · {isSender ? "보낸 파일" : "받은 파일"}</Text>{!isSender ? <Text style={{ color: theme.secondary, fontSize: 13, lineHeight: 20, marginTop: 8 }}>파일을 저장한 뒤 수신 완료하면 서버 원본이 삭제됩니다. 공유 화면에서 취소했다면 수신 완료하지 마세요.</Text> : null}<AccountFeedback error={error} message={notice}/></ScrollView>
  {(completed || ["deleted", "deleting"].includes(attachment.status)) && !unknown ? <Text style={{ color: theme.secondary, fontSize: 13 }}>원본 파일이 삭제되어 다운로드할 수 없습니다.</Text> : <>
   {chatPreviewKind(attachment.originalName) && attachment.size <= 4 * 1024 * 1024 && !ready && !unknown ? <TextAction label="미리보기" disabled={busy} icon="eye-outline" onPress={preview}/> : null}
   {!unknown ? <View style={{ gap: 8 }}><PrimaryButton title={busy ? progress === null ? "파일 처리 중" : `파일 처리 ${Math.floor(progress * 100)}%` : Platform.OS === "ios" ? "파일 저장·공유" : "파일 저장"} disabled={busy} onPress={() => void exportFile(Platform.OS === "ios" ? "share" : "save")}/>{Platform.OS === "android" ? <TextAction label="다른 앱으로 공유" disabled={busy} onPress={() => void exportFile("share")}/> : null}</View> : null}
   {!isSender && handoff && !unknown ? <PrimaryButton title="파일을 저장했습니다 · 수신 완료" disabled={busy} onPress={() => void complete()}/> : null}
   {unknown ? <PrimaryButton title="원래 수신 완료 상태 확인" disabled={busy} onPress={() => void retryComplete()}/> : null}
  </>}
  {busy ? <TextAction label="파일 요청 취소" onPress={() => { if (current()) transfer.current?.cancel(); }} /> : null}
  <TextAction ref={cancelButton} label="닫기" disabled={busy} onPress={() => void close()}/>
 </View></View>{confirmation.dialog}</Modal>;
}
