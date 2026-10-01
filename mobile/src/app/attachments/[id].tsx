import { useLocalSearchParams, useNavigation } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Image, Text, View } from "react-native";
import { PdfPreview } from "@/components/pdf-preview";
import { apiUrl } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useTheme } from "@/lib/theme";

export default function Attachment() {
  const { id, name, kind } = useLocalSearchParams<{ id: string; name?: string; kind?: string }>();
  const navigation = useNavigation();
  const theme = useTheme();
  const { token } = useSession();
  const [error, setError] = useState(false);
  useEffect(() => { navigation.setOptions({ title: name || "첨부파일" }); }, [name, navigation]);
  if (!token) return null;
  let uri: string;
  try { uri = apiUrl("/attachments/" + id + "/preview"); }
  catch { return <View style={{ flex: 1, justifyContent: "center", padding: 20 }}><Text style={{ color: theme.danger }}>서버 주소가 설정되지 않았습니다.</Text></View>; }
  if (kind === "pdf") return <PdfPreview uri={uri} token={token} />;
  if (kind === "image") return <View style={{ flex: 1, backgroundColor: theme.background }}>
    {error ? <Text style={{ color: theme.danger, margin: 20 }}>이미지를 열지 못했습니다.</Text> :
      <Image alt={name || "첨부 이미지"} source={{ uri, headers: { Authorization: "Bearer " + token } }} resizeMode="contain"
        onError={() => setError(true)} style={{ flex: 1, width: "100%" }} />}
  </View>;
  return <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={theme.accent} /></View>;
}
