import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { build } from "esbuild";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";

// This fixture bundles the real component, but never starts Next or loads its
// environment/database. Every API request must be intercepted by the test.
export async function startStaffChatFixture() {
  const root = process.cwd();
  const pdfRoot = path.join(root, "node_modules/pdfjs-dist");
  const pdfVersion = (JSON.parse(await readFile(path.join(pdfRoot, "package.json"), "utf8")) as { version: string }).version;
  const [bundle, stylesheet] = await Promise.all([
    build({
      stdin: {
        contents: `import React from "react";
          import { createRoot } from "react-dom/client";
          import { StaffChatDock } from "./src/components/staff-chat-dock";
          createRoot(document.getElementById("root")).render(
            React.createElement(StaffChatDock, { userId: "test-me" })
          );`,
        resolveDir: root,
        loader: "tsx",
      },
      bundle: true,
      write: false,
      format: "iife",
      platform: "browser",
      define: { "process.env.NODE_ENV": '"production"', "import.meta.url": "location.href" },
      logLevel: "silent",
    }),
    Promise.all([
      readFile(path.join(root, "src/app/globals.css"), "utf8"),
      readFile(path.join(root, "src/components/staff-chat.css"), "utf8"),
    ]).then((css) =>
      postcss([tailwindcss({ base: root })]).process(css.join("\n"), {
        from: path.join(root, "src/app/globals.css"),
      }),
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
      // Serve only the public PDF runtime assets, never arbitrary local paths.
      if (!/^(?:pdf\.worker\.min\.mjs|(?:cmaps|standard_fonts|wasm)\/[a-zA-Z0-9_.-]+)$/.test(asset)) {
        response.writeHead(404); response.end("PDF fixture asset not found"); return;
      }
      try {
        const assetPath = asset === "pdf.worker.min.mjs" ? path.join(pdfRoot, "build", asset) : path.join(pdfRoot, asset);
        const bytes = await readFile(assetPath);
        response.writeHead(200, { "Content-Type": asset.endsWith(".mjs") ? "text/javascript" : asset.endsWith(".wasm") ? "application/wasm" : "application/octet-stream" });
        response.end(bytes);
      } catch {
        response.writeHead(404); response.end("PDF fixture asset not found");
      }
    } else if (request.url === "/" || request.url?.startsWith("/?")) {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html><html lang="ko"><head>
        <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
        <title>직원 채팅 검증</title><link rel="stylesheet" href="/fixture.css"></head>
        <body><main style="padding:24px"><h1 style="font-size:22px;font-weight:600">오늘의 업무</h1>
        <p style="margin-top:8px;color:var(--text-muted)">채팅 기능 검증용 화면 · 가상 직원 데이터</p></main>
        <div id="root"></div><script src="/fixture.js"></script></body></html>`);
    } else {
      // Never forward an unexpected request to the application or a real API.
      response.writeHead(404);
      response.end("Fixture resource not found");
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
