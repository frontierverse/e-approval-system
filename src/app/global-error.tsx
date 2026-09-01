"use client";

import { useEffect } from "react";
import { getSafeErrorDigest } from "@/lib/observability";

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const digest = getSafeErrorDigest(error);

  useEffect(() => {
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "error",
        event: "client.root_error",
        digest,
      }),
    );
  }, [digest]);

  useEffect(() => {
    try {
      const storedTheme = localStorage.getItem("gyeoljaeon-theme");
      const theme =
        storedTheme === "dark" || storedTheme === "light"
          ? storedTheme
          : window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light";

      document.documentElement.dataset.theme = theme;
      document.documentElement.style.colorScheme = theme;
    } catch {
      // The CSS media query below remains the privacy-safe fallback.
    }
  }, []);

  return (
    <html lang="ko">
      <head>
        <title>업무 시스템 오류</title>
        <style>{`
          :root {
            color-scheme: light;
            --error-background: #f5f7fa;
            --error-foreground: #16181d;
            --error-surface: #ffffff;
            --error-muted: #5b6472;
            --error-border: #f0c6c6;
            --error-danger: #8a1f1f;
            --error-brand: #196b69;
            --error-button-text: #ffffff;
            --error-focus: #0f766e;
            --error-shadow: rgba(15, 23, 42, 0.08);
          }

          @media (prefers-color-scheme: dark) {
            :root {
              color-scheme: dark;
              --error-background: #0d1117;
              --error-foreground: #c9d1d9;
              --error-surface: #161b22;
              --error-muted: #8b949e;
              --error-border: #484f58;
              --error-danger: #f85149;
              --error-brand: #1f6feb;
              --error-button-text: #ffffff;
              --error-focus: #79c0ff;
              --error-shadow: rgba(0, 0, 0, 0.35);
            }
          }

          :root[data-theme="light"] {
            color-scheme: light;
            --error-background: #f5f7fa;
            --error-foreground: #16181d;
            --error-surface: #ffffff;
            --error-muted: #5b6472;
            --error-border: #f0c6c6;
            --error-danger: #8a1f1f;
            --error-brand: #196b69;
            --error-focus: #0f766e;
            --error-shadow: rgba(15, 23, 42, 0.08);
          }

          :root[data-theme="dark"] {
            color-scheme: dark;
            --error-background: #0d1117;
            --error-foreground: #c9d1d9;
            --error-surface: #161b22;
            --error-muted: #8b949e;
            --error-border: #484f58;
            --error-danger: #f85149;
            --error-brand: #1f6feb;
            --error-focus: #79c0ff;
            --error-shadow: rgba(0, 0, 0, 0.35);
          }

          .global-error-retry:focus-visible {
            outline: 3px solid var(--error-focus);
            outline-offset: 2px;
          }
        `}</style>
      </head>
      <body
        style={{
          margin: 0,
          background: "var(--error-background)",
          color: "var(--error-foreground)",
          fontFamily:
            'Pretendard, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }}
      >
        <main
          aria-live="assertive"
          style={{
            display: "grid",
            minHeight: "100vh",
            placeItems: "center",
            padding: 24,
          }}
        >
          <section
            style={{
              width: "min(100%, 560px)",
              border: "1px solid var(--error-border)",
              borderRadius: 12,
              background: "var(--error-surface)",
              boxSizing: "border-box",
              padding: 24,
              boxShadow: "0 1px 3px var(--error-shadow)",
            }}
          >
            <h1
              style={{
                margin: 0,
                color: "var(--error-danger)",
                fontSize: 22,
              }}
            >
              시스템 화면을 불러오지 못했습니다
            </h1>
            <p
              style={{
                margin: "12px 0 0",
                color: "var(--error-muted)",
                lineHeight: 1.6,
              }}
            >
              잠시 후 다시 시도해 주세요. 문제가 반복되면 발생 시각과 오류 참조를 관리자에게 알려 주세요.
            </p>
            {digest ? (
              <p
                style={{
                  margin: "8px 0 0",
                  color: "var(--error-muted)",
                  fontSize: 13,
                }}
              >
                오류 참조: <code>{digest}</code>
              </p>
            ) : null}
            <button
              type="button"
              onClick={retry}
              className="global-error-retry"
              style={{
                minHeight: 44,
                marginTop: 20,
                border: 0,
                borderRadius: 6,
                background: "var(--error-brand)",
                color: "var(--error-button-text)",
                cursor: "pointer",
                fontSize: 14,
                fontWeight: 700,
                padding: "0 16px",
              }}
            >
              다시 시도
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
