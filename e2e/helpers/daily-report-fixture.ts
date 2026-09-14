import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { build } from "esbuild";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";

// Render the production board and tokens inside the application's shell dimensions.
// The only replaced boundaries are navigation and server actions; no real records are written.
export async function startDailyReportFixture() {
  const root = process.cwd();
  const [bundle, css] = await Promise.all([
    build({
      stdin: { resolveDir: root, loader: "tsx", contents: `
        import React, { useState } from "react";
        import { createRoot } from "react-dom/client";
        import { DailyReportBoard } from "./src/components/daily-report-board";
        import Loading from "./src/app/work-schedule/daily-reports/loading";
        import ErrorState from "./src/app/work-schedule/daily-reports/error";
        const initial = window.__dailyReportInitial;
        const params = new URLSearchParams(location.search);
        function Fixture() {
          const [data, setData] = useState({ ...initial, selectedDate: params.get("date") || initial.selectedDate });
          async function mutate(kind, form) {
            const response = await fetch("/fixture-action/" + kind, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(form)) });
            const result = await response.json();
            if (result.success && kind === "review") setData(previous => ({ ...previous, reports: previous.reports.map(report => report.id === form.get("id") ? { ...report, reviewedAt: "2026-09-14T08:00:00.000Z", reviewedByName: "시설장" } : report) }));
            return result;
          }
          return <><header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--surface)]"><div className="flex h-16 items-center justify-between px-4"><span className="font-semibold">결재온</span><span className="text-sm">{data.userName}</span></div><nav className="flex h-[52px] items-center gap-4 border-t border-[var(--border)] px-4 text-sm"><a href="/work-schedule/daily-reports" className="inline-flex min-h-11 items-center">일일 업무보고</a><a href="/work-schedule/work-log" className="inline-flex min-h-11 items-center">업무일지</a></nav></header>
            <div className="mx-auto flex w-full max-w-[1440px] gap-6 px-4 py-6 sm:px-6 lg:h-[calc(100vh-7.25rem)] lg:min-h-0 lg:overflow-hidden lg:px-8">
              <aside className="hidden w-64 shrink-0 border-r border-[var(--border)] pr-5 lg:block"><p className="text-sm font-semibold">업무 관리</p><a href="/work-schedule/daily-reports" className="mt-3 flex min-h-11 items-center rounded-md bg-[var(--brand-soft)] px-3 text-sm">일일 업무보고</a></aside>
              <main id="main-content" className="min-w-0 flex-1 lg:h-full lg:overflow-y-auto lg:pr-1">
                {params.has("loading") ? <Loading /> : params.has("error") ? <ErrorState reset={() => location.reload()} /> : <DailyReportBoard data={data} saveAction={(_, form) => mutate("save", form)} reviewAction={(_, form) => mutate("review", form)} />}
              </main>
            </div></>;
        }
        createRoot(document.getElementById("root")).render(<Fixture />);`,
      },
      bundle: true, write: false, format: "iife", platform: "browser", logLevel: "silent",
      define: { "process.env.NODE_ENV": '"production"' },
      plugins: [{ name: "daily-report-next-boundary", setup(plugin) {
        plugin.onResolve({ filter: /^next\/link$/ }, args => ({ path: args.path, namespace: "fixture" }));
        plugin.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ loader: "tsx", resolveDir: root, contents: 'import React from "react"; export default function Link(props) { return <a {...props} />; }' }));
      } }],
    }),
    readFile(path.join(root, "src/app/globals.css"), "utf8").then(css => postcss([tailwindcss({ base: root })]).process(css, { from: path.join(root, "src/app/globals.css") })),
  ]);
  const server = createServer((request, response) => {
    if (request.url === "/fixture.js") { response.writeHead(200, { "Content-Type": "text/javascript" }); response.end(bundle.outputFiles[0].contents); }
    else if (request.url === "/fixture.css") { response.writeHead(200, { "Content-Type": "text/css" }); response.end(css.css); }
    else if (request.url?.startsWith("/work-schedule/")) {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end('<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>일일 업무보고 검수</title><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>');
    } else { response.writeHead(404); response.end("Unknown fixture request"); }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Fixture did not start");
  return { url: `http://127.0.0.1:${address.port}`, close: () => new Promise<void>((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); }) };
}
