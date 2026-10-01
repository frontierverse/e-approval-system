import { useColorScheme } from "react-native";

const light = {
  background: "#F5F7FA",
  surface: "#FFFFFF",
  surfaceMuted: "#EDF2F7",
  text: "#17243A",
  secondary: "#526174",
  muted: "#68788B",
  border: "#D7E0EA",
  accent: "#174B81",
  actionFill: "#174B81",
  accentSoft: "#E9F2FB",
  danger: "#A52C39",
  dangerFill: "#A52C39",
  dangerSoft: "#FBECEF",
  success: "#176345",
  tab: "#FFFFFF",
};

const dark = {
  background: "#101924",
  surface: "#1A2837",
  surfaceMuted: "#243548",
  text: "#F1F5F9",
  secondary: "#BDCAD8",
  muted: "#A4B4C5",
  border: "#34495E",
  accent: "#8FC5FF",
  actionFill: "#235589",
  accentSoft: "#213F5D",
  danger: "#FF98A4",
  dangerFill: "#A52C39",
  dangerSoft: "#492831",
  success: "#8BE2B8",
  tab: "#192737",
};

export function useTheme() {
  return useColorScheme() === "dark" ? dark : light;
}

export function formatDate(value: string | null) {
  if (!value) return "날짜 없음";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}
