import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppShell } from "@/components/app-shell";
import { appDescription, appName } from "@/lib/branding";
import { getSessionUserId } from "@/lib/session";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: appName,
  description: appDescription,
};

const themeScript = `
(() => {
  const storageKey = "gyeoljaeon-theme";

  function getPreferredTheme() {
    try {
      const storedTheme = localStorage.getItem(storageKey);

      if (storedTheme === "dark" || storedTheme === "light") {
        return storedTheme;
      }

      return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    } catch {
      return "light";
    }
  }

  function applyTheme(theme, shouldStore) {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.dataset.theme = theme;

    if (shouldStore) {
      localStorage.setItem(storageKey, theme);
    }
  }

  try {
    applyTheme(getPreferredTheme(), false);
  } catch {
  }

  document.addEventListener("click", (event) => {
    const target = event.target;

    if (!(target instanceof Element)) {
      return;
    }

    const button = target.closest("[data-theme-toggle]");

    if (!button) {
      return;
    }

    const nextTheme = document.documentElement.classList.contains("dark")
      ? "light"
      : "dark";

    applyTheme(nextTheme, true);
  });
})();
`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const userId = await getSessionUserId();

  return (
    <html
      lang="ko"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full">
        {userId ? <AppShell userId={userId}>{children}</AppShell> : children}
      </body>
    </html>
  );
}
