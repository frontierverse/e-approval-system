import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { build } from "esbuild";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";

// Render the real draft form without database access or submission actions.
export async function startDraftAttachmentFixture() {
  const root = process.cwd();
  const [bundle, stylesheet] = await Promise.all([
    build({
      stdin: {
        contents: `import React from "react";
          import { createRoot } from "react-dom/client";
          import { DraftForm } from "./src/components/draft-form";
          createRoot(document.getElementById("root")).render(<main className="mx-auto max-w-5xl p-4">
            <h1 className="mb-3 text-lg font-semibold">일반 기안</h1>
            <DraftForm
              templates={[{ id: "template-general", name: "일반 기안", description: null, schema: null }]}
              approverCandidates={[{ id: "approver", name: "검증 결재자", email: null, departmentName: "운영팀", positionName: "팀장", positionLevel: 2 }]}
              attachmentPolicy={{ maxFileCount: 3, maxFileSizeMb: 10, allowedExtensions: [".pdf"] }}
              initialValues={{ title: "첨부 검증", category: "", templateId: "template-general", content: "검증용 기안입니다.", approverIds: ["approver"], templateFieldValues: {} }}
            />
          </main>);`,
        resolveDir: root,
        loader: "tsx",
      },
      bundle: true,
      write: false,
      format: "iife",
      platform: "browser",
      define: { "process.env.NODE_ENV": '"production"' },
      logLevel: "silent",
      plugins: [{
        name: "isolated-draft-boundaries",
        setup(plugin) {
          plugin.onResolve({ filter: /^(next\/(link|image)|@\/app\/(drafts\/new|attachments)\/actions)$/ }, (args) => ({ path: args.path, namespace: "draft-fixture" }));
          plugin.onLoad({ filter: /.*/, namespace: "draft-fixture" }, (args) => ({
            loader: "tsx", resolveDir: root,
            contents: args.path === "next/link"
              ? `import React from "react"; export default function Link({ children, ...props }) { return <a {...props}>{children}</a>; }`
              : args.path === "next/image" ? `import React from "react"; export default function Image({ fill, unoptimized, priority, ...props }) { return <img {...props} />; }`
              : `export async function createDraftAction() { throw new Error("Fixture must not submit real documents"); }
                 export async function createSignedUploadUrlAction() { throw new Error("Fixture must not upload files"); }`,
          }));
        },
      }],
    }),
    readFile(path.join(root, "src/app/globals.css"), "utf8").then((css) =>
      postcss([tailwindcss({ base: root })]).process(css, { from: path.join(root, "src/app/globals.css") }),
    ),
  ]);

  const server = createServer((request, response) => {
    if (request.url === "/fixture.js") {
      response.writeHead(200, { "Content-Type": "text/javascript" });
      response.end(bundle.outputFiles[0].contents);
    } else if (request.url === "/fixture.css") {
      response.writeHead(200, { "Content-Type": "text/css" });
      response.end(stylesheet.css);
    } else if (request.url === "/" || request.url?.startsWith("/?")) {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>기안 첨부 검증</title><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>`);
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
