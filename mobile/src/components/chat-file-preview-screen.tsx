import { router, Stack, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Image, Platform, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChatFilePreviewAction as TextAction, ChatFilePreviewFeedback, ChatFilePreviewHeader, ChatFilePreviewInfo, ChatFilePreviewLoading, ChatFilePreviewWebPdf, type PreviewFailure } from "@/components/chat-file-preview-ui";
import { PdfPreview } from "@/components/pdf-preview";
import { ApiError } from "@/lib/api";
import { chatError, isChatId } from "@/lib/chat";
import { useChat } from "@/lib/chat-provider";
import { loadChatPreview, lookupChatPreviewAttachment } from "@/lib/chat-file-transfer";
import { useSession } from "@/lib/session";
import { useHomeTheme as useTheme } from "@/lib/home-theme";
import type { ChatAttachment } from "@/lib/types";
export function ChatFilePreviewScreen({ attachmentId, peerId }: {
  attachmentId: string;
  peerId: string;
}) {
  const { token } = useSession();
  const key = `${token}:${peerId}:${attachmentId}`;
  const scope = useRef(key);
  useLayoutEffect(() => {
    scope.current = key;
  }, [key]);
  const current = useCallback(() => !!token && scope.current === key, [token, key]);
  return token ? <ChatFilePreviewContent key={key} attachmentId={attachmentId} peerId={peerId} isCurrentAccount={current}/> : null;
}
function ChatFilePreviewContent({ attachmentId, peerId, isCurrentAccount }: {
  attachmentId: string;
  peerId: string;
  isCurrentAccount: () => boolean;
}) {
  const { token, expireSession } = useSession();
  const { foreground: appForeground, isCurrentAccount: providerCurrent, foregroundEpoch, isForegroundCurrent } = useChat();
  const theme = useTheme();
  const [file, setFile] = useState<ChatAttachment | null>(null);
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof loadChatPreview>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [failure, setFailure] = useState<PreviewFailure>("fetch");
  const [screenFocused, setScreenFocused] = useState(false);
  const [lastForegroundEpoch, setLastForegroundEpoch] = useState(foregroundEpoch);
  if (lastForegroundEpoch !== foregroundEpoch) {
    setLastForegroundEpoch(foregroundEpoch);
    setPreview(null);
    setFile(null);
    setError(null);
    setLoading(true);
  }
  const alive = useRef(false);
  const focused = useRef(false);
  const foreground = useRef(appForeground);
  const epoch = useRef(0);
  const busy = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const resource = useRef<Awaited<ReturnType<typeof loadChatPreview>> | null>(null);
  const releaseResource = useCallback(() => {
    controller.current?.abort();
    resource.current?.release();
    resource.current = null;
  }, []);
  const release = useCallback(() => {
    releaseResource();
    setPreview(null);
    setFile(null);
    setError(null);
  }, [releaseResource]);
  const invalidate = useCallback(() => { epoch.current++; }, []);
  useLayoutEffect(() => {
    foreground.current = appForeground;
    invalidate();
    busy.current = false;
    releaseResource();
  }, [appForeground, foregroundEpoch, invalidate, releaseResource]);
  useEffect(() => {
    alive.current = true;
    invalidate();
    return () => {
      alive.current = false;
      invalidate();
      controller.current?.abort();
      resource.current?.release();
    };
  }, [invalidate]);
  const load = useCallback(async () => {
    if (!focused.current || !foreground.current || busy.current || !token || !isCurrentAccount() || !providerCurrent() || !isForegroundCurrent(foregroundEpoch))
      return;
    const generation = epoch.current;
    busy.current = true;
    setLoading(true);
    setError(null);
    release();
    const current = () => alive.current && focused.current && foreground.current && generation === epoch.current && isCurrentAccount() && providerCurrent() && isForegroundCurrent(foregroundEpoch);
    let failureKind: PreviewFailure = "fetch";
    try {
      if (!isChatId(attachmentId) || !isChatId(peerId)) {
        failureKind = "selection";
        throw new ApiError("파일 주소가 올바르지 않습니다.", 400);
      }
      const attachment = lookupChatPreviewAttachment({ attachmentId, peerId, token });
      if (!attachment) {
        failureKind = "selection";
        throw new ApiError("대화에서 파일을 다시 선택해 미리보기를 여세요.", 404);
      }
      controller.current = new AbortController();
      const value = await loadChatPreview({ attachment, token, signal: controller.current.signal, isCurrent: current });
      if (!current()) {
        value.release();
        return;
      }
      resource.current = value;
      setPreview(value);
      setFile(attachment);
    }
    catch (cause) {
      if (current()) {
        if (cause instanceof ApiError && cause.status === 401) {
          await expireSession(token);
          return;
        }
        if (cause instanceof ApiError) {
          if (cause.status === 403) failureKind = "forbidden";
          else if (cause.status === 404) failureKind = "selection";
          else if (cause.status === 410) failureKind = "deleted";
          else if (cause.status === 415) failureKind = "unsupported";
        }
        setFailure(failureKind);
        setError(chatError(cause));
      }
    }
    finally {
      if (generation === epoch.current && isForegroundCurrent(foregroundEpoch)) {
        busy.current = false;
        if (current())
          setLoading(false);
      }
    }
  }, [attachmentId, expireSession, isCurrentAccount, peerId, providerCurrent, foregroundEpoch, isForegroundCurrent, release, token]);
  useFocusEffect(useCallback(() => {
    focused.current = true;
    setScreenFocused(true);
    if (appForeground)
      void load();
    return () => {
      focused.current = false;
      setScreenFocused(false);
      epoch.current++;
      busy.current = false;
      release();
    };
  }, [appForeground, load, release]));
  const visible = lastForegroundEpoch === foregroundEpoch && screenFocused && isForegroundCurrent(foregroundEpoch) && appForeground && providerCurrent() && isCurrentAccount();
  const ready = visible && !loading && !!preview && !!file;
  const backToPeer = isChatId(peerId);
  const onBack = () => {
    if (!visible || !focused.current || !foreground.current || !isForegroundCurrent(foregroundEpoch) || !isCurrentAccount() || !providerCurrent()) return;
    focused.current = false;
    setScreenFocused(false);
    invalidate();
    busy.current = false;
    release();
    if (router.canGoBack()) router.back();
    else if (backToPeer) router.replace({ pathname: "/chat/[peerId]", params: { peerId } });
    else router.replace("/chat");
  };
  return <SafeAreaView edges={["top", "left", "right"]} style={{ flex: 1, backgroundColor: theme.surface }}>
    <Stack.Screen options={{ headerShown: false }} />
    <ChatFilePreviewHeader backLabel={backToPeer ? "뒤로, 직원 대화" : "뒤로, 직원 채팅"} onBack={onBack} />
    {ready ? <ChatFilePreviewInfo file={file} mimeType={preview.mimeType} /> : null}
    <SafeAreaView edges={["bottom"]} style={{ flex: 1, minHeight: 0, backgroundColor: ready ? theme.surfaceMuted : theme.background }}>
      {!visible || loading ? <ChatFilePreviewLoading /> : error ? <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }}>
        <ChatFilePreviewFeedback error={error} failure={failure}>
          {failure === "fetch" || failure === "image" ? <TextAction label="미리보기 다시 확인" primary disabled={loading} onPress={() => void load()} /> : null}
          <TextAction label={backToPeer ? "대화로 돌아가기" : "직원 채팅으로 돌아가기"} onPress={onBack} />
        </ChatFilePreviewFeedback>
      </ScrollView> : ready ? preview.kind === "pdf" ? Platform.OS === "web" ? <ScrollView style={{ flex: 1 }}><ChatFilePreviewWebPdf /></ScrollView> : <PdfPreview key={preview.uri} uri={preview.uri} token="" /> : <View style={{ flex: 1, minHeight: 0, padding: 12 }}>
        <View style={{ flex: 1, minHeight: 0, width: "100%", maxWidth: 720, alignSelf: "center" }}>
          <Image source={{ uri: preview.uri }} accessibilityLabel={`${file.originalName} 이미지 미리보기`} style={{ flex: 1, width: "100%" }} resizeMode="contain" onError={() => {
    if (!alive.current || !focused.current || !foreground.current || !isCurrentAccount() || !providerCurrent() || !isForegroundCurrent(foregroundEpoch) || resource.current !== preview)
      return;
    release();
    setFailure("image");
    setError("이미지를 읽지 못했어요. 미리보기를 다시 확인해 주세요.");
  }} />
        </View>
      </View> : <ChatFilePreviewLoading />}
    </SafeAreaView>
  </SafeAreaView>;
}
