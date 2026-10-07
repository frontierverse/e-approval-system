import { KeyboardScreen } from "@/components/keyboard-screen";
import { router, Stack, useFocusEffect } from "expo-router";
import { useNavigation } from 'expo-router/react-navigation';
import { usePreventRemove } from '@/lib/use-protected-navigation';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { FlatList, Keyboard, Platform, ScrollView, View, useWindowDimensions, type ViewToken } from "react-native";
import { DetailText as Text } from "@/components/document-detail-ui";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { AccountFeedback } from "@/components/account-feedback";
import { ChatThreadInput as ChatInput, ChatThreadAction as TextAction, ChatThreadSend as PrimaryButton, ChatThreadMessage, ChatThreadLoading, ChatThreadSelectedFile } from "@/components/chat-thread-ui";
import { ChatAttachmentActions } from "@/components/chat-attachment-actions";
import { EmptyState } from "@/components/ui";
import { useConfirmAction } from "@/components/use-confirm-action";
import { ApiError } from "@/lib/api";
import { chatError, chatUnknownResult, compareChatSequence, isChatFilePolicy, isChatId, isChatMessage, isChatMessagePage, mergeChatMessages, newChatRequestId } from "@/lib/chat";
import { useChat } from "@/lib/chat-provider";
import { clearChatFileResources, discardChatFile, pickChatFile, uploadChatFile, type SelectedChatFile } from "@/lib/chat-file-transfer";
import { useSession } from "@/lib/session";
import { useHomeTheme as useTheme } from "@/lib/home-theme";
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
  const { authenticatedRequest, refreshSummary, isCurrentAccount: providerCurrent, foreground: appForeground, foregroundEpoch, isForegroundCurrent } = useChat();
  const ownId = user?.id;
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const confirmation = useConfirmAction({ colors: theme, sheet: true, bottomInset: insets.bottom });
  const { height, width, fontScale } = useWindowDimensions();
  const compactActions = width < 320 || fontScale >= 1.3;
  const [viewportHeight, setViewportHeight] = useState(height);
  const [headerHeight, setHeaderHeight] = useState(52);
  const [actionHeight, setActionHeight] = useState(58);
  const [attachmentTarget, setAttachmentTarget] = useState<(ChatMessage & { scopeGeneration: number }) | null>(null);
  const [filePending, setFilePending] = useState(false);
  const [peer, setPeer] = useState<ChatEmployee | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [privacy, setPrivacy] = useState(true);
  const [screenFocused, setScreenFocused] = useState(false);
  const [lastForegroundEpoch, setLastForegroundEpoch] = useState(foregroundEpoch);
  const [body, setBody] = useState("");
  const [file, setFile] = useState<SelectedChatFile | null>(null);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [verifiedRenderEpoch, setVerifiedRenderEpoch] = useState(-1);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [newBelow, setNewBelow] = useState(0);
  if (lastForegroundEpoch !== foregroundEpoch) {
    setLastForegroundEpoch(foregroundEpoch);
    setPrivacy(true);
    setError(null);
    setNotice(null);
    setReadError(null);
    setBusy(selecting);
    if (sending) {
      setSending(false);
      setUncertain(true);
      setError("전송 결과를 확인하지 못했습니다. 같은 내용으로 다시 확인하세요.");
    }
  }
  const alive = useRef(false);
  const focused = useRef(false);
  const generation = useRef(0);
  const verified = useRef(false);
  const verifiedForeground = useRef(-1);
  const selectedAfterHandoff = useRef<SelectedChatFile | null>(null);
  const pickerPending = useRef(false);
  const pickerAllowed = useRef(false);
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
  const currentForeground = useCallback((epoch = generation.current) => current(epoch) && isForegroundCurrent(foregroundEpoch), [current, foregroundEpoch, isForegroundCurrent]);
  const readyForAction = useCallback(() => currentForeground() && verified.current && verifiedForeground.current === foregroundEpoch, [currentForeground, foregroundEpoch]);
  const updateMessages = useCallback((value: ChatMessage[]) => {
    if (verified.current && !atBottom.current) {
      const known = new Set(currentMessages.current.map(message => message.id));
      const added = value.filter(message => !known.has(message.id) && message.senderId === peerId && compareChatSequence(message.sequence, currentMessages.current.at(-1)?.sequence ?? "0") > 0).length;
      if (added) setNewBelow(count => count + added);
    }
    currentMessages.current = value;
    setMessages(value);
  }, [peerId]);
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
    setNewBelow(0);
  }, [updateMessages]);
  const invalidate = useCallback(() => { generation.current++; }, []);
  useEffect(() => {
    alive.current = true;
    invalidate();
    return () => {
      selectedAfterHandoff.current?.release();
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
    if (fetching.current || !currentForeground() || !foreground.current)
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
    if (fresh) {
      setError(null);
      setNotice(null);
      setReadError(null);
      clearPrivate();
    }
    if (older) {
      bottomPositionPending.current = false;
      atBottom.current = false;
    }
    try {
      const first = older ? currentMessages.current[0]?.id : undefined;
      const [page, summary] = await Promise.all([authenticatedRequest<unknown>(`/chat/messages?peerId=${encodeURIComponent(peerId)}${first ? `&before=${encodeURIComponent(first)}` : ""}`), fresh ? refreshSummary() : Promise.resolve(null)]);
      if (!currentForeground(epoch))
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
      verifiedForeground.current = foregroundEpoch;
      setVerifiedRenderEpoch(foregroundEpoch);
      if (selectedAfterHandoff.current) {
        currentFile.current?.release();
        updateFile(selectedAfterHandoff.current);
        selectedAfterHandoff.current = null;
      }
      setPrivacy(false);
      setError(null);
    }
    catch (cause) {
      if (!currentForeground(epoch))
        return;
      if (cause instanceof ApiError && [401, 403, 404].includes(cause.status)) {
        clearPrivate();
        pickerAllowed.current = false;
        selectedAfterHandoff.current?.release();
        selectedAfterHandoff.current = null;
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
      if (generation.current === epoch && isForegroundCurrent(foregroundEpoch)) {
        fetching.current = false;
        if (currentForeground(epoch))
          setLoading(false);
      }
    }
  }, [authenticatedRequest, refreshSummary, clearPrivate, currentForeground, foregroundEpoch, isForegroundCurrent, peerId, updateFile, updateMessages, ownId]);
  const latestLoad = useRef(load);
  useLayoutEffect(() => {
    latestLoad.current = load;
  }, [load]);
  useLayoutEffect(() => {
    verified.current = false;
    verifiedForeground.current = -1;
    visibleIds.current = [];
    fetching.current = false;
    readBusy.current = false;
    abort.current?.abort();
    mutation.current = false;
  }, [foregroundEpoch]);
  useFocusEffect(useCallback(() => {
    focused.current = true;
    setScreenFocused(true);
    verified.current = false;
    setPrivacy(true);
    atBottom.current = true;
    bottomPositionPending.current = true;
    void latestLoad.current(true);
    return () => {
      focused.current = false;
      setScreenFocused(false);
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
    if (appForeground && focused.current)
      void latestLoad.current(true);
    const timer = setInterval(() => {
      if (isForegroundCurrent(foregroundEpoch) && focused.current)
        void latestLoad.current(!verified.current);
    }, 5000);
    return () => clearInterval(timer);
  }, [appForeground, foregroundEpoch, isForegroundCurrent]);
  const markVisibleRead = useCallback(async () => {
    if (!readyForAction() || readBusy.current || !atBottom.current || !user)
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
      if (!currentForeground(epoch))
        return;
      if (result.ok !== true)
        throw new ApiError("읽음 상태를 확인하지 못했습니다.", 200);
      readThrough.current = target.sequence;
      setReadError(null);
      void refreshSummary();
    }
    catch (cause) {
      if (currentForeground(epoch))
        setReadError(chatError(cause));
    }
    finally {
      if (generation.current === epoch && isForegroundCurrent(foregroundEpoch))
        readBusy.current = false;
    }
  }, [authenticatedRequest, refreshSummary, currentForeground, foregroundEpoch, isForegroundCurrent, readyForAction, peerId, user]);
  const latestRead = useRef(markVisibleRead);
  useLayoutEffect(() => {
    latestRead.current = markVisibleRead;
  }, [markVisibleRead]);
  const [viewability] = useState(() => ({ viewAreaCoveragePercentThreshold: 100, minimumViewTime: 250 }));
  const onViewable = useCallback(({ viewableItems }: {
    viewableItems: ViewToken<ChatMessage>[];
  }) => {
    if (!readyForAction()) return;
    visibleIds.current = viewableItems.filter(v => v.isViewable).map(v => v.item.id);
    void latestRead.current();
  }, [readyForAction]);
  const dirty = !!body.trim() || !!file || uncertain || busy || selecting || filePending;
  const updateFilePending = useCallback((value: boolean) => setFilePending(value), []);
  const openAttachment = (message: ChatMessage) => {
    if (readyForAction() && !mutation.current) {
      Keyboard.dismiss();
      setAttachmentTarget({ ...message, scopeGeneration: generation.current });
    }
  };
  usePreventRemove(!!user && dirty, ({ data }) => {
    if (!readyForAction() || mutation.current || pickerPending.current)
      return;
    if (filePending) { setError("먼저 파일 작업을 닫거나 원래 수신 완료 상태를 확인하세요."); return; }
    const epoch = generation.current;
    void confirmation.ask({ title: "대화 화면 나가기", message: "작성한 내용과 선택한 파일이 사라집니다. 전송 결과가 불명확하면 같은 전송으로 먼저 확인하세요. 나가시겠습니까?", confirm: "나가기", danger: true }).then(ok => {
      if (ok && currentForeground(epoch) && !mutation.current) {
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
    if (!readyForAction() || mutation.current || pickerPending.current || pending.current)
      return;
    currentBody.current = value;
    setBody(value);
    setError(null);
  };
  const chooseFile = async () => {
    if (!readyForAction() || mutation.current || pickerPending.current || pending.current || !token || !currentPeer.current?.active)
      return;
    const epoch = generation.current;
    mutation.current = true;
    pickerPending.current = true;
    pickerAllowed.current = true;
    setSelecting(true);
    setBusy(true);
    try {
      const policy = await authenticatedRequest<unknown>("/chat/files");
      if (!currentForeground(epoch))
        return;
      if (!isChatFilePolicy(policy))
        throw new ApiError("파일 정책을 확인하지 못했습니다.", 200);
      const selected = await pickChatFile({ policy, token, isCurrent: () => current(epoch) && pickerAllowed.current });
      if (!current(epoch) || !pickerAllowed.current) {
        selected?.release();
        return;
      }
      if (selected) {
        if (verified.current && isForegroundCurrent(verifiedForeground.current)) {
          currentFile.current?.release();
          updateFile(selected);
        } else {
          selectedAfterHandoff.current?.release();
          selectedAfterHandoff.current = selected;
        }
      }
      setError(null);
    }
    catch (cause) {
      if (currentForeground(epoch))
        setError(chatError(cause));
    }
    finally {
      if (generation.current === epoch) {
        pickerPending.current = false;
        mutation.current = false;
        if (current(epoch)) {
          setSelecting(false);
          setBusy(false);
        }
      }
    }
  };
  const send = async () => {
    if (!readyForAction() || mutation.current || pickerPending.current || !token || !user || (!currentPeer.current?.active && !pending.current) || !foreground.current)
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
    setSending(true);
    setBusy(true);
    setError(null);
    setNotice(null);
    setProgress(null);
    abort.current = new AbortController();
    try {
      const response = input.file ? await uploadChatFile({ peerId, actorId: user.id, body: input.body, requestId: input.requestId, file: input.file, token, signal: abort.current.signal, isCurrent: () => currentForeground(epoch), onProgress: (value: number | null) => {
          if (currentForeground(epoch))
            setProgress(value);
        } }) : await authenticatedRequest<{
        message: unknown;
      }>("/chat/messages", { method: "POST", body: { peerId, body: input.body, requestId: input.requestId } });
      if (!currentForeground(epoch))
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
      if (!currentForeground(epoch))
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
      if (generation.current === epoch && isForegroundCurrent(foregroundEpoch)) {
        mutation.current = false;
        abort.current = null;
        if (currentForeground(epoch)) {
          setSending(false);
          setBusy(false);
          setProgress(null);
        }
      }
    }
  };
  const discard = async () => {
    if (!readyForAction() || mutation.current || pickerPending.current)
      return;
    const epoch = generation.current;
    const ok = await confirmation.ask({ title: "작성 내용 버리기", message: uncertain ? "이미 전송되었을 수 있습니다. 원래 전송 확인 없이 입력을 버리면 같은 내용을 새로 보내지 않도록 주의하세요. 버리시겠습니까?" : "작성한 메시지와 선택한 파일을 버리시겠습니까?", confirm: "버리기", danger: true });
    if (ok && currentForeground(epoch)) {
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
    if (!readyForAction()) return;
    bottomPositionPending.current = false;
    atBottom.current = false;
  };
  const masked = privacy || !appForeground || !isForegroundCurrent(foregroundEpoch) || verifiedRenderEpoch !== foregroundEpoch;
  const showFeedback = lastForegroundEpoch === foregroundEpoch && screenFocused && appForeground && isForegroundCurrent(foregroundEpoch) && (!masked || !loading);
  // Measure the content after KeyboardScreen reserves native keyboard space. The actions stay
  // outside the scrolling composer, including at large font sizes and short keyboard viewports.
  const composerLimit = Math.max(actionHeight + 44, Math.min(427, viewportHeight - headerHeight - 96));
  return <SafeAreaView edges={["top", "left", "right"]} style={{ flex: 1, backgroundColor: theme.surface }}><Stack.Screen options={{ headerShown: false }} />
  <KeyboardScreen style={{ flex: 1, backgroundColor: theme.background, width: "100%" }}>
  <View accessibilityElementsHidden={!!attachmentTarget && !masked} importantForAccessibility={attachmentTarget && !masked ? "no-hide-descendants" : "auto"} onLayout={event => setViewportHeight(event.nativeEvent.layout.height)} style={{ flex: 1, minHeight: 0 }}>
  <View onLayout={event => setHeaderHeight(event.nativeEvent.layout.height)} style={{ minHeight: 52, backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border }}><View style={{ width: "100%", maxWidth: 760, alignSelf: "center", minHeight: 51, padding: 4, gap: 4, flexDirection: "row", alignItems: "center" }}>
    <TextAction label="대화 목록으로" icon="chevron-left" iconOnly onPress={() => { if (router.canGoBack()) router.back(); else router.replace("/chat"); }} />
    <View style={{ flex: 1, minWidth: 0 }}><Text accessibilityRole="header" aria-level={1} style={{ color: theme.text, fontSize: 16, lineHeight: 21.6, fontWeight: "700" }}>{masked ? "대화 확인 중" : peer?.name ?? "대화"}</Text>
      {!masked && peer ? <Text numberOfLines={2} style={{ color: theme.secondary, fontSize: 12, lineHeight: 16.8 }}>{peer.departmentName} · {peer.positionName}{!peer.active ? " · 기록" : ""}</Text> : null}</View>
    <TextAction label="새로고침" disabled={busy || loading} icon="rotate-cw" iconOnly onPress={() => void load(true)} />
  </View></View>
  {showFeedback && !uncertain && (error || !masked && notice) ? <View style={{ paddingHorizontal: 12 }}><AccountFeedback error={error} message={masked ? null : notice} /></View> : null}
  {!masked && showFeedback && readError ? <View style={{ paddingHorizontal: 12 }}><AccountFeedback error={`읽음 상태: ${readError}`} /><TextAction label="읽음 상태 다시 확인" onPress={() => void markVisibleRead()} /></View> : null}
  {masked ? <View style={{ flex: 1, minHeight: 96 }}>{loading ? <ChatThreadLoading /> : <View style={{ padding: 16 }}><EmptyState title="대화를 확인하지 못했습니다" detail="새로고침으로 현재 접근 권한을 다시 확인하세요." /></View>}</View> : <FlatList key={foregroundEpoch} ref={list} data={messages} keyExtractor={m => m.id} accessibilityRole="list" accessibilityLabel="대화 메시지" style={{ flex: 1, minHeight: 96, width: "100%", maxWidth: 760, alignSelf: "center" }} contentContainerStyle={{ paddingTop: 12, paddingHorizontal: 16, paddingBottom: 16, gap: 12 }} keyboardShouldPersistTaps="handled" maintainVisibleContentPosition={{ minIndexForVisible: 0 }} viewabilityConfig={viewability} onViewableItemsChanged={onViewable} onScrollBeginDrag={stopFollowing} onTouchMove={stopFollowing} {...(Platform.OS === "web" ? { onWheel: stopFollowing } : {})} onScroll={event => {
    if (!readyForAction()) return;
    const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;
    atBottom.current = contentOffset.y + layoutMeasurement.height >= contentSize.height - 24;
    if (atBottom.current) {
      setNewBelow(0);
      bottomPositionPending.current = false;
      void latestRead.current();
    }
  }} scrollEventThrottle={100} onContentSizeChange={(_width, height) => {
    // Use the measured content height; virtualized scrollToEnd can estimate a shorter final row.
    if (readyForAction() && (bottomPositionPending.current || atBottom.current) && Number.isFinite(height) && height > 0)
      list.current?.scrollToOffset({ offset: height, animated: false });
  }} ListHeaderComponent={hasMore ? <TextAction label={loading ? "이전 메시지 확인 중" : "이전 메시지 50개 불러오기"} pill disabled={loading} onPress={() => void load(false, true)} /> : null} ListEmptyComponent={<EmptyState title="아직 메시지가 없습니다" detail="아래에서 첫 메시지를 보내세요." />} renderItem={({ item }) => <ChatThreadMessage item={item} own={item.senderId === user?.id} peerName={peer?.name}>{item.attachment ? <TextAction label={item.attachment.originalName} attachment={item.attachment} accessibilityLabel={`${item.attachment.originalName} 파일 작업 열기`} onPress={() => openAttachment(item)} /> : null}</ChatThreadMessage>} />}
  {!masked && newBelow > 0 ? <View style={{ paddingHorizontal: 12, paddingVertical: 4, backgroundColor: theme.surface }}><TextAction label={`새 메시지 ${newBelow}개 · 최신 메시지로`} onPress={() => {
    if (!readyForAction()) return;
    visibleIds.current = [];
    atBottom.current = true;
    bottomPositionPending.current = true;
    setNewBelow(0);
    list.current?.scrollToEnd({ animated: false });
  }} /></View> : null}
  {!masked && peer ? <View style={{ maxHeight: composerLimit, flexShrink: 1, borderTopWidth: 1, borderTopColor: theme.border, backgroundColor: theme.surface }}>
    <ScrollView style={{ flexShrink: 1, maxHeight: Math.max(44, composerLimit - actionHeight), width: "100%", maxWidth: 760, alignSelf: "center" }} contentContainerStyle={{ paddingTop: 8, paddingHorizontal: 12, gap: 8 }} keyboardShouldPersistTaps="handled">
      {uncertain ? <View accessibilityRole="alert" style={{ backgroundColor: theme.dangerSoft, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 10, gap: 6 }}>
        <Text style={{ color: theme.danger, fontSize: 13, lineHeight: 19.5 }}><Text style={{ fontWeight: "700" }}>전송 결과 확인 필요</Text> · 이미 보내졌을 수 있어요. 새로 보내지 말고 같은 전송을 확인하세요.</Text>
        {!compactActions ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}><PrimaryButton title={busy ? "같은 전송 확인 중" : "같은 전송 다시 확인"} disabled={busy} onPress={() => void send()} /><TextAction label="작성 내용 버리기" warning disabled={busy} onPress={() => void discard()} /></View> : null}
      </View> : null}
      {!peer.active ? <Text style={{ color: theme.secondary, fontSize: 13, lineHeight: 20 }}>현재 메시지를 보낼 수 없는 직원입니다. 이전 대화만 확인할 수 있습니다.</Text> : <ChatInput label="메시지 입력" value={body} onChange={change} multiline placeholder="메시지 입력" disabled={busy || uncertain} />}
      {file ? <ChatThreadSelectedFile name={file.name} size={file.size} /> : null}
      {busy && file ? <TextAction label="파일 전송 취소" onPress={() => { if (readyForAction() && mutation.current) abort.current?.abort(); }} /> : null}
      {dirty && !busy && !uncertain ? <View style={{ alignSelf: "flex-start" }}><TextAction label="작성 내용 버리기" onPress={() => void discard()} /></View> : null}
    </ScrollView>
    {peer.active || uncertain ? <View onLayout={event => setActionHeight(event.nativeEvent.layout.height)} style={{ width: "100%", maxWidth: 760, alignSelf: "center", paddingTop: 6, paddingHorizontal: 12, paddingBottom: Math.max(insets.bottom, 8), flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 8, rowGap: 4 }}>
      {uncertain && compactActions ? <><PrimaryButton title={busy ? "같은 전송 확인 중" : "같은 전송 다시 확인"} disabled={busy} onPress={() => void send()} /><TextAction label="작성 내용 버리기" warning disabled={busy} onPress={() => void discard()} /></> : <>
      <TextAction label="파일 선택" icon="paperclip" disabled={busy || uncertain || !!file || !peer.active} onPress={() => void chooseFile()} />
      <Text style={{ color: body.length > 2000 ? theme.danger : theme.secondary, fontSize: 12, lineHeight: 17, fontVariant: ["tabular-nums"] }}>{body.length} / 2000</Text>
      <View style={{ flex: 1 }} /><PrimaryButton title={busy && !uncertain ? selecting ? "파일 선택 중" : progress === null ? "전송 중" : `전송 ${Math.floor(progress * 100)}%` : "보내기"} disabled={busy || uncertain || !peer.active || (!body.trim() && !file)} onPress={() => { if (!uncertain) void send(); }} />
      </>}
    </View> : <View style={{ height: Math.max(insets.bottom, 8) }} />}
  </View> : null}
  </View>
  {attachmentTarget?.attachment ? <ChatAttachmentActions key={attachmentTarget.attachment.id} attachment={attachmentTarget.attachment} peerId={peerId} messageId={attachmentTarget.id} peerName={peer?.name} createdAt={attachmentTarget.createdAt} isSender={attachmentTarget.senderId === user?.id} enabled={!masked} isCurrent={() => current(attachmentTarget.scopeGeneration)} onClose={() => {
    if (readyForAction()) {
      setAttachmentTarget(null);
      setFilePending(false);
    }
  }} onPending={updateFilePending} onChanged={() => {
    if (readyForAction()) {
      void load();
      void refreshSummary();
    }
  }}/> : null}
  {confirmation.dialog}
 </KeyboardScreen></SafeAreaView>;
}
