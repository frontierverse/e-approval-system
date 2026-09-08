import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { build } from "esbuild";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";

// Render production UI without importing server actions, Next's environment,
// Prisma, or an actual employee session. Tests intercept every data request.
export async function startWorkLogTaskFixture() {
  const root = process.cwd();
  const pdfRoot = path.join(root, "node_modules/pdfjs-dist");
  const pdfVersion = (JSON.parse(await readFile(path.join(pdfRoot, "package.json"), "utf8")) as { version: string }).version;
  const [bundle, stylesheet] = await Promise.all([
    build({
      stdin: {
        contents: `import React, { useState } from "react";
          import { createRoot } from "react-dom/client";
          import Link from "next/link";
          import { PageTitle } from "./src/components/page-title";
          import { StaffTaskChecklist } from "./src/components/staff-task-checklist";
          import { WorkLogBoard } from "./src/components/work-log-board";
          function Fixture() {
            const initial = window.__workLogTaskInitial;
            const [data, setData] = useState(initial);
            const [location, setLocation] = useState(window.location.pathname + window.location.search);
            const url = new URL(location, window.location.origin);
            const selectedDate = url.searchParams.get("date") || data.today;
            window.__workLogTaskNavigate = (next) => {
              window.history.replaceState({}, "", next);
              setLocation(next);
            };
            window.__workLogTaskMutation = async (kind, body) => {
              const response = await fetch("/fixture-actions/" + kind, {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
              });
              const payload = await response.json();
              if (payload.state) setData(current => ({ ...current, ...payload.state }));
              return payload.result;
            };
            const entries = data.entries;
            return <main className="mx-auto max-w-[1440px] p-4 sm:p-6">
              {url.pathname === "/tasks" ? <>
                <PageTitle compact title="내 할 일" description="완료한 할 일은 업무일지에 자동 반영됩니다." />
                <section aria-label="내 할 일 목록" className="rounded-md border border-[var(--border)] bg-[var(--surface)]">
                  <StaffTaskChecklist tasks={data.tasks} today={data.today} />
                </section>
                <Link href="/work-schedule/work-log" className="inline-flex min-h-11 items-center text-sm underline">업무일지</Link>
              </> : <>
                <PageTitle compact title="업무일지" description="날짜별 업무를 기록하고 최근 1년의 작성 흐름을 확인합니다." />
                <WorkLogBoard key={selectedDate}
                  contributionDates={data.contributionDates || entries.map(entry => entry.workDate)}
                  recentLogs={entries.slice(0, 14)}
                  selectedDate={selectedDate}
                  selectedLog={entries.find(entry => entry.workDate === selectedDate) || null}
                  linkedScheduleState={{ status: "ready", schedules: [] }}
                  today={data.today}
                  saveAction={(_previous, form) => window.__workLogTaskMutation("save", Object.fromEntries(form))}
                  deleteAction={(_previous, form) => window.__workLogTaskMutation("delete", Object.fromEntries(form))}
                />
              </>}
            </main>;
          }
          createRoot(document.getElementById("root")).render(<Fixture />);`,
        resolveDir: root,
        loader: "tsx",
      },
      bundle: true,
      write: false,
      format: "iife",
      platform: "browser",
      define: { "process.env.NODE_ENV": '"production"', "import.meta.url": "location.href" },
      logLevel: "silent",
      plugins: [{
        name: "isolated-work-log-next-boundaries",
        setup(plugin) {
          plugin.onResolve({ filter: /^(next\/link|next\/navigation|@\/app\/tasks\/actions)$/ }, (args) => ({ path: args.path, namespace: "work-log-fixture" }));
          plugin.onLoad({ filter: /.*/, namespace: "work-log-fixture" }, (args) => ({
            loader: "tsx",
            resolveDir: root,
            contents: args.path === "next/link" ? `import React from "react";
              export default function Link({ href, children, onNavigate, onClick, scroll, prefetch, replace, ...props }) {
                return <a {...props} href={href} onClick={event => {
                  onClick?.(event);
                  if (event.defaultPrevented) return;
                  let cancelled = false;
                  onNavigate?.({ preventDefault() { cancelled = true; } });
                  event.preventDefault();
                  if (!cancelled) window.__workLogTaskNavigate(href);
                }}>{children}</a>;
              }` : args.path === "next/navigation" ? `
              const router = { replace: (url) => window.__workLogTaskNavigate(url), push: (url) => window.__workLogTaskNavigate(url), refresh() {} };
              export const useRouter = () => router;
              ` : `
              export const setStaffTaskCompletedAction = (value) => window.__workLogTaskMutation("task-complete", value);
              export const deleteMyStaffTaskAction = (value) => window.__workLogTaskMutation("task-delete", value);
              `,
          }));
        },
      }],
    }),
    readFile(path.join(root, "src/app/globals.css"), "utf8").then((css) =>
      postcss([tailwindcss({ base: root })]).process(css, { from: path.join(root, "src/app/globals.css") }),
    ),
  ]);
  const server = createServer(async (request, response) => {
    if (request.url === "/fixture.js") {
      response.writeHead(200, { "Content-Type": "text/javascript" });
      response.end(bundle.outputFiles[0].contents);
    } else if (request.url === "/fixture.css") {
      response.writeHead(200, { "Content-Type": "text/css" });
      response.end(stylesheet.css);
    } else if (request.url?.startsWith(`/pdfjs/${pdfVersion}/`)) {
      const asset = request.url.slice(`/pdfjs/${pdfVersion}/`.length);
      // Public PDF runtime assets only; requests never map to employee files.
      if (!/^(?:pdf\.worker\.min\.mjs|(?:cmaps|standard_fonts|wasm)\/[a-zA-Z0-9_.-]+)$/.test(asset)) {
        response.writeHead(404); response.end("PDF fixture asset not found"); return;
      }
      try {
        const bytes = await readFile(asset === "pdf.worker.min.mjs" ? path.join(pdfRoot, "build", asset) : path.join(pdfRoot, asset));
        response.writeHead(200, { "Content-Type": asset.endsWith(".mjs") ? "text/javascript" : asset.endsWith(".wasm") ? "application/wasm" : "application/octet-stream" });
        response.end(bytes);
      } catch {
        response.writeHead(404); response.end("PDF fixture asset not found");
      }
    } else if (request.url === "/" || request.url === "/tasks" || request.url?.startsWith("/work-schedule/work-log")) {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html><html lang="ko"><head><meta charset="utf-8">
        <meta name="viewport" content="width=device-width,initial-scale=1"><title>업무일지 자동 연동 검증</title>
        <link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div>
        <script src="/fixture.js"></script></body></html>`);
    } else {
      response.writeHead(404);
      response.end("Isolated fixture resource not found");
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Fixture did not start");
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
      server.closeAllConnections();
    }),
  };
}
