import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, StyleSheet, Text, View } from "react-native";
import { AccountFeedback, focusAccountNotice } from "@/components/account-feedback";
import { PrimaryButton, TextAction } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { attachmentFileSize } from "@/lib/attachment-file";
import { loadAccountImage, pickAccountImage, uploadAccountImage, type SelectedAccountImage } from "@/lib/account-image";
import { useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";
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
  const theme = useTheme();
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
  useEffect(() => { alive.current = true; return () => { alive.current = false; selection.current?.release(); }; }, []);
  useEffect(() => { if (confirming) focusAccountNotice(confirmButton.current); }, [confirming]);
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
  return <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
    <Text accessibilityRole="header" aria-level={2} style={[styles.title, { color: theme.text }]}>{label}</Text>
    <Text style={[styles.detail, { color: theme.secondary }]}>{kind === "signature" ? "결재에 사용할 도장 또는 서명 이미지를 등록하세요." : "등록하지 않으면 이름 첫 글자가 표시됩니다."}</Text>
    {info.exists ? <RegisteredAccountImage key={token + ":" + kind + ":" + info.updatedAt} kind={kind} updatedAt={info.updatedAt} /> :
      <Text style={[styles.empty, { backgroundColor: theme.surfaceMuted, color: theme.secondary }]}>등록된 {kind === "signature" ? "도장/서명 이미지" : "프로필 이미지"}가 없습니다.</Text>}
    {selected ? <View style={[styles.selection, { borderColor: theme.border }]}>
      <Image source={{ uri: selected.uri }} accessibilityLabel={"선택한 " + label} style={styles.selectedPreview} resizeMode="contain" />
      <View style={{ flex: 1, minWidth: 0 }}><Text style={{ color: theme.text, fontSize: 13, lineHeight: 19 }}>{selected.name}</Text>
        <Text style={{ color: theme.secondary, fontSize: 12, marginTop: 2 }}>저장 전 · {attachmentFileSize(selected.size)}</Text></View>
      <TextAction accessibilityLabel={label + " 선택 취소"} label="취소" disabled={disabled || confirming} onPress={() => { selection.current?.release(); selection.current = null; setSelected(null); setError(null); setMessage(null); }} />
    </View> : null}
    <View style={styles.actions}>
      <TextAction label={pending === "pick" ? "선택 중..." : selected ? "다른 이미지 선택" : "이미지 선택"} accessibilityLabel={kind === "signature" ? "도장/서명 이미지 선택" : "프로필 이미지 선택"} icon="image-outline" disabled={disabled || confirming} onPress={() => void choose()} />
      {selected ? <View style={{ flex: 1 }}><PrimaryButton title={pending === "upload" ? "저장 중..." : "이미지 저장"} disabled={disabled || confirming} onPress={() => void upload()} /></View> : null}
      {info.exists && !selected && !confirming ? <TextAction ref={deleteButton} label="이미지 삭제" accessibilityLabel={label + " 삭제"} icon="trash-outline" disabled={disabled} onPress={() => { setError(null); setMessage(null); setConfirming(true); }} /> : null}
    </View>
    <Text style={[styles.policy, { color: theme.secondary }]}>JPG·PNG·WEBP · 원본 4MB 이하 · 자동 압축 후 2MB 이하{kind === "signature" ? "\n투명 배경 PNG를 권장합니다." : ""}</Text>
    {confirming ? <View style={[styles.confirm, { backgroundColor: theme.dangerSoft, borderColor: theme.border }]}>
      <Text style={{ color: theme.text, fontSize: 13, lineHeight: 20 }}>등록된 {label}를 삭제하시겠습니까?{kind === "signature" ? " 다음 결재에는 기본 도장이 사용됩니다." : " 이름 첫 글자가 기본 이미지로 표시됩니다."}</Text>
      <View style={styles.actions}>
        <TextAction label="취소" disabled={disabled} onPress={() => { setConfirming(false); setError(null); deleteButton.current?.focus(); }} />
        <View style={{ flex: 1 }}><PrimaryButton ref={confirmButton} title={pending === "delete" ? "삭제 중..." : "삭제 확인"} danger disabled={disabled} onPress={() => void remove()} /></View>
      </View>
    </View> : null}
    <AccountFeedback error={error} message={message} />
  </View>;
}

function RegisteredAccountImage({ kind, updatedAt }: { kind: "profile" | "signature"; updatedAt: string | null }) {
  const theme = useTheme();
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
  if (error) return <View style={{ marginTop: 8 }}><Text accessibilityRole="alert" style={{ color: theme.danger, fontSize: 13 }}>{error}</Text><TextAction label="미리보기 다시 시도" onPress={() => setAttempt(value => value + 1)} /></View>;
  // The white document surface shows transparent approval ink as it will appear on paper.
  return <View style={[styles.preview, { borderColor: theme.border }]}>
    {preview ? <Image source={{ uri: preview }} accessibilityLabel={kind === "signature" ? "등록된 결재 도장/서명 이미지" : "등록된 프로필 이미지"} resizeMode="contain" style={{ width: "100%", height: "100%" }} onError={() => setResult({ key: loadKey, error: "이미지를 표시하지 못했습니다. 다시 시도하세요." })} /> :
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}><ActivityIndicator color={theme.actionFill} /><Text style={{ color: "#526174", fontSize: 13 }}>이미지 확인 중...</Text></View>}
  </View>;
}
const styles = StyleSheet.create({
  panel: { borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 12 },
  title: { fontSize: 16, fontWeight: "800" },
  detail: { fontSize: 13, lineHeight: 19, marginTop: 4 },
  empty: { padding: 12, borderRadius: 8, marginTop: 8, fontSize: 13, lineHeight: 19 },
  preview: { height: 100, borderWidth: 1, borderRadius: 8, backgroundColor: "#FFFFFF", marginTop: 8, padding: 8, alignItems: "center", justifyContent: "center" },
  selectedPreview: { width: 48, height: 48, backgroundColor: "#FFFFFF", borderRadius: 4 },
  selection: { flexDirection: "row", gap: 8, alignItems: "center", borderWidth: 1, borderRadius: 8, padding: 8, marginTop: 8 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center", marginTop: 4 },
  policy: { fontSize: 12, lineHeight: 18, marginTop: 4 },
  confirm: { borderWidth: 1, borderRadius: 8, padding: 10, marginTop: 8 },
});
