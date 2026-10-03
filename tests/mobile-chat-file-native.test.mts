import assert from "node:assert/strict";
import { test } from "node:test";
import { attachment, message, response, tick } from "./helpers/mobile-chat-file.mjs";
import { nativeChatFileHarness } from "./helpers/mobile-chat-file-native.mjs";

test("native ZIP hashes/copies only 4MiB scratch in 64KiB reads and resumes exact parts", async () => {
  const h=nativeChatFileHarness(), bytes=new Uint8Array(4194304+11).fill(73);h.select("합성.zip",bytes);const file=await h.choose();
  const id="12345678-1234-1234-1234-123456789abc";
  h.setRequestHandler(async (url: string)=>url.endsWith("/uploads")?response({uploadId:id,uploadedParts:[]}):response({message:message({...attachment,originalName:"합성.zip",size:bytes.length})}));
  const saved=await h.native.uploadChatFile({file,actorId:"sender",peerId:"recipient",body:"",requestId:"native-upload-key",token:"synthetic-session"});assert.equal(saved.message.attachment.size,bytes.length);
  assert.deepEqual(h.hashes.map((r:{size:number})=>r.size),[4194304,11,4194304,11]);assert.deepEqual(h.wrapped.map((r:{size:number})=>r.size),[4194304,11]);assert.ok(h.reads.every((size:number)=>size<=65536));assert.equal(h.requests.filter((r:{method?:string})=>r.method==="PUT").length,2);
  assert.equal([...h.records.keys()].filter(uri=>uri.includes("chunk.bin")).length,0);assert.ok(h.events.filter((r:string[])=>r[0]==="create"&&r[1].endsWith("chunk.bin")).length===4);file.release();await h.native.clearChatFileResources();
});

test("native SAF uses display names, closes exact external copy and permits receipt only after verification", async () => {
  const h=nativeChatFileHarness();h.folder.createFile("합성.pdf","application/pdf");const op=h.transfer();assert.equal(await op.download(),true);const saved=await op.save();assert.equal(saved.kind,"saved");assert.equal(saved.requiresConfirmation,false);
  const created=h.events.filter((r:string[])=>r[0]==="external-create");assert.equal(created.at(-1)[1],"합성 (1).pdf");const uri=created.at(-1)[2];assert.equal(h.records.get(uri).size,12);assert.ok(h.events.some((r:string[])=>r[0]==="close"&&r[1]===uri&&r[2]==="write"));
  assert.equal(h.requests.filter((r:{url:string})=>r.url.endsWith("/complete")).length,0);await op.complete();assert.equal(h.requests.filter((r:{url:string})=>r.url.endsWith("/complete")).length,1);op.release();await h.native.clearChatFileResources();assert.equal(h.records.has(uri),true);
});

test("native SAF cancel and truncated external copy never complete or delete existing external files", async () => {
  const h=nativeChatFileHarness(), existing=h.folder.createFile("existing.pdf","application/pdf"), op=h.transfer();await op.download();
  h.setDirectory(async()=>{const error=new Error("cancel");error.name="AbortError";throw error;});assert.equal(await op.save(),null);assert.equal(h.requests.length,1);
  h.setDirectory(async()=>h.folder);h.setExternalTruncate(true);await assert.rejects(op.save());assert.equal(h.requests.filter((r:{url:string})=>r.url.endsWith("/complete")).length,0);assert.equal(h.records.has(existing.uri),true);assert.equal([...h.records.keys()].filter(uri=>uri.startsWith("content:")).length,1);await h.native.clearChatFileResources();
});

test("native share void/background handoff retains bytes and requires explicit receipt confirmation", async () => {
  const h=nativeChatFileHarness();h.setOS("ios");let uri="";h.setShare(async(value:string)=>{uri=value;h.setForeground(false);});const op=h.transfer();await op.download();const exported=await op.save();assert.equal(h.getForeground(),false);assert.equal(exported.kind,"handoff");assert.equal(exported.requiresConfirmation,true);assert.equal(op.getState().exported,true);assert.equal(h.records.has(uri),true);
  await assert.rejects(op.complete(),{status:400});assert.equal(h.requests.length,1);h.setForeground(true);await op.complete({confirmedSaved:true});op.release();assert.equal(h.records.has(uri),true);
  const timer=[...h.timers.values()].find((t:{delay:number})=>t.delay===600000);assert.ok(timer);timer.callback();assert.equal(h.records.has(uri),false);await h.native.clearChatFileResources();
});

test("native account cleanup during non-cancellable share invalidates late handoff and cleans only private bytes", async () => {
  const h=nativeChatFileHarness();h.setOS("ios");let finish!:()=>void;h.setShare(()=>new Promise<void>(resolve=>{finish=resolve;}));const op=h.transfer();await op.download();const pending=op.share();await tick();const clearing=h.native.clearChatFileResources();assert.equal(op.isReady(),false);h.setActorCurrent(false);finish();assert.equal(await pending,null);await clearing;
  assert.equal([...h.records.keys()].filter(uri=>uri.includes("chat-file-transfers")).length,0);assert.equal(h.requests.filter((r:{url:string})=>r.url.endsWith("/complete")).length,0);
});

test("native preview checks magic/stat privately, without download lease, complete or binary body allocation", async () => {
  const h=nativeChatFileHarness();const preview=await h.native.loadChatPreview({attachment,token:"synthetic-session"});assert.equal(preview.kind,"pdf");assert.match(preview.uri,/^file:/);assert.equal(h.requests.length,1);assert.equal(h.requests[0].method,"GET");assert.match(h.requests[0].url,/preview$/);assert.ok(h.reads.every((size:number)=>size<=16));preview.release();assert.equal(h.records.has(preview.uri),false);await h.native.clearChatFileResources();
});

test("native authoritative stat and HTTP errors never expose partial files or receipt-ready state", async () => {
  for (const [bytes,status] of [[new Uint8Array(11),200],[new Uint8Array(12),401]] as const) {
    const h=nativeChatFileHarness();h.setBinary(bytes,status);const op=h.transfer();await assert.rejects(op.download());assert.equal(op.isReady(),false);assert.equal([...h.records.keys()].filter(uri=>uri.includes("chat-file-transfers")).length,0);assert.equal(h.requests.length,1);await h.native.clearChatFileResources();
  }
});

test("native late picker result is discarded and only its SDK cache copy is removed on account change", async () => {
  const h=nativeChatFileHarness();let finish!:(value:unknown)=>void;h.setPicker(()=>new Promise(resolve=>{finish=resolve;}));const pending=h.choose();await tick();await h.native.clearChatFileResources();h.setActorCurrent(false);
  finish({canceled:false,assets:[{uri:"file:///cache/DocumentPicker/chosen",name:"합성.pdf",size:12,mimeType:"application/pdf"}]});assert.equal(await pending,null);assert.equal(h.records.has("file:///cache/DocumentPicker/chosen"),false);assert.equal(h.requests.length,0);
});


test("native oversized HTTP error bodies stay on disk and never call whole-body JSON", async () => {
  const h = nativeChatFileHarness(); h.setBinary(new Uint8Array(16 * 1024 + 1), 500);
  const op = h.transfer(); await assert.rejects(op.download(), { status: 500 });
  assert.equal(h.events.filter((event: string[]) => event[0] === "json").length, 0);
  assert.equal([...h.records.keys()].filter(uri => uri.includes("chat-file-transfers")).length, 0);
  assert.equal(op.isReady(), false); await h.native.clearChatFileResources();
});
