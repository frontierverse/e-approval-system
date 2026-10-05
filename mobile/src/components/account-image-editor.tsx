import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, StyleSheet, View } from "react-native";
import { AccountFeedback, focusAccountNotice } from "@/components/account-feedback";
import { AccountButton, AccountSection } from "@/components/account-ui";
import { DetailText as Text } from "@/components/document-detail-ui";
import { ApiError } from "@/lib/api";
import { attachmentFileSize } from "@/lib/attachment-file";
import { loadAccountImage, pickAccountImage, uploadAccountImage, type SelectedAccountImage } from "@/lib/account-image";
import { useSession } from "@/lib/session";
import { useHomeTheme } from "@/lib/home-theme";
import type { AccountImageInfo } from "@/lib/types";

type Props = {
  kind: "profile" | "signature";
  info: AccountImageInfo;
  disabled: boolean;
  acquire: () => boolean;
  release: () => void;
  onChange: (image: AccountImageInfo) => void;
};

export function AccountImageEditor({ kind, info, disabled, acquire, release, onChange }: Props) {
  const theme = useHomeTheme();
  const { token, request, expireSession } = useSession();
  const label = kind === "signature" ? "결재 도장/서명" : "프로필 이미지";
  const [selected, setSelected] = useState<SelectedAccountImage | null>(null);
  const selection = useRef<SelectedAccountImage | null>(null);
  const [pending, setPending] = useState<"pick" | "upload" | "delete" | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const alive = useRef(true);
  const confirmButton = useRef<View>(null);
  const deleteButton = useRef<View>(null);
  const chooseButton = useRef<View>(null);
  const wasConfirming = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; selection.current?.release(); }; }, []);
  useEffect(() => {
    if (confirming) focusAccountNotice(confirmButton.current);
    else if (wasConfirming.current) focusAccountNotice(deleteButton.current ?? chooseButton.current);
    wasConfirming.current = confirming;
  }, [confirming]);
  const choose = async () => {
    if (!token || !acquire()) return;
    setPending("pick"); setError(null); setMessage(null);
    try {
      const image = await pickAccountImage();
      if (!alive.current) { image?.release(); return; }
      if (image) { selection.current?.release(); selection.current = image; setSelected(image); }
    } catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : "이미지를 선택하지 못했습니다. 다시 시도하세요."); }
    finally { if (alive.current) setPending(null); release(); }
  };
  const upload = async () => {
    if (!token || !selected || !acquire()) return;
    setPending("upload"); setError(null); setMessage(null);
    try {
      const result = await uploadAccountImage({ kind, token, image: selected });
      if (!alive.current) return;
      onChange(result.image); setMessage(result.message);
      selection.current?.release(); selection.current = null; setSelected(null);
    } catch (cause) {
      if (!alive.current) return;
      if (cause instanceof ApiError && cause.status === 401) await expireSession(token);
      else setError(cause instanceof Error ? cause.message : "이미지를 저장하지 못했습니다. 다시 시도하세요.");
    } finally { if (alive.current) setPending(null); release(); }
  };
  const remove = async () => {
    if (!token || !acquire()) return;
    setPending("delete"); setError(null); setMessage(null);
    try {
      const result = await request<{ image: AccountImageInfo; message: string }>("/account/" + kind + "-image", { method: "DELETE" });
      if (!alive.current) return;
      onChange(result.image); setMessage(result.message); setConfirming(false);
    } catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : "이미지를 삭제하지 못했습니다. 다시 시도하세요."); }
    finally { if (alive.current) setPending(null); release(); }
  };
  return <AccountSection title={label} description={kind === "signature" ? "결재에 사용할 도장 또는 서명 이미지예요." : "등록하지 않으면 이름 첫 글자가 표시됩니다."}>
    {info.exists ? <RegisteredAccountImage key={token + ":" + kind + ":" + info.updatedAt} kind={kind} updatedAt={info.updatedAt} disabled={disabled} /> :
      <Text style={[styles.empty, { backgroundColor: theme.surfaceMuted, color: theme.secondary }]}>등록된 {kind === "signature" ? "도장/서명 이미지" : "프로필 이미지"}가 없습니다.</Text>}
    {selected ? <View style={[styles.selection, { borderColor: theme.accent, backgroundColor: theme.accentSoft }]}>
      <Image source={{ uri: selected.uri }} accessibilityLabel={"선택한 " + label} style={[styles.selectedPreview, { borderRadius: kind === "profile" ? 44 : 12 }]} resizeMode="contain" />
      <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 160, minWidth: 0, gap: 2, alignItems: "flex-start" }}>
        <Badge label="저장 전" outlined />
        <Text style={{ color: theme.text, fontSize: 14, lineHeight: 20 }}>{selected.name}</Text>
        <Text style={{ color: theme.secondary, fontSize: 12, lineHeight: 18 }}>{attachmentFileSize(selected.size)}</Text>
      </View>
    </View> : null}
    <AccountFeedback error={error} message={message} />
    {confirming ? <View style={[styles.confirm, { backgroundColor: theme.surface, borderColor: theme.danger }]}>
      <Text style={{ color: theme.text, fontSize: 14, lineHeight: 21 }}>등록된 {kind === "signature" ? "결재 도장/서명 이미지" : label}를 삭제하시겠습니까?{kind === "signature" ? " 다음 결재에는 기본 도장이 사용됩니다." : " 이름 첫 글자가 기본 이미지로 표시됩니다."}</Text>
      <View style={styles.actions}>
        <AccountButton ref={confirmButton} label="취소" disabled={disabled} onPress={() => { setConfirming(false); setError(null); }} style={styles.action} />
        <AccountButton label={pending === "delete" ? "삭제 중..." : "삭제 확인"} primary danger disabled={disabled} onPress={() => void remove()} style={styles.action} />
      </View>
    </View> : <View style={styles.actions}>
      <AccountButton ref={chooseButton} label={pending === "pick" ? "선택 중..." : selected ? "다른 이미지 선택" : "이미지 선택"} accessibilityLabel={kind === "signature" ? "도장/서명 이미지 선택" : "프로필 이미지 선택"} disabled={disabled} onPress={() => void choose()} style={styles.action} />
      {selected ? <>
        <AccountButton label="선택 취소" accessibilityLabel={label + " 선택 취소"} disabled={disabled} onPress={() => { selection.current?.release(); selection.current = null; setSelected(null); setError(null); setMessage(null); }} style={styles.action} />
        <AccountButton label={pending === "upload" ? "저장 중..." : "이미지 저장"} primary disabled={disabled} onPress={() => void upload()} style={styles.action} />
      </> : info.exists ? <AccountButton ref={deleteButton} label="이미지 삭제" accessibilityLabel={label + " 삭제"} danger disabled={disabled} onPress={() => { setError(null); setMessage(null); setConfirming(true); }} style={styles.action} /> : null}
    </View>}
    <Text style={[styles.policy, { color: theme.secondary }]}>JPG·PNG·WEBP · 원본 4MB 이하 · 자동 압축 후 2MB 이하{kind === "signature" ? " · 투명 배경 PNG 권장" : ""}</Text>
  </AccountSection>;
}
function Badge({ label, outlined }: { label: string; outlined?: boolean }) {
  const theme = useHomeTheme();
  return <View style={{ paddingVertical: 1, paddingHorizontal: 8, borderRadius: 99, borderWidth: outlined ? 1 : 0, borderColor: theme.accent, backgroundColor: outlined ? theme.surface : theme.accentSoft }}>
    <Text style={{ color: theme.accent, fontSize: 12, lineHeight: 18, fontWeight: "700" }}>{label}</Text>
  </View>;
}
function RegisteredAccountImage({ kind, updatedAt, disabled }: { disabled: boolean; kind: "profile" | "signature"; updatedAt: string | null }) {
  const theme = useHomeTheme();
  const { token, expireSession } = useSession();
  const [result, setResult] = useState<{ key: string; uri?: string; error?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const loadKey = JSON.stringify([token, kind, updatedAt, attempt]);
  const preview = result?.key === loadKey ? result.uri : null;
  const error = result?.key === loadKey ? result.error : null;
  useEffect(() => {
    if (!token) return;
    let active = true;
    let resource: Awaited<ReturnType<typeof loadAccountImage>> | undefined;
    const controller = new AbortController();
    void loadAccountImage({ kind, token, updatedAt: updatedAt ?? undefined, signal: controller.signal }).then(result => {
      if (!active) { result.release(); return; }
      resource = result; setResult({ key: loadKey, uri: result.uri });
    }).catch(cause => {
      if (!active) return;
      if (cause instanceof ApiError && cause.status === 401) void expireSession(token);
      else setResult({ key: loadKey, error: cause instanceof Error ? cause.message : "이미지를 불러오지 못했습니다." });
    });
    return () => { active = false; controller.abort(); resource?.release(); };
  }, [token, kind, updatedAt, loadKey, expireSession]);
  return <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
    <View style={[styles.preview, { borderColor: "#D6DCE5", borderRadius: kind === "profile" ? 44 : 12 }]}>
      {preview && !error ? <Image source={{ uri: preview }} accessibilityLabel={kind === "signature" ? "등록된 결재 도장/서명 이미지" : "등록된 프로필 이미지"} resizeMode="contain" style={{ width: "100%", height: "100%" }} onError={() => setResult({ key: loadKey, error: "이미지를 표시하지 못했습니다. 다시 시도하세요." })} /> : error ? <Text style={{ color: "#5C6675", fontSize: 12, textAlign: "center" }}>미리보기 오류</Text> : <ActivityIndicator color={theme.actionFill} />}
    </View>
    <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 160, minWidth: 0, gap: 4, alignItems: "flex-start" }}>
      <Badge label="현재 등록됨" />
      <Text accessibilityRole={error ? "alert" : undefined} accessibilityLiveRegion="polite" style={{ color: error ? theme.danger : theme.secondary, fontSize: 13, lineHeight: 19 }}>{error || (preview ? kind === "signature" ? "결재에 사용 중" : "프로필에 표시 중" : "이미지 확인 중...")}</Text>
      {error ? <AccountButton label="미리보기 다시 시도" disabled={disabled} onPress={() => setAttempt(value => value + 1)} /> : null}
    </View>
  </View>;
}
const styles = StyleSheet.create({
  empty: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, fontSize: 14, lineHeight: 21 },
  // Transparent approval ink is always shown on white paper, including dark mode.
  preview: { width: 88, height: 88, borderWidth: 1, backgroundColor: "#FFFFFF", padding: 4, alignItems: "center", justifyContent: "center" },
  selectedPreview: { width: 88, height: 88, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#D6DCE5" },
  selection: { flexDirection: "row", flexWrap: "wrap", gap: 12, alignItems: "center", borderWidth: 1, borderStyle: "dashed", borderRadius: 12, padding: 10 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  action: { flexGrow: 1, flexShrink: 1, flexBasis: 120 },
  policy: { fontSize: 12, lineHeight: 18 },
  confirm: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
});
