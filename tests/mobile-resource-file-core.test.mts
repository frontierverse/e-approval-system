import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiError } from "../mobile/src/lib/api";
import { createResourceFileApi, resourceDownloadInfo, resourcePreviewKind, type ResourceFileAdapter } from "../mobile/src/lib/resource-file-core";
const policy={maxFileCount:1,maxFileSizeMb:300,allowedExtensions:[".pdf"]};
const digest="a".repeat(64), descriptor={name:"자료.pdf",size:12,mimeType:"application/pdf",wholeSha256:digest};
const dto=(patch:Record<string,unknown>={})=>({id:"upload-id",targetResourceId:null,file:descriptor,state:"uploading",expiresAt:"2099-01-01T00:00:00.000Z",completedAt:null,consumedResourceId:null,cleanupPending:false,...patch});
const attachment={id:"file",name:"자료.pdf",size:12,mimeType:"application/pdf",previewKind:"pdf" as const};
function harness(){
 const calls:{path:string;options:Record<string,unknown>}[]=[],removed:unknown[]=[];let puts=0,hashes=0,current=true;let responder=async(path:string,options:Record<string,unknown>):Promise<unknown>=>{void options;return path.endsWith("/complete")?{upload:dto({state:"ready",completedAt:"2026-10-03T00:00:00.000Z"})}:{upload:dto(),grant:{method:"PUT",url:"https://storage.example/private-signed",headers:{"Content-Type":"application/pdf"},expiresAt:"2099-01-01T00:00:00.000Z"}};};
 const local={size:12};let hash=async()=>digest;
 const adapter:ResourceFileAdapter<typeof local>={pick:async()=>({file:local,...descriptor}),size:file=>file.size,hash:async()=>{hashes++;return hash();},put:async()=>{puts++;},download:async()=>({file:{size:12},info:descriptor}),head:async()=>new TextEncoder().encode("%PDF-1.7\nabc"),export:async()=>"자료.pdf 파일을 저장했습니다.",preview:()=>({uri:"private-synthetic",release(){}}),release:file=>removed.push(file),clear:async()=>{}};
 const request=async<T,>(path:string,_token:string,options:Record<string,unknown>={})=>{calls.push({path,options});return await responder(path,options) as T;};
 const api=createResourceFileApi(adapter,request);
 const pick=()=>api.pickResourceFile({policy,token:"account-a",isCurrent:()=>current});
 const operation=(file:Awaited<ReturnType<typeof pick>>)=>api.createResourceUpload({file:file!,token:"account-a",targetResourceId:null,requestId:"original-request",isCurrent:()=>current});
 return {api,adapter,local,calls,removed,pick,operation,setResponder(fn:typeof responder){responder=fn;},setHash(fn:typeof hash){hash=fn;},invalidate(){current=false;},counts:()=>({puts,hashes})};
}
test("selected snapshot is opaque; whole SHA binds original request and direct binary PUT",async()=>{const h=harness(),file=await h.pick();assert.deepEqual(Object.keys(file!).sort(),["name","release","size"]);assert.ok(Object.isFrozen(file));const op=h.operation(file);await op.prepare();assert.equal(op.readyUploadId(),"upload-id");assert.equal(h.counts().hashes,1);assert.equal(h.counts().puts,1);assert.equal((h.calls[0].options.body as typeof descriptor).wholeSha256,digest);assert.equal(h.calls[0].path,"/resources/uploads");assert.throws(()=>h.api.createResourceUpload({file:file!,token:"account-a",targetResourceId:"different",requestId:"original-request"}),{status:409});await h.api.clearResourceFileResources();});
test("lost start plus pure status404 never drops snapshot or original key",async()=>{const h=harness(),file=await h.pick(),op=h.operation(file);h.setResponder(async()=>{throw new ApiError("start lost",0);});await assert.rejects(op.prepare(),{status:0});file!.release();assert.equal(h.removed.length,0);h.setResponder(async()=>{throw new ApiError("no receipt",404);});await assert.rejects(op.refresh(),{status:404});assert.equal(h.calls[1].path,"/resources/uploads?requestId=original-request");h.setResponder(async path=>path.endsWith("/complete")?{upload:dto({state:"ready",completedAt:"2026-10-03T00:00:00.000Z"})}:{upload:dto(),grant:{method:"PUT",url:"https://storage.example/private-signed",headers:{"Content-Type":"application/pdf"},expiresAt:"2099-01-01T00:00:00.000Z"}});await op.prepare();assert.deepEqual(h.calls[0].options.body,h.calls[2].options.body);await h.api.clearResourceFileResources();});
test("202 finalizing retry is sameID complete and never PUTs snapshot again",async()=>{const h=harness(),file=await h.pick(),op=h.operation(file);let finalizing=true;h.setResponder(async path=>path.endsWith("/complete")?{upload:dto({state:finalizing?"finalizing":"ready",completedAt:finalizing?null:"2026-10-03T00:00:00.000Z"})}:{upload:dto(),grant:{method:"PUT",url:"https://storage.example/private-signed",headers:{"Content-Type":"application/pdf"},expiresAt:"2099-01-01T00:00:00.000Z"}});await assert.rejects(op.prepare(),{status:202});assert.equal(op.getState().phase,"finalizing");finalizing=false;await op.prepare();assert.equal(h.counts().puts,1);assert.equal(h.calls[2].path,"/resources/uploads/upload-id/complete");await h.api.clearResourceFileResources();});
test("stale account hash cannot start upload and account clear invalidates already selected handle",async()=>{const h=harness(),file=await h.pick(),op=h.operation(file);let release!:(value:string)=>void;h.setHash(()=>new Promise(resolve=>release=resolve));const pending=op.prepare();await Promise.resolve();await h.api.clearResourceFileResources();release(digest);await assert.rejects(pending,{name:"AbortError"});assert.equal(h.calls.length,0);assert.equal(h.removed.length,1);assert.equal(op.readyUploadId(),null);});
test("mismatched metadata, hash or target never turns ready",async()=>{for(const patch of [{targetResourceId:"foreign"},{file:{...descriptor,wholeSha256:"b".repeat(64)}},{file:{...descriptor,size:13}}]){const h=harness(),file=await h.pick(),op=h.operation(file);h.setResponder(async()=>({upload:dto(patch),grant:null}));await assert.rejects(op.prepare(),{status:201});assert.equal(op.readyUploadId(),null);assert.equal(h.counts().puts,0);await h.api.clearResourceFileResources();}});
test("nonconsuming resource save has no chat receipt or server mutation",async()=>{const h=harness();const op=h.api.createResourceFileTransfer({attachment,token:"account-a"});assert.equal(await op.download(),true);assert.equal(await op.save(),"자료.pdf 파일을 저장했습니다.");assert.equal(h.calls.length,0);op.release();assert.equal(h.removed.length,1);await h.api.clearResourceFileResources();});
test("filename/MIME from download headers are authoritative and length must match metadata",()=>{assert.deepEqual(resourceDownloadInfo({"Content-Disposition":"attachment; filename*=UTF-8''actual.pdf","Content-Type":"application/pdf","Content-Length":"12"},attachment),{name:"actual.pdf",mimeType:"application/pdf",size:12});assert.throws(()=>resourceDownloadInfo({"Content-Disposition":"attachment; filename=x.pdf","Content-Length":"13","Content-Type":"application/pdf"},attachment),{status:0});assert.throws(()=>resourcePreviewKind(new TextEncoder().encode("<svg>"),"image/svg+xml"),{status:415});});
test("explicit discard releases private bytes but never touches selected external original",async()=>{const h=harness(),file=await h.pick(),op=h.operation(file);h.setResponder(async()=>{throw new ApiError("lost",0);});await assert.rejects(op.prepare());h.api.discardResourceFile(file!,{token:"account-a"});assert.equal(h.removed.length,1);assert.equal(h.calls.length,1);await assert.rejects(op.prepare(),{name:"AbortError"});await h.api.clearResourceFileResources();});

test("unknown PUT plus status uploading permits only same complete, never fresh grant or retransmission", async () => {
  const h = harness(), file = await h.pick(), op = h.operation(file);
  let puts = 0;
  h.adapter.put = async () => { puts++; throw new ApiError("PUT response lost", 0); };
  await assert.rejects(op.prepare(), { status: 0 });
  h.setResponder(async path => {
    if (path.endsWith("/complete")) throw new ApiError("write still unknown", 503, undefined, "STORAGE_UNAVAILABLE");
    return { upload: dto() };
  });
  await op.refresh();
  await assert.rejects(op.prepare(), { code: "STORAGE_UNAVAILABLE" });
  assert.equal(puts, 1);
  assert.equal(h.calls.at(-1)?.path, "/resources/uploads/upload-id/complete");
  assert.equal(h.calls.some(call => call.path.endsWith("/grant")), false);
  await h.api.clearResourceFileResources();
});
test("only server UPLOAD_RETRY proof authorizes next explicit same-snapshot PUT", async () => {
  const h = harness(), file = await h.pick(), op = h.operation(file);
  let puts = 0, retryProof = true;
  h.adapter.put = async () => { if (++puts === 1) throw new ApiError("staging absent", 0); };
  await assert.rejects(op.prepare(), { status: 0 });
  h.setResponder(async path => {
    if (path.endsWith("/complete")) {
      if (retryProof) throw new ApiError("safe retransmission", 503, undefined, "UPLOAD_RETRY");
      return { upload: dto({ state: "ready", completedAt: "2026-10-03T00:00:00.000Z" }) };
    }
    return { upload: dto(), grant: { method: "PUT", url: "https://storage.example/private-signed", headers: { "Content-Type": "application/pdf" }, expiresAt: "2099-01-01T00:00:00.000Z" } };
  });
  await assert.rejects(op.prepare(), { code: "UPLOAD_RETRY" });
  assert.equal(puts, 1);
  retryProof = false;
  await op.prepare();
  assert.equal(puts, 2);
  assert.equal(h.calls.filter(call => call.path === "/resources/uploads").length, 1);
  assert.equal(h.calls.filter(call => call.path.endsWith("/grant")).length, 1);
  assert.equal(h.counts().hashes, 1);
  assert.equal(op.readyUploadId(), "upload-id");
  await h.api.clearResourceFileResources();
});
test("terminal deleting tombstone refresh keeps descriptor private and cannot ready", async () => {
  const h = harness(), file = await h.pick(), op = h.operation(file);
  await op.prepare();
  h.setResponder(async () => ({ upload: dto({ state: "deleting", file: null, cleanupPending: true }) }));
  await op.refresh();
  assert.equal(op.getState().phase, "deleting");
  assert.equal(op.readyUploadId(), null);
  await assert.rejects(op.prepare(), { status: 410 });
  assert.equal(h.counts().puts, 1);
  await h.api.clearResourceFileResources();
});
