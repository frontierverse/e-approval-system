import { useFocusEffect } from "expo-router";
import { useNavigation, usePreventRemove } from "expo-router/react-navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Text, View, type ViewToken } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AccountFeedback } from "@/components/account-feedback";
import { ChatInput } from "@/components/chat-content";
import { ChatAttachmentActions } from "@/components/chat-attachment-actions";
import { EmptyState, PrimaryButton, TextAction } from "@/components/ui";
import { useConfirmAction } from "@/components/use-confirm-action";
import { ApiError } from "@/lib/api";
import { chatError, chatUnknownResult, compareChatSequence, formatChatTimestamp, isChatFilePolicy, isChatId, isChatMessage, isChatMessagePage, mergeChatMessages, newChatRequestId } from "@/lib/chat";
import { useChat } from "@/lib/chat-provider";
import { clearChatFileResources, discardChatFile, pickChatFile, uploadChatFile, type SelectedChatFile } from "@/lib/chat-file-transfer";
import { useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";
import type { ChatEmployee, ChatMessage } from "@/lib/types";
type SendAttempt = {
  requestId: string;
  body: string;
  file: SelectedChatFile | null;
};
export function ChatThreadScreen({ peerId }: {
  peerId: string;
}) {
  const { token } = useSession();
  const key = `${token}:${peerId}`;
  const scope = useRef(key);
  useLayoutEffect(() => {
    scope.current = key;
  }, [key]);
  const current = useCallback(() => !!token && scope.current === key, [key, token]);
  return token ? <ChatThreadContent key={key} peerId={peerId} isCurrentAccount={current}/> : null;
}
function ChatThreadContent({ peerId, isCurrentAccount }: {
  peerId: string;
  isCurrentAccount: () => boolean;
}) {
  const { token, user, expireSession } = useSession();
  const { authenticatedRequest, refreshSummary, isCurrentAccount: providerCurrent, foreground: appForeground } = useChat();
  const ownId = user?.id;
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const confirmation = useConfirmAction();
  const [attachmentTarget, setAttachmentTarget] = useState<(ChatMessage & { scopeGeneration: number }) | null>(null);
  const [filePending, setFilePending] = useState(false);
  const [peer, setPeer] = useState<ChatEmployee | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [privacy, setPrivacy] = useState(true);
  const [lastForeground, setLastForeground] = useState(appForeground);
  if (lastForeground !== appForeground) { setLastForeground(appForeground); setPrivacy(true); }
  const [body, setBody] = useState("");
  const [file, setFile] = useState<SelectedChatFile | null>(null);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const alive = useRef(false);
  const focused = useRef(false);
  const generation = useRef(0);
  const verified = useRef(false);
  const fetching = useRef(false);
  const mutation = useRef(false);
  const pending = useRef<SendAttempt | null>(null);
  const currentMessages = useRef(messages);
  const currentBody = useRef(body);
  const currentFile = useRef(file);
  const currentPeer = useRef(peer);
  const list = useRef<FlatList<ChatMessage>>(null);
  const foreground = useRef(appForeground);
  const visibleIds = useRef<string[]>([]);
  const readBusy = useRef(false);
  const readThrough = useRef("0");
  const atBottom = useRef(true);
  const bottomPositionPending = useRef(true);
  const abort = useRef<AbortController | null>(null);
  const abandonOnUnmount = useRef(false);
  useLayoutEffect(() => {
    foreground.current = appForeground;
  }, [appForeground]);
  const current = useCallback((epoch = generation.current) => alive.current && focused.current && generation.current === epoch && isCurrentAccount() && providerCurrent(), [providerCurrent, isCurrentAccount]);
  const updateMessages = useCallback((value: ChatMessage[]) => {
    currentMessages.current = value;
    setMessages(value);
  }, []);
  const updateFile = useCallback((value: SelectedChatFile | null) => {
    currentFile.current = value;
    setFile(value);
  }, []);
  const clearPrivate = useCallback(() => {
    verified.current = false;
    setPrivacy(true);
    currentPeer.current = null;
    setPeer(null);
    updateMessages([]);
    visibleIds.current = [];
  }, [updateMessages]);
  const invalidate = useCallback(() => { generation.current++; }, []);
  useEffect(() => {
    alive.current = true;
    invalidate();
    return () => {
      const selected = currentFile.current;
      if (selected && abandonOnUnmount.current && token && isCurrentAccount()) {
        try { discardChatFile(selected, { token, isCurrent: isCurrentAccount }); }
        catch { selected.release(); }
      } else selected?.release();
      alive.current = false;
      invalidate();
      abort.current?.abort();
      pending.current = null;
    };
  }, [invalidate, isCurrentAccount, token]);
  const load = useCallback(async (fresh = false, older = false) => {
    if (fetching.current || !current() || !foreground.current)
      return;
    if (!isChatId(peerId)) {
      clearPrivate();
      setLoading(false);
      setError("대화 상대 주소가 올바르지 않습니다.");
      return;
    }
    const epoch = generation.current;
    fetching.current = true;
    setLoading(true);
    if (fresh)
      clearPrivate();
    if (older) {
      bottomPositionPending.current = false;
      atBottom.current = false;
    }
    try {
      const first = older ? currentMessages.current[0]?.id : undefined;
      const [page, summary] = await Promise.all([authenticatedRequest<unknown>(`/chat/messages?peerId=${encodeURIComponent(peerId)}${first ? `&before=${encodeURIComponent(first)}` : ""}`), fresh ? refreshSummary() : Promise.resolve(null)]);
      if (!current(epoch))
        return;
      if (!isChatMessagePage(page, ownId, peerId))
        throw new ApiError("대화 응답을 확인하지 못했습니다. 다시 불러오세요.", 200);
      if (fresh) {
        if (!summary)
          throw new ApiError("대화 상대의 상태를 확인하지 못했습니다. 다시 불러오세요.", 503);
        const person = summary.employees.find(e => e.id === peerId) ?? summary.conversations.find(c => c.peer.id === peerId)?.peer;
        if (!person)
          throw new ApiError("현재 확인할 수 없는 대화입니다.", 404);
        currentPeer.current = person;
        setPeer(person);
      }
      if (older) {
        const merged = mergeChatMessages(page.messages, { messages: currentMessages.current, hasMore: false });
        updateMessages(merged.messages);
        setHasMore(page.hasMore);
      }
      else {
        const merged = fresh ? { messages: page.messages, gap: false } : mergeChatMessages(currentMessages.current, page);
        updateMessages(merged.messages);
        if (fresh || merged.gap)
          setHasMore(page.hasMore);
        if (merged.gap)
          setNotice("새 메시지 사이에 이전 기록이 있습니다. 이전 메시지를 불러오세요.");
      }
      verified.current = true;
      setPrivacy(false);
      setError(null);
    }
    catch (cause) {
      if (!current(epoch))
        return;
      if (cause instanceof ApiError && [401, 403, 404].includes(cause.status)) {
        clearPrivate();
        setAttachmentTarget(null); setFilePending(false);
        void clearChatFileResources().catch(() => {});
        currentFile.current?.release();
        updateFile(null);
        pending.current = null;
        setUncertain(false);
        currentBody.current = "";
        setBody("");
      }
      setError(chatError(cause));
    }
    finally {
      if (generation.current === epoch) {
        fetching.current = false;
        if (current(epoch))
          setLoading(false);
      }
    }
  }, [authenticatedRequest, refreshSummary, clearPrivate, current, peerId, updateFile, updateMessages, ownId]);
  const latestLoad = useRef(load);
  useLayoutEffect(() => {
    latestLoad.current = load;
  }, [load]);
  useFocusEffect(useCallback(() => {
    focused.current = true;
    verified.current = false;
    setPrivacy(true);
    atBottom.current = true;
    bottomPositionPending.current = true;
    void latestLoad.current(true);
    return () => {
      focused.current = false;
      generation.current++;
      verified.current = false;
      setPrivacy(true);
      visibleIds.current = [];
      fetching.current = false;
      readBusy.current = false;
      if (mutation.current && pending.current) {
        setUncertain(true);
        setError("전송 결과를 확인하지 못했습니다. 같은 내용으로 다시 확인하세요.");
      }
      abort.current?.abort();
      mutation.current = false;
      setBusy(false);
    };
  }, []));
  useEffect(() => {
    if (!appForeground) {
      verified.current = false;
      visibleIds.current = [];
    }
    else if (focused.current)
      void latestLoad.current(true);
    const timer = setInterval(() => {
      if (foreground.current && focused.current)
        void latestLoad.current(!verified.current);
    }, 5000);
    return () => clearInterval(timer);
  }, [appForeground]);
  const markVisibleRead = useCallback(async () => {
    if (!current() || !foreground.current || !verified.current || readBusy.current || !atBottom.current || !user)
      return;
    const candidates = currentMessages.current.filter(m => visibleIds.current.includes(m.id) && m.recipientId === user.id && m.senderId === peerId && m.readAt === null);
    const target = candidates.at(-1);
    if (!target || compareChatSequence(target.sequence, readThrough.current) <= 0)
      return;
    const epoch = generation.current;
    readBusy.current = true;
    try {
      const result = await authenticatedRequest<{
        ok: boolean;
      }>("/chat/read", { method: "POST", body: { peerId, messageId: target.id } });
      if (!current(epoch))
        return;
      if (result.ok !== true)
        throw new ApiError("읽음 상태를 확인하지 못했습니다.", 200);
      readThrough.current = target.sequence;
      setReadError(null);
      void refreshSummary();
    }
    catch (cause) {
      if (current(epoch))
        setReadError(chatError(cause));
    }
    finally {
      if (generation.current === epoch)
        readBusy.current = false;
    }
  }, [authenticatedRequest, refreshSummary, current, peerId, user]);
  const latestRead = useRef(markVisibleRead);
  useLayoutEffect(() => {
    latestRead.current = markVisibleRead;
  }, [markVisibleRead]);
  const [viewability] = useState(() => ({ viewAreaCoveragePercentThreshold: 100, minimumViewTime: 250 }));
  const onViewable = useCallback(({ viewableItems }: {
    viewableItems: ViewToken<ChatMessage>[];
  }) => {
    visibleIds.current = viewableItems.filter(v => v.isViewable).map(v => v.item.id);
    void latestRead.current();
  }, []);
  const dirty = !!body.trim() || !!file || uncertain || busy || filePending;
  const updateFilePending = useCallback((value: boolean) => setFilePending(value), []);
  const openAttachment = (message: ChatMessage) => {
    if (current() && verified.current && foreground.current && !mutation.current) {
      setAttachmentTarget({ ...message, scopeGeneration: generation.current });
    }
  };
  usePreventRemove(!!user && dirty, ({ data }) => {
    if (!current() || mutation.current)
      return;
    if (filePending) { setError("먼저 파일 작업을 닫거나 원래 수신 완료 상태를 확인하세요."); return; }
    const epoch = generation.current;
    void confirmation.ask({ title: "대화 화면 나가기", message: "작성한 내용과 선택한 파일이 사라집니다. 전송 결과가 불명확하면 같은 전송으로 먼저 확인하세요. 나가시겠습니까?", confirm: "나가기", danger: true }).then(ok => {
      if (ok && current(epoch) && !mutation.current) {
        abandonOnUnmount.current = true;
        navigation.dispatch(data.action);
      }
    });
  });
  useEffect(() => {
    if (Platform.OS !== "web" || !dirty)
      return;
    const prevent = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty]);
  const change = (value: string) => {
    if (!current() || !verified.current || mutation.current || pending.current)
      return;
    currentBody.current = value;
    setBody(value);
    setError(null);
  };
  const chooseFile = async () => {
    if (!current() || !verified.current || mutation.current || pending.current || !token || !currentPeer.current?.active)
      return;
    const epoch = generation.current;
    mutation.current = true;
    setBusy(true);
    try {
      const policy = await authenticatedRequest<unknown>("/chat/files");
      if (!current(epoch))
        return;
      if (!isChatFilePolicy(policy))
        throw new ApiError("파일 정책을 확인하지 못했습니다.", 200);
      const selected = await pickChatFile({ policy, token, isCurrent: () => current(epoch) });
      if (!current(epoch)) {
        selected?.release();
        return;
      }
      if (selected) {
        currentFile.current?.release();
        updateFile(selected);
      }
      setError(null);
    }
    catch (cause) {
      if (current(epoch))
        setError(chatError(cause));
    }
    finally {
      if (generation.current === epoch) {
        mutation.current = false;
        if (current(epoch))
          setBusy(false);
      }
    }
  };
  const send = async () => {
    if (!current() || !verified.current || mutation.current || !token || !user || (!currentPeer.current?.active && !pending.current) || !foreground.current)
      return;
    const previous = pending.current;
    const input = previous ?? { requestId: newChatRequestId(), body: currentBody.current.trim(), file: currentFile.current };
    if (input.body.length > 2000 || (!input.body && !input.file)) {
      setError("메시지를 1~2,000자로 입력하거나 파일 한 개를 선택하세요.");
      return;
    }
    const epoch = generation.current;
    mutation.current = true;
    pending.current = input;
    setBusy(true);
    setError(null);
    setNotice(null);
    setProgress(null);
    abort.current = new AbortController();
    try {
      const response = input.file ? await uploadChatFile({ peerId, actorId: user.id, body: input.body, requestId: input.requestId, file: input.file, token, signal: abort.current.signal, isCurrent: () => current(epoch), onProgress: (value: number | null) => {
          if (current(epoch))
            setProgress(value);
        } }) : await authenticatedRequest<{
        message: unknown;
      }>("/chat/messages", { method: "POST", body: { peerId, body: input.body, requestId: input.requestId } });
      if (!current(epoch))
        return;
      const expectedBody = input.file && !input.body ? `파일: ${input.file.name}` : input.body;
      if (!isChatMessage(response.message, user.id, peerId) || response.message.senderId !== user.id || response.message.body !== expectedBody)
        throw new ApiError("메시지 전송 응답을 확인하지 못했습니다.", 200);
      updateMessages(mergeChatMessages(currentMessages.current, { messages: [response.message], hasMore: false }).messages);
      pending.current = null;
      setUncertain(false);
      currentBody.current = "";
      setBody("");
      input.file?.release();
      updateFile(null);
      setNotice("메시지를 전송했습니다.");
      void refreshSummary();
      atBottom.current = true;
      bottomPositionPending.current = true;
      list.current?.scrollToEnd({ animated: false });
    }
    catch (cause) {
      if (!current(epoch))
        return;
      if (cause instanceof ApiError && cause.status === 401) {
        await expireSession(token);
        return;
      }
      if (chatUnknownResult(cause) || cause instanceof ApiError && [409, 404, 410].includes(cause.status)) {
        setUncertain(true);
        setError(`${chatError(cause)} 원래 내용과 같은 전송 키를 보관했습니다. 자동으로 다시 전송하지 않습니다.`);
      }
      else {
        pending.current = null;
        setUncertain(false);
        setError(chatError(cause));
      }
    }
    finally {
      if (generation.current === epoch) {
        mutation.current = false;
        abort.current = null;
        if (current(epoch)) {
          setBusy(false);
          setProgress(null);
        }
      }
    }
  };
  const discard = async () => {
    if (!current() || mutation.current)
      return;
    const epoch = generation.current;
    const ok = await confirmation.ask({ title: "작성 내용 버리기", message: uncertain ? "이미 전송되었을 수 있습니다. 원래 전송 확인 없이 입력을 버리면 같은 내용을 새로 보내지 않도록 주의하세요. 버리시겠습니까?" : "작성한 메시지와 선택한 파일을 버리시겠습니까?", confirm: "버리기", danger: true });
    if (ok && current(epoch)) {
      try { if (currentFile.current && token) discardChatFile(currentFile.current, { token, isCurrent: () => current(epoch) }); }
      catch (cause) { if (current(epoch)) setError(chatError(cause)); return; }
      updateFile(null);
      pending.current = null;
      setUncertain(false);
      currentBody.current = "";
      setBody("");
      setError(null);
    }
  };
  const stopFollowing = () => {
    if (!current() || !verified.current) return;
    bottomPositionPending.current = false;
    atBottom.current = false;
  };
  const masked = privacy || !appForeground;
  return <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={64} style={{ flex: 1, backgroundColor: theme.background, width: "100%", maxWidth: 900, alignSelf: "center" }}>
  <View style={{ paddingHorizontal: 16, paddingTop: 8 }}><View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}><Text accessibilityRole="header" aria-level={2} style={{ color: theme.text, fontSize: 16, fontWeight: "700" }}>{masked ? "대화 확인 중" : peer?.name ?? "대화"}</Text><TextAction label="새로고침" disabled={busy || loading} icon="refresh" onPress={() => void load(true)}/></View><AccountFeedback error={error} message={notice}/>{readError ? <><AccountFeedback error={`읽음 상태: ${readError}`}/><TextAction label="읽음 상태 다시 확인" onPress={() => void markVisibleRead()}/></> : null}</View>
  {masked ? <View style={{ flex: 1, padding: 16 }}>{loading ? <ActivityIndicator color={theme.accent}/> : <EmptyState title="대화를 확인하지 못했습니다" detail="새로고침으로 현재 접근 권한을 다시 확인하세요."/>}</View> : <FlatList ref={list} data={messages} keyExtractor={m => m.id} accessibilityRole="list" accessibilityLabel="대화 메시지" contentContainerStyle={{ padding: 16, gap: 8 }} keyboardShouldPersistTaps="handled" maintainVisibleContentPosition={{ minIndexForVisible: 0 }} viewabilityConfig={viewability} onViewableItemsChanged={onViewable} onScrollBeginDrag={stopFollowing} onTouchMove={stopFollowing} {...(Platform.OS === "web" ? { onWheel: stopFollowing } : {})} onScroll={event => {
    if (!current() || !verified.current) return;
    const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;
    atBottom.current = contentOffset.y + layoutMeasurement.height >= contentSize.height - 24;
    if (atBottom.current) {
      bottomPositionPending.current = false;
      void latestRead.current();
    }
  }} scrollEventThrottle={100} onContentSizeChange={(_width, height) => {
    // Use the measured content height; virtualized scrollToEnd can estimate a shorter final row.
    if (current() && verified.current && (bottomPositionPending.current || atBottom.current) && Number.isFinite(height) && height > 0)
      list.current?.scrollToOffset({ offset: height, animated: false });
  }} ListHeaderComponent={hasMore ? <TextAction label={loading ? "이전 메시지 확인 중" : "이전 메시지 50개 불러오기"} disabled={loading} onPress={() => void load(false, true)}/> : null} ListEmptyComponent={<EmptyState title="아직 메시지가 없습니다" detail="아래에서 첫 메시지를 보내세요."/>} renderItem={({ item }) => <View role="listitem" style={{ alignSelf: item.senderId === user?.id ? "flex-end" : "flex-start", maxWidth: "92%", borderWidth: 1, borderColor: theme.border, borderRadius: 10, backgroundColor: item.senderId === user?.id ? theme.accentSoft : theme.surface, padding: 10, gap: 4 }}>{item.body ? <Text selectable style={{ color: theme.text, fontSize: 14, lineHeight: 21 }}>{item.body}</Text> : null}{item.attachment ? <TextAction label={item.attachment.originalName} icon="document-attach-outline" accessibilityLabel={`${item.attachment.originalName} 파일 작업 열기`} onPress={() => openAttachment(item)}/> : null}<Text style={{ color: theme.muted, fontSize: 11 }}>{formatChatTimestamp(item.createdAt)}{item.senderId === user?.id ? item.readAt ? " · 읽음" : " · 안 읽음" : ""}</Text></View>}/>}
  {!masked && peer ? <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 8), borderTopWidth: 1, borderTopColor: theme.border, backgroundColor: theme.surface, gap: 4 }}>{!peer.active && !uncertain ? <Text style={{ color: theme.secondary, fontSize: 13 }}>현재 메시지를 보낼 수 없는 직원입니다. 이전 대화만 확인할 수 있습니다.</Text> : <><ChatInput label="메시지 입력" value={body} onChange={change} multiline placeholder="메시지 입력 (2,000자까지)" disabled={busy || uncertain || !peer.active}/><Text style={{ color: body.length > 2000 ? theme.danger : theme.muted, fontSize: 12, textAlign: "right" }}>{body.length}/2,000</Text>{file ? <Text style={{ color: theme.secondary, fontSize: 13 }} numberOfLines={2}>{file.name} · {(file.size / 1024 / 1024).toFixed(1)}MB</Text> : null}<View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><TextAction label="파일 선택" icon="attach" disabled={busy || uncertain || !!file || !peer.active} onPress={() => void chooseFile()}/><View style={{ flex: 1 }}><PrimaryButton title={busy ? progress === null ? "전송 중" : `전송 ${Math.floor(progress * 100)}%` : uncertain ? "같은 전송 다시 확인" : "보내기"} disabled={busy || (!body.trim() && !file)} onPress={() => void send()}/></View></View>{busy && file ? <TextAction label="파일 전송 취소" onPress={() => { if (current() && mutation.current) abort.current?.abort(); }} /> : null}{dirty && !busy ? <TextAction label="작성 내용 버리기" onPress={() => void discard()}/> : null}</>}</View> : null}
  {attachmentTarget?.attachment ? <ChatAttachmentActions key={attachmentTarget.attachment.id} attachment={attachmentTarget.attachment} peerId={peerId} messageId={attachmentTarget.id} isSender={attachmentTarget.senderId === user?.id} enabled={!masked} isCurrent={() => current(attachmentTarget.scopeGeneration)} onClose={() => {
    if (current()) {
      setAttachmentTarget(null);
      setFilePending(false);
    }
  }} onPending={updateFilePending} onChanged={() => {
    if (current()) {
      void load();
      void refreshSummary();
    }
  }}/> : null}
  {confirmation.dialog}
 </KeyboardAvoidingView>;
}
