import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, afterEach, beforeEach, describe, test } from "node:test";
import ts from "typescript";
import { NextRequest } from "next/server";
import { proxy } from "../src/proxy.ts";
// Actual route source; isolate only the maintenance port and trusted clock/secret.
const key="__resourceMaintenanceRoute";
const h={imports:0,calls:[]as Array<{context:unknown;options:{limit:number;budgetMs:number}}>,result:{checked:10,completed:3,expired:0},failure:false,clock:0,advance:0,remainingExpired:null as number|null};
(globalThis as unknown as Record<string,unknown>)[key]=h;
const dataUrl=(source:string)=>`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const boundary=dataUrl(`const h=globalThis.${key};h.imports++;export async function reconcileResourceLibraryMaintenance(context,options){h.calls.push({context,options});h.clock+=h.advance;if(h.failure)throw Error('PRIVATE_PROVIDER_KEY_URL');if(h.remainingExpired!==null){const expired=Math.min(options.limit,h.remainingExpired);h.remainingExpired-=expired;return {checked:0,completed:0,expired};}return h.result;}`);
const source=readFileSync(new URL("../src/app/api/internal/resource-maintenance/route.ts",import.meta.url),"utf8");
// The clock is lexical to the transpiled route. Never replace the ambient Date.now:
// npm test loads all files in one process, where a root hook would alter unrelated domains.
const routeSource = `const Date = { now: () => globalThis.${key}.clock };\n${source.replaceAll('"@/lib/resource-file-cleanup"', JSON.stringify(boundary))}`;
const route=await import(dataUrl(ts.transpileModule(routeSource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText));
const secret="synthetic-cron-secret-only",originalSecret=process.env.CRON_SECRET,originalNow=Date.now;
const request=(authorization?:string)=>new Request("https://fixture.invalid/api/internal/resource-maintenance?invalid=%xx",{method:"POST",body:"not-json",headers:{...(authorization?{authorization}:{}),"content-type":"multipart/form-data; malformed"}});
const throughProxy = async (authorization?: string) => {
  const req = new NextRequest("https://fixture.invalid/api/internal/resource-maintenance?invalid=%xx", {
    headers: authorization ? { authorization } : {},
  });
  assert.equal(req.headers.get("cookie"), null);
  const response = proxy(req);
  assert.equal(response.headers.get("location"), null);
  assert.equal(response.headers.get("x-middleware-next"), "1");
  return route.GET(req);
};
const privacy=(response:Response)=>{assert.equal(response.headers.get("cache-control"),"private, no-store");assert.equal(response.headers.get("vary"),"Authorization");assert.equal(response.headers.get("x-content-type-options"),"nosniff");assert.equal(response.headers.get("location"),null);};
describe("actual resource maintenance route with an isolated clock", () => {
beforeEach(()=>{Object.assign(h,{calls:[],result:{checked:10,completed:3,expired:0},failure:false,clock:0,advance:0,remainingExpired:null});process.env.CRON_SECRET=secret;});
afterEach(()=>{assert.equal(Date.now,originalNow,"route clock must not replace the process clock");});
after(()=>{if(originalSecret===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=originalSecret;delete(globalThis as unknown as Record<string,unknown>)[key];});
test("cron authentication rejects malformed inputs before maintenance import/body/query",async()=>{for(const configured of[undefined,"short",secret])for(const auth of[undefined,"Bearer invalid","bearer "+secret,"Bearer "+secret+"extra"]){if(configured===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=configured;const response=await route.GET(request(auth));assert.equal(response.status,401);privacy(response);assert.equal((await response.json()).code,"UNAUTHORIZED");}assert.equal(h.imports,0);assert.equal(h.calls.length,0);});
test("actual proxy reaches maintenance private401 with no cookie and imports no domain for missing or invalid cron authentication", async () => {
  for (const configured of [undefined, "short", secret]) {
    if (configured === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = configured;
    for (const auth of [undefined, "Bearer invalid", "bearer " + secret, "Bearer " + secret + "extra"]) {
      const response = await throughProxy(auth);
      assert.equal(response.status, 401);
      privacy(response);
      assert.equal((await response.json()).code, "UNAUTHORIZED");
    }
  }
  assert.equal(h.imports, 0);
  assert.equal(h.calls.length, 0);
});
test("actual proxy and cron route exact secret support four bounded batches without a web cookie",async()=>{const response=await throughProxy("Bearer "+secret);assert.equal(response.status,200);privacy(response);assert.deepEqual(await response.json(),{ok:true,checked:40,completed:12});assert.equal(h.calls.length,4);assert.ok(h.calls.every(call=>call.options.limit===10&&call.options.budgetMs===10000));assert.ok(h.calls.every(call=>Object.keys(call.context as object).length===0));assert.equal(route.maxDuration,60);assert.equal(route.dynamic,"force-dynamic");});
test("empty queue stops after first batch and external failure remains private safe500",async()=>{h.result={checked:0,completed:0,expired:0};assert.deepEqual(await(await route.GET(request("Bearer "+secret))).json(),{ok:true,checked:0,completed:0});assert.equal(h.calls.length,1);h.failure=true;const response=await route.GET(request("Bearer "+secret));assert.equal(response.status,500);privacy(response);assert.doesNotMatch(await response.text(),/PRIVATE|PROVIDER|storage|https/);});
test("overall45s cap refuses fifth/late work and clamps last batch remaining budget",async()=>{h.advance=20000;const response=await route.GET(request("Bearer "+secret));assert.equal(response.status,500);assert.equal(h.calls.length,3);assert.equal(h.calls[2].options.budgetMs,5000);privacy(response);});

test("expiration progress runs four batches even while every cleanup key is grant gated",async()=>{h.remainingExpired=40;const response=await route.GET(request("Bearer "+secret));assert.equal(response.status,200);privacy(response);assert.deepEqual(await response.json(),{ok:true,checked:0,completed:0});assert.equal(h.calls.length,4);assert.equal(h.remainingExpired,0);});
});
