import Pdf from "react-native-pdf";
import { View } from "react-native";
import { useState } from "react";
import { ErrorState } from "@/components/ui";
import { useTheme } from "@/lib/theme";

export function PdfPreview({ uri, token }: { uri: string; token: string }) {
  const theme = useTheme();
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  return <View style={{ flex: 1, backgroundColor: theme.background }}>
    {error ? <View style={{ padding: 16 }}><ErrorState message={error} retry={() => { setError(null); setAttempt(value => value + 1); }} /></View> :
      <Pdf key={attempt} source={{ uri, headers: { Authorization: "Bearer " + token }, cache: false }}
        trustAllCerts={false} style={{ flex: 1, backgroundColor: theme.background }}
        onError={() => setError("PDF를 열지 못했습니다. 네트워크를 확인하고 다시 시도하세요.")} />}
  </View>;
}
