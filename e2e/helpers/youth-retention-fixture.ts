import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { build } from "esbuild";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";

// Render the actual board and loading state with isolated, injectable actions.
export async function startYouthRetentionFixture() {
  const root = process.cwd();
  const [bundle, stylesheet] = await Promise.all([
    build({
      stdin: {
        contents: `import React from "react"; import {createRoot} from "react-dom/client";
          import {YouthRetentionBoard} from "./src/components/youth-retention-board";
          import Loading from "./src/app/youth/retention/loading";
          const params = new URLSearchParams(location.search);
          if(params.has("dark")) document.documentElement.classList.add("dark");
          if(params.has("zoom")) document.documentElement.style.zoom = "2";
          const base={admissionDate:"2020-01-01",dischargeDate:"2020-06-01",actualDischargeDate:"2020-06-01",caseClosedDate:"2020-07-01",retentionUntil:"2025-07-01",retentionBasis:"기준",retentionHoldReason:null,retentionVersion:0,purgeStartedAt:null,purgedAt:null,decisionDocumentCount:2};
          let records=params.has("empty")?[]:[
            {...base,id:"due",name:"검토청소년"},
            {...base,id:"pending",name:"확인청소년",actualDischargeDate:null,caseClosedDate:null,retentionUntil:null},
            {...base,id:"held",name:"보류청소년",retentionHoldReason:"기관 요청"},
            {...base,id:"care",name:"상담청소년",caseClosedDate:null,retentionUntil:null},
            {...base,id:"retained",name:"보존청소년",retentionUntil:"2029-07-01"},
            {...base,id:"long",name:"매우긴한글이름을가진청소년기록의가로넘침검증",retentionUntil:"2029-07-01"},
            {...base,id:"active",name:"입소청소년",actualDischargeDate:null,caseClosedDate:null,retentionUntil:null,dischargeDate:null},
          ];
          window.fixtureCalls={save:0,purge:0,read:0};
          const wait=()=>new Promise(r=>setTimeout(r,300));
          const save=async(id,input)=>{window.fixtureCalls.save++;await wait();if(params.has("error"))return{ok:false,error:"저장 실패: 입력을 유지하고 다시 확인하세요."};records=records.map(r=>r.id===id?{...r,...input,retentionVersion:r.retentionVersion+1,retentionHoldReason:input.holdReason||null,retentionUntil:input.caseClosedDate?"2031-10-01":null}:r);return{ok:true,data:records};};
          const purge=async(id,input)=>{window.fixtureCalls.purge++;await wait();records=records.map(r=>r.id===id?{...r,name:"파기된 기록",purgedAt:new Date().toISOString(),actualDischargeDate:null,caseClosedDate:null,retentionUntil:null}:r);return{ok:true,data:records};};
          const read=async(id,reason)=>{window.fixtureCalls.read++;await wait();return{ok:true,data:{birthDate:"2005-02-03",phone:"010-0000-0000",familyContacts:[{id:"family",relationship:"부",phone:"010-1111-1111"}],decisionDocuments:[{id:"doc",originalName:"확인결정문.pdf"}],notes:[{id:"note",title:"관리 기록",detail:"관리자에게만 열람되는 기록"}],retainedReports:[{workDate:"2020-06-01",authorName:"담당 직원",content:"보존된 업무보고"}]}};};
          createRoot(document.getElementById("root")).render(<main className="mx-auto max-w-7xl p-4">{params.has("loading")?<Loading/>:<YouthRetentionBoard data={records} today="2026-10-01" save={save} purge={purge} read={read}/>}</main>);`,
        resolveDir: root, loader: "tsx",
      },
      bundle: true, write: false, format: "iife", platform: "browser", logLevel: "silent",
      define: { "process.env.NODE_ENV": '"production"' },
      plugins: [{ name: "retention-fixture-boundaries", setup(plugin) {
        plugin.onResolve({ filter: /^next\/link$/ }, args => ({ path: args.path, namespace: "retention-fixture" }));
        plugin.onLoad({ filter: /.*/, namespace: "retention-fixture" }, () => ({ loader: "tsx", resolveDir: root, contents: `import React from "react"; export default function Link({children,...props}) {return <a {...props}>{children}</a>;}` }));
      } }],
    }),
    readFile(path.join(root, "src/app/globals.css"), "utf8").then(css => postcss([tailwindcss({ base: root })]).process(css, { from: path.join(root, "src/app/globals.css") })),
  ]);
  const server = createServer((request, response) => {
    if (request.url === "/fixture.js") { response.writeHead(200, { "Content-Type": "text/javascript" }); response.end(bundle.outputFiles[0].contents); }
    else if (request.url === "/fixture.css") { response.writeHead(200, { "Content-Type": "text/css" }); response.end(stylesheet.css); }
    else { response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); response.end(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>`); }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Fixture failed to start");
  return { url: `http://127.0.0.1:${address.port}`, close: () => new Promise<void>((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); }) };
}
