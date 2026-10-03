import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, Text, View } from "react-native";
import { AccountFeedback } from "@/components/account-feedback";
import { PdfPreview } from "@/components/pdf-preview";
import { EmptyState, TextAction } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { chatError, isChatId } from "@/lib/chat";
import { useChat } from "@/lib/chat-provider";
import { loadChatPreview, lookupChatPreviewAttachment } from "@/lib/chat-file-transfer";
import { useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";
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
  const { foreground: appForeground, isCurrentAccount: providerCurrent } = useChat();
  const theme = useTheme();
  const [file, setFile] = useState<ChatAttachment | null>(null);
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof loadChatPreview>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastForeground, setLastForeground] = useState(appForeground);
  if (lastForeground !== appForeground) {
    setLastForeground(appForeground);
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
  }, [releaseResource]);
  const invalidate = useCallback(() => { epoch.current++; }, []);
  useLayoutEffect(() => {
    foreground.current = appForeground;
    if (!appForeground) {
      invalidate();
      busy.current = false;
      releaseResource();
    }
  }, [appForeground, invalidate, releaseResource]);
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
    if (!focused.current || !foreground.current || busy.current || !token || !isCurrentAccount() || !providerCurrent())
      return;
    const generation = epoch.current;
    busy.current = true;
    setLoading(true);
    setError(null);
    release();
    const current = () => alive.current && focused.current && foreground.current && generation === epoch.current && isCurrentAccount() && providerCurrent();
    try {
      if (!isChatId(attachmentId) || !isChatId(peerId))
        throw new ApiError("파일 주소가 올바르지 않습니다.", 400);
      const attachment = lookupChatPreviewAttachment({ attachmentId, peerId, token });
      if (!attachment)
        throw new ApiError("대화에서 파일을 다시 선택해 미리보기를 여세요.", 404);
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
        setError(chatError(cause));
      }
    }
    finally {
      if (generation === epoch.current) {
        busy.current = false;
        if (current())
          setLoading(false);
      }
    }
  }, [attachmentId, expireSession, isCurrentAccount, peerId, providerCurrent, release, token]);
  useFocusEffect(useCallback(() => {
    focused.current = true;
    if (appForeground)
      void load();
    return () => {
      focused.current = false;
      epoch.current++;
      busy.current = false;
      release();
    };
  }, [appForeground, load, release]));
  if (lastForeground !== appForeground || !appForeground || !providerCurrent() || !isCurrentAccount())
    return <View style={{ flex: 1, backgroundColor: theme.background }}><ActivityIndicator color={theme.accent} style={{ padding: 24 }}/></View>;
  return <View style={{ flex: 1, backgroundColor: theme.background }}><View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>{file ? <Text style={{ color: theme.text, fontSize: 14, fontWeight: "700" }} numberOfLines={2}>{file.originalName}</Text> : null}<Text style={{ color: theme.secondary, fontSize: 12 }}>미리보기만으로 수신 완료하거나 원본을 삭제하지 않습니다.</Text><AccountFeedback error={error}/>{error ? <TextAction label="미리보기 다시 확인" icon="refresh" disabled={loading} onPress={() => void load()}/> : null}</View>{loading ? <ActivityIndicator color={theme.accent} style={{ padding: 24 }}/> : preview ? preview.kind === "pdf" ? <PdfPreview uri={preview.uri} token=""/> : <Image source={{ uri: preview.uri }} accessibilityLabel={file?.originalName ?? "채팅 파일 미리보기"} style={{ flex: 1 }} resizeMode="contain" onError={() => {
    if (!alive.current || !focused.current || !foreground.current || !isCurrentAccount() || !providerCurrent() || resource.current !== preview)
      return;
    release();
    setError("이미지를 표시하지 못했습니다. 다시 확인하세요.");
  }}/> : <View style={{ padding: 16 }}><EmptyState title="미리보기를 확인하지 못했습니다" detail="대화의 파일 작업에서 다시 여세요."/></View>}</View>;
}
