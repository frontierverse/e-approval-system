import { useColorScheme } from "react-native";
import { useTheme } from "./theme";

const light = {
  background: "#F7F8FA",
  surface: "#FFFFFF",
  surfaceMuted: "#F0F2F5",
  text: "#191F28",
  secondary: "#5C6675",
  muted: "#647084",
  border: "#E8ECF1",
  controlBorder: "#86909E",
  accent: "#2563EB",
  actionFill: "#2563EB",
  accentSoft: "#EDF4FF",
  danger: "#A52C39",
  dangerFill: "#A52C39",
  dangerSoft: "#FBECEF",
  success: "#176345",
  successSoft: "#E8F5EE",
  tab: "#FFFFFF",
};

const dark = {
  background: "#11151B",
  surface: "#1C222B",
  surfaceMuted: "#262E39",
  text: "#F4F6FA",
  secondary: "#AFB8C7",
  muted: "#A4AEC0",
  border: "#303947",
  controlBorder: "#647084",
  accent: "#8DB7FF",
  actionFill: "#2563EB",
  accentSoft: "#202F49",
  danger: "#FF98A4",
  dangerFill: "#A52C39",
  dangerSoft: "#492831",
  success: "#8BE2B8",
  successSoft: "#1D3A2E",
  tab: "#1C222B",
};

export function useHomeTheme() {
  const base = useTheme();
  const darkMode = useColorScheme() === "dark";
  return { ...base, ...(darkMode ? dark : light) };
}
