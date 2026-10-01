import Pdf from "react-native-pdf";
import { Text, View } from "react-native";
import { useState } from "react";
import { useTheme } from "@/lib/theme";

export function PdfPreview({ uri, token }: { uri: string; token: string }) {
  const theme = useTheme();
  const [error, setError] = useState<string | null>(null);
  return <View style={{ flex: 1, backgroundColor: theme.background }}>
    {error ? <Text style={{ color: theme.danger, margin: 20 }}>{error}</Text> :
      <Pdf source={{ uri, headers: { Authorization: "Bearer " + token }, cache: false }}
        trustAllCerts={false} style={{ flex: 1, backgroundColor: theme.background }}
        onError={() => setError("PDF를 열지 못했습니다. 네트워크를 확인하고 다시 시도하세요.")} />}
  </View>;
}
