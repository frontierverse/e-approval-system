import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, beforeEach, test } from "node:test";
import ts from "typescript";
import { ApiError } from "../mobile/src/lib/api.ts";
import * as core from "../mobile/src/lib/account-image-core.ts";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jE1cAAAAASUVORK5CYII=", "base64");
const jpeg = Buffer.from([255,216,255,224,0,0]);
const webp = Buffer.from("RIFF0000WEBPVP8 ");
const result = { ok: true, message: "이미지를 저장했습니다.", image: { exists: true, mimeType: "image/webp", size: 120, updatedAt: "2026-10-03T00:00:00Z" } };

test("image validation checks actual bytes and size, accepting only matching JPEG, PNG and WEBP", () => {
  for (const [name,bytes,mime] of [["photo.jpeg",jpeg,"image/jpeg"],["도장.png",png,"image/png"],["photo.webp",webp,"image/webp"]] as const) {
    assert.equal(core.validateAccountImage(name,bytes.length,bytes).mimeType,mime);
  }
  for (const [name,bytes] of [["fake.png",Buffer.from("<svg>unsafe</svg>")],["fake.svg",png],["wrong.jpg",png],["unknown",webp]] as const) {
    assert.throws(() => core.validateAccountImage(name,bytes.length,bytes),ApiError);
  }
  assert.throws(() => core.validateAccountImage("x.png",0,png),ApiError);
  assert.equal(core.validateAccountImage("x.png",core.ACCOUNT_IMAGE_MAX_INPUT_BYTES,png).size,4*1024*1024);
  assert.throws(() => core.validateAccountImage("x.png",core.ACCOUNT_IMAGE_MAX_INPUT_BYTES+1,png), /4MB/);
  const safe = core.validateAccountImage("../../\u202e도장.png",png.length,png).name;
  assert.doesNotMatch(safe,/[\/\\\u202e]/);
});
test("kind paths and multipart fields are closed sets and timestamp never creates another path", () => {
  assert.equal(core.accountImageInputName("profile"),"profileImage");
  assert.equal(core.accountImageInputName("signature"),"signatureImage");
  assert.equal(core.accountImagePath("signature","v&token=x#"),"/account/signature-image?v=v%26token%3Dx%23");
  assert.throws(() => core.accountImagePath("other" as core.AccountImageKind),ApiError);
});
test("upload responses preserve authorization and validation errors and reject malformed successes", () => {
  assert.deepEqual(core.accountImageResponse(200,result),result);
  for (const status of [401,403,422]) {
    assert.throws(() => core.accountImageResponse(status,{error:"수정 불가",fields:{profileImage:"파일 오류",unsafe:3}}),(error:unknown) => error instanceof ApiError && error.status===status && error.fields?.profileImage === "파일 오류" && !('unsafe' in error.fields));
  }
  assert.throws(() => core.accountImageResponse(401,"HTML"),(error:unknown) => error instanceof ApiError&&error.status===401);
  for (const bad of [null,{ok:true}, {...result,image:{...result.image,size:-1}}, {...result,image:{...result.image,exists:"yes"}}]) assert.throws(() => core.accountImageResponse(200,bad),ApiError);
});
test("preview headers must match actual image bytes, stored limit and completed length", () => {
  assert.equal(core.validateAccountImagePreview(png.length,png,{"Content-Type":"image/png","Content-Length":String(png.length)}),"image/png");
  for (const [size,bytes,headers] of [[png.length,png,{"Content-Type":"image/jpeg"}],[png.length,png,{"Content-Type":"image/png","Content-Length":"1"}],[2*1024*1024+1,png,{"Content-Type":"image/png"}],[6,jpeg,{"Content-Type":"text/html"}]] as const) assert.throws(()=>core.validateAccountImagePreview(size,bytes,headers),ApiError);
});

// Exercise the production native helper at its Expo/BlobUtil boundary; this does not claim physical-device verification.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
type Node = { directory?: boolean; data?: Buffer };
const state: Row = {};
const nodes = () => state.nodes as Map<string,Node>;
function uriOf(parts: (string|{uri:string})[]) {
  return parts.map((part,index)=>typeof part==="string" ? (index ? encodeURIComponent(part) : part.replace(/\/$/,"")) : part.uri.replace(/\/$/,"")).join("/");
}
class FakeFile {
  uri: string;
  constructor(...parts:(string|{uri:string})[]) { this.uri=uriOf(parts); }
  get exists() { return nodes().has(this.uri); }
  get size() { return nodes().get(this.uri)?.data?.length ?? 0; }
  delete() { nodes().delete(this.uri); }
  async move(destination:FakeFile) { nodes().set(destination.uri,nodes().get(this.uri)!);nodes().delete(this.uri);this.uri=destination.uri; if(state.onMove)await state.onMove(); }
  open() {
    const uri=this.uri;let offset=0;
    state.handles+=1;
    return { readBytes(length:number) { const data=nodes().get(uri)!.data!.subarray(offset,offset+length);offset+=data.length;return new Uint8Array(data); }, close() { state.handles-=1; } };
  }
}
class FakeDirectory {
  uri: string;
  constructor(...parts:(string|{uri:string})[]) { this.uri=uriOf(parts); }
  get exists() { return nodes().has(this.uri); }
  create() { nodes().set(this.uri,{directory:true}); }
  delete() { for(const uri of nodes().keys())if(uri===this.uri||uri.startsWith(this.uri+"/"))nodes().delete(uri); }
}
const key="__accountImageNativeBoundary";
const harness:Row={ ...core,ApiError,File:FakeFile,Directory:FakeDirectory,FileMode:{ReadOnly:"r"},Paths:{cache:{uri:"file:///cache/"}},apiUrl:(path:string)=>`https://server.example/api/mobile${path}`,
  DocumentPicker:{ getDocumentAsync(options:Row) {
    state.pickerOptions=options;
    return new Promise(resolve=>{
      const finish=()=>{
        if(state.pickerCancel)resolve({canceled:true,assets:null});
        else { nodes().set(state.pickerUri,{data:Buffer.from(state.pickerBytes)});resolve({canceled:false,assets:[{uri:state.pickerUri,name:state.pickerName,size:1,mimeType:"image/svg+xml"}]}); }
      };
      state.finishPicker=finish;if(!state.holdPicker)queueMicrotask(finish);
    });
  }},
  ReactNativeBlobUtil:{ wrap:(path:string)=>`wrapped:${path}`,config(config:Row) { return { fetch(method:string,url:string,headers:Row,body:unknown) {
    state.requests.push({method,url,headers,body,config});
    let resolve!:(value:Row)=>void;let reject!:(error:Error)=>void;
    const promise:Row=new Promise((yes,no)=>{resolve=yes;reject=no;});
    const finish=()=>{
      if(config.path) {
        const uri=`file://${config.path}`;
        nodes().set(uri.slice(0,uri.lastIndexOf("/")),{directory:true});
        nodes().set(uri,{data:Buffer.from(state.downloadBytes)});
      }
      resolve({info:()=>({status:state.status,headers:state.headers}),json:async()=>{if(state.jsonError)throw new Error("Invalid JSON");return state.response;}});
    };
    state.finishRequest=finish;
    promise.cancel=()=>{state.cancelCalls+=1;if(state.cancelThrows)throw new Error("completed");reject(new Error("native canceled"));};
    if(!state.holdRequest)queueMicrotask(finish);
    return promise;
  }}; } },
};
(globalThis as Row)[key]=harness;
let source=readFileSync(new URL("../mobile/src/lib/account-image.native.ts",import.meta.url),"utf8");
source=source.replace(/^import[\s\S]*?from "\.\/account-image-core";\n/,`const {DocumentPicker,Directory,File,FileMode,Paths,ReactNativeBlobUtil,ApiError,apiUrl,ACCOUNT_IMAGE_MIME_TYPES,accountImageAbortError,accountImageInputName,accountImagePath,accountImageResponse,isAccountImageAbortError,validateAccountImage,validateAccountImagePreview}=globalThis.${key};\n`);
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const native=await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
beforeEach(async()=>{
  await native.clearAccountImageResources();
  Object.assign(state,{nodes:new Map(),pickerUri:"file:///cache/DocumentPicker/picked.png",pickerName:"도장.png",pickerBytes:png,pickerCancel:false,holdPicker:false,pickerOptions:null,
    requests:[],holdRequest:false,status:200,response:result,headers:{"Content-Type":"image/png","Content-Length":String(png.length)},downloadBytes:png,jsonError:false,cancelCalls:0,cancelThrows:false,handles:0,onMove:null});
});
after(async()=>{ await native.clearAccountImageResources();delete(globalThis as Row)[key]; });
const tick=()=>new Promise<void>(resolve=>setImmediate(resolve));
const privateFiles=()=>[...nodes().keys()].filter(uri=>uri.includes("/account-images/op-"));
const picked=async()=>{const image=await native.pickAccountImage();assert.ok(image);return image;};

test("native selection owns a unique cache copy, trusts actual size/magic and releases without retaining picker copies",async()=>{
  const image=await picked();
  assert.equal(image.name,"도장.png");assert.equal(image.mimeType,"image/png");assert.equal(image.size,png.length);
  assert.ok(image.uri.startsWith("file:///cache/account-images/op-"));assert.equal(nodes().has(state.pickerUri),false);
  assert.deepEqual(nodes().get(image.uri)?.data,png);
  assert.deepEqual(state.pickerOptions,{type:core.ACCOUNT_IMAGE_MIME_TYPES,multiple:false,copyToCacheDirectory:true,base64:false});
  image.release();image.release();assert.equal(privateFiles().length,0);assert.equal(state.handles,0);
  await assert.rejects(native.uploadAccountImage({kind:"signature",token:"private-token",image}),/다시 선택/);
  assert.equal(state.requests.length,0);
});
test("foreign files are never removed, while invalid and oversized picker copies are removed",async()=>{
  state.pickerUri="content://provider/original.png";
  await assert.rejects(native.pickAccountImage(),ApiError);
  assert.deepEqual(nodes().get(state.pickerUri)?.data,png);
  state.pickerUri="file:///cache/DocumentPicker/picked.png";
  for(const bytes of [Buffer.from("<svg>"),Buffer.concat([png,Buffer.alloc(4*1024*1024)])]) {
    state.pickerBytes=bytes;await assert.rejects(native.pickAccountImage(),ApiError);assert.equal(nodes().has(state.pickerUri),false);
  }
  assert.equal(privateFiles().length,0);
});
test("picker cancel and account changes during a picker return null and remove only the cache copy",async()=>{
  state.pickerCancel=true;assert.equal(await native.pickAccountImage(),null);
  state.pickerCancel=false;state.holdPicker=true;
  const pending=native.pickAccountImage();await tick();await native.clearAccountImageResources();state.finishPicker();
  assert.equal(await pending,null);assert.equal(nodes().has(state.pickerUri),false);assert.equal(privateFiles().length,0);
});
test("account changes during a cache move cannot expose the old account image",async()=>{
  state.onMove=()=>native.clearAccountImageResources();
  assert.equal(await native.pickAccountImage(),null);assert.equal(privateFiles().length,0);
});
test("native multipart uses the correct field, actual MIME and header-only token without reading the complete image",async()=>{
  const image=await picked();
  for(const kind of ["profile","signature"] as const) {
    assert.deepEqual(await native.uploadAccountImage({kind,token:"private-token",image}),result);
    const request=state.requests.at(-1);
    assert.equal(request.url,`https://server.example/api/mobile/account/${kind}-image`);
    assert.deepEqual(request.headers,{Authorization:"Bearer private-token",Accept:"application/json","Content-Type":"multipart/form-data"});
    assert.deepEqual(request.body,[{name:kind==="profile"?"profileImage":"signatureImage",filename:"도장.png",type:"image/png",data:`wrapped:${decodeURIComponent(image.uri.slice(7))}`}]);
    assert.equal(request.config.followRedirect,false);assert.equal(request.config.timeout,120000);assert.doesNotMatch(request.url,/private-token/);
  }
  assert.equal(nodes().has(image.uri),true);assert.equal(state.handles,0);
});
test("401/validation/server errors preserve a selected image for retry until account cleanup",async()=>{
  const image=await picked();
  for(const status of [401,422,500]) {
    state.status=status;state.response={error:"실패"};
    await assert.rejects(native.uploadAccountImage({kind:"profile",token:"private-token",image}),(error:unknown)=>error instanceof ApiError&&error.status===status);
    assert.equal(nodes().has(image.uri),true);
  }
  state.status=200;state.response=result;
  assert.deepEqual(await native.uploadAccountImage({kind:"profile",token:"private-token",image}),result);
  await native.clearAccountImageResources();assert.equal(nodes().has(image.uri),false);
});
test("abort signals cancel native upload and preserve input, while account cleanup removes it",async()=>{
  const image=await picked();state.holdRequest=true;
  const controller=new AbortController();
  const pending=native.uploadAccountImage({kind:"signature",token:"private-token",image,signal:controller.signal});
  const assertion=assert.rejects(pending,(error:unknown)=>core.isAccountImageAbortError(error));
  controller.abort();await assertion;assert.equal(state.cancelCalls,1);assert.equal(nodes().has(image.uri),true);
  await native.clearAccountImageResources();assert.equal(nodes().has(image.uri),false);
});
test("pre-aborted requests never touch a network and late native successes cannot cross accounts",async()=>{
  const image=await picked();const controller=new AbortController();controller.abort();
  await assert.rejects(native.uploadAccountImage({kind:"profile",token:"private-token",image,signal:controller.signal}),(error:unknown)=>core.isAccountImageAbortError(error));
  assert.equal(state.requests.length,0);
  state.holdRequest=true;state.cancelThrows=true;
  const pending=native.uploadAccountImage({kind:"profile",token:"private-token",image});
  const assertion=assert.rejects(pending,(error:unknown)=>core.isAccountImageAbortError(error));
  await native.clearAccountImageResources();state.finishRequest();await assertion;
  assert.equal(privateFiles().length,0);
});
test("authenticated native previews get unique cache URLs and release/account cleanup remove every image",async()=>{
  const first=await native.loadAccountImage({kind:"profile",token:"account-a",updatedAt:"2026-10-03T01:00:00Z"});
  const second=await native.loadAccountImage({kind:"profile",token:"account-b"});
  assert.notEqual(first.uri,second.uri);assert.deepEqual(nodes().get(first.uri)?.data,png);
  assert.deepEqual(state.requests[0].headers,{Authorization:"Bearer account-a",Accept:"image/jpeg, image/png, image/webp"});
  assert.match(state.requests[0].url,/profile-image\?v=2026-10-03T01%3A00%3A00Z$/);assert.doesNotMatch(state.requests[0].url,/account-a/);
  first.release();assert.equal(nodes().has(first.uri),false);assert.equal(nodes().has(second.uri),true);
  await native.clearAccountImageResources();assert.equal(nodes().has(second.uri),false);assert.equal(state.handles,0);
});
test("permission failures, invalid MIME/magic and truncated bodies cannot become preview resources",async()=>{
  for(const status of [401,403,404]) {
    state.status=status;state.response={error:"읽기 불가"};
    await assert.rejects(native.loadAccountImage({kind:"signature",token:"private-token"}),(error:unknown)=>error instanceof ApiError&&error.status===status);
    assert.equal(privateFiles().length,0);
  }
  state.status=200;
  for(const headers of [{"Content-Type":"image/png","Content-Length":"900"},{"Content-Type":"text/html"},{"Content-Type":"image/webp"}]) {
    state.headers=headers;await assert.rejects(native.loadAccountImage({kind:"signature",token:"private-token"}),ApiError);assert.equal(privateFiles().length,0);
  }
  state.headers={"Content-Type":"image/png"};state.downloadBytes=Buffer.from("<html>error</html>");
  await assert.rejects(native.loadAccountImage({kind:"signature",token:"private-token"}),ApiError);assert.equal(privateFiles().length,0);assert.equal(state.handles,0);
});
test("account cleanup cancels preview downloads and late disk writes are removed",async()=>{
  state.holdRequest=true;state.cancelThrows=true;
  const pending=native.loadAccountImage({kind:"profile",token:"old-account"});
  const assertion=assert.rejects(pending,(error:unknown)=>core.isAccountImageAbortError(error));
  await native.clearAccountImageResources();state.finishRequest();await assertion;
  assert.equal(privateFiles().length,0);
});
