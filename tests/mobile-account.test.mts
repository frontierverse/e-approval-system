import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, beforeEach, describe, test } from "node:test";
import sharp from "sharp";
import ts from "typescript";
import { hashPassword, verifyPassword } from "../src/lib/password.ts";

// Actual route/session handlers, password policy and Sharp image processing;
// database transactions and external storage effects are isolated.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const harnessKey = "__mobileAccountHarness";
const token = "a".repeat(43);
const state: Row = {session:null, user:null, effects:[], stored:[], removed:[], reads:[], sessions:[]};
let serial: Promise<unknown> = Promise.resolve();
const prisma = {
  mobileSession: {
    async findUnique(input: Row) {
      return input.where.id ? state.sessions.find((row: Row) => row.id === input.where.id) ?? null : state.session;
    },
    async deleteMany(input: Row) {
      state.effects.push(["revoke", input]);
      state.sessions = state.sessions.filter((row: Row) => row.userId !== input.where.userId);
      if (state.session?.userId === input.where.userId) state.session = null;
    },
  },
  user: {
    async findUnique(input: Row) { state.reads.push(input); assert.equal(input.where.id, "staff"); return state.user; },
    async update(input: Row) { state.effects.push(["update",input]); assert.equal(input.where.id,"staff"); Object.assign(state.user,input.data); return state.user; },
  },
  auditLog: {async create(input: Row) { state.effects.push(["audit",input]); if (state.failAudit) throw new Error("private db error"); }},
  async $queryRaw(strings: TemplateStringsArray, ...values: unknown[]) {
    assert.ok(strings.join("?").includes('FROM "User" WHERE "id" = ? FOR UPDATE'));
    assert.deepEqual(values,["staff"]);
    state.effects.push(["lock"]);
  },
  async $transaction(callback: (tx: unknown) => Promise<unknown>) {
    const task = serial.then(async () => {
      const old = structuredClone({user:state.user, sessions:state.sessions, session:state.session});
      try { return await callback(prisma); }
      catch (cause) { Object.assign(state,old); throw cause; }
    });
    serial = task.catch(() => undefined);
    return task;
  },
};
const effects = {
  prisma,
  async prepareAttachmentFiles(values: File[], policy: Row, options: Row) {
    state.effects.push(["prepare", policy, options]);
    const file=values[0];
    if (file.size > policy.maxFileSizeMb * 1024 * 1024) return {error:"첨부파일은 2MB 이하만 등록할 수 있습니다.",files:[]};
    return {files:[{originalName:file.name, storageProvider:"local", storageKey:options.storageKeyPrefix+"test-"+(++state.counter)+".webp", mimeType:file.type,size:file.size,buffer:Buffer.from(await file.arrayBuffer())}]};
  },
  async persistAttachmentFiles(files: Row[]) { if(state.failStorage) throw new Error("private storage secret"); state.stored.push(...files); },
  async removeStoredAttachmentFiles(files: Row[]) {state.removed.push(...files);},
  async readStoredAttachmentFile(input: Row) { state.effects.push(["readFile",input]); if(state.failRead) throw new Error("private path"); return {body:new ReadableStream({start(c){c.enqueue(new Uint8Array(state.imageBytes));c.close();}}),size:state.imageBytes.length,mimeType:state.imageMime};},
};
(globalThis as Row)[harnessKey] = effects;
const moduleUrl=(source:string)=>`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const effectsUrl=moduleUrl(`const e=globalThis.${harnessKey}; export const prisma=e.prisma; export const {prepareAttachmentFiles,persistAttachmentFiles,removeStoredAttachmentFiles,readStoredAttachmentFile}=e;`);
function compile(file:string,replacements:Record<string,string>) {
  let source=readFileSync(new URL(`../src/${file}`,import.meta.url),"utf8");
  for(const[from,to]of Object.entries(replacements))source=source.replaceAll(`"${from}"`,JSON.stringify(to));
  return moduleUrl(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
}
const authUrl=compile("lib/mobile-auth.ts",{"@/lib/prisma":effectsUrl});
const helperUrl=compile("lib/mobile-account.ts",{"@/lib/prisma":effectsUrl,"@/lib/mobile-auth":authUrl,"@/lib/attachment-storage":effectsUrl,"sharp":import.meta.resolve("sharp")});
const paths=["account","account/password","account/profile-image","account/signature-image"];
const routes=Object.fromEntries(await Promise.all(paths.map(async path=>[path,await import(compile(`app/api/mobile/${path}/route.ts`,{"@/lib/mobile-account":helperUrl}))])));
function activeSession(role="USER") {return {id:"session",userId:"staff",expiresAt:new Date(Date.now()+60_000),user:{id:"staff",name:"직원",role,status:"ACTIVE",position:{name:"생활지도원"}}};}
function ownUser() {return {id:"staff",name:"직원",email:"staff@example.test",status:"ACTIVE",passwordHash:hashPassword("old-password"),department:{name:"회복지원팀"},position:{name:"생활지도원"},profileImageStorageKey:null,profileImageStorageProvider:null,profileImageMimeType:null,profileImageSize:null,profileImageUpdatedAt:null,signatureImageStorageKey:"private-signature-key",signatureImageStorageProvider:"local",signatureImageMimeType:"image/png",signatureImageSize:4,signatureImageUpdatedAt:new Date("2026-10-03T00:00:00Z")};}
function request(path:string,method="GET",body?:unknown,authorization: string | undefined=`Bearer ${token}`,extraHeaders:Record<string,string>={}) {
  const isForm=body instanceof FormData;
  return new Request(`https://example.test/api/mobile/${path}?userId=other&role=ADMIN`,{method,headers:{...(authorization?{Authorization:authorization}:{}),...(body!==undefined&&!isForm?{"Content-Type":"application/json"}:{}),...extraHeaders},...(body===undefined?{}:{body:isForm?body:JSON.stringify(body)})});
}
const password=(body:unknown)=>routes["account/password"].POST(request("account/password","POST",body));
async function upload(kind="signature",data?:Buffer,name="stamp.png",mimeType="image/png") {
  const buffer=data??await sharp({create:{width:5,height:5,channels:4,background:{r:200,g:0,b:0,alpha:0.25}}}).png().toBuffer();
  const form=new FormData();form.append(kind+"Image",new File([new Uint8Array(buffer)],name,{type:mimeType}));
  return routes[`account/${kind}-image`].POST(request(`account/${kind}-image`,"POST",form));
}
function privateResponse(response:Response) {assert.equal(response.headers.get("cache-control"),"private, no-store");assert.equal(response.headers.get("location"),null);}

describe("mobile account settings",()=>{
  beforeEach(()=>{ serial=Promise.resolve();Object.assign(state,{session:activeSession(),user:ownUser(),effects:[],stored:[],removed:[],reads:[],counter:0,failAudit:false,failStorage:false,failRead:false,imageBytes:Buffer.from([1,2,3,4]),imageMime:"image/png",sessions:[{id:"session",userId:"staff",expiresAt:new Date(Date.now()+60_000)},{id:"second",userId:"staff",expiresAt:new Date(Date.now()+60_000)},{id:"other-session",userId:"other",expiresAt:new Date(Date.now()+60_000)}]});});
  after(()=>{delete(globalThis as Row)[harnessKey];});

  test("all account methods reject missing, unknown, expired and inactive sessions before effects",async()=>{
    for(const kind of["missing","unknown","expired","inactive"]){
      state.session=kind==="unknown"?null:activeSession();
      if(kind==="expired")state.session.expiresAt=new Date(0);
      if(kind==="inactive")state.session.user.status="RESIGNED";
      for(const path of paths)for(const method of Object.keys(routes[path]).filter(key=>["GET","POST","DELETE"].includes(key))){
        const response=await routes[path][method](request(path,method,method==="POST"?{}:undefined,kind==="missing"?"":`Bearer ${token}`));
        assert.equal(response.status,401,`${kind} ${method} ${path}`);privateResponse(response);
      }
    }
    assert.deepEqual(state.effects,[]);assert.deepEqual(state.reads,[]);assert.deepEqual(state.stored,[]);
  });

  test("account metadata is read-only, personal and free of hashes, keys and raw signer data even for administrators",async()=>{
    state.session=activeSession("ADMIN");
    const response=await routes.account.GET(request("account"));privateResponse(response);
    const body=await response.json();
    assert.deepEqual(body,{account:{id:"staff",name:"직원",email:"staff@example.test",departmentName:"회복지원팀",positionName:"생활지도원",canChangePassword:true,profileImage:{exists:false,mimeType:null,size:null,updatedAt:null},signatureImage:{exists:true,mimeType:"image/png",size:4,updatedAt:"2026-10-03T00:00:00.000Z"}}});
    assert.equal(JSON.stringify(body).includes("private-"),false);assert.equal(JSON.stringify(body).includes(state.user.passwordHash),false);assert.deepEqual(state.effects,[]);
    state.user.passwordHash=null;assert.equal((await(await routes.account.GET(request("account"))).json()).account.canChangePassword,false);
  });

  test("password validation and incorrect current password preserve account and sessions",async()=>{
    const oldHash=state.user.passwordHash;
    for(const fields of[{currentPassword:"",newPassword:"abc",confirmPassword:"x"},{currentPassword:"old-password",newPassword:"old-password",confirmPassword:"old-password"},{currentPassword:"old-password",newPassword:"x".repeat(129),confirmPassword:"x".repeat(129)},{currentPassword:"bad-password",newPassword:"new-password",confirmPassword:"new-password"}]){
      const response=await password(fields);assert.equal(response.status,400);privateResponse(response);assert.ok((await response.json()).fields);
    }
    assert.equal(state.user.passwordHash,oldHash);assert.equal(state.sessions.length,3);assert.equal(state.effects.some((row:Row)=>row[0]==="update"),false);
    state.user.passwordHash=null;assert.equal((await password({currentPassword:"old-password",newPassword:"new-password",confirmPassword:"new-password"})).status,403);
  });

  test("password change hashes new credentials, atomically audits and revokes every own mobile session",async()=>{
    const response=await password({currentPassword:"old-password",newPassword:"new-password",confirmPassword:"new-password",userId:"other",role:"ADMIN"});
    assert.equal(response.status,200);privateResponse(response);assert.deepEqual(await response.json(),{ok:true,message:"비밀번호가 변경되었습니다. 새 비밀번호로 다시 로그인하세요.",reauthenticate:true});
    assert.equal(verifyPassword("new-password",state.user.passwordHash),true);assert.equal(verifyPassword("old-password",state.user.passwordHash),false);
    assert.deepEqual(state.sessions.map((row:Row)=>row.userId),["other"]);
    const audit=state.effects.find((row:Row)=>row[0]==="audit")[1].data;
    assert.equal(audit.action,"CHANGE_PASSWORD");assert.equal(audit.actorId,"staff");assert.equal(audit.targetId,"staff");assert.deepEqual(audit.metadata,{source:"account",client:"mobile"});
    assert.equal(JSON.stringify(audit).includes("password"),false);
    assert.equal((await routes.account.GET(request("account"))).status,401);
  });

  test("concurrent changes using the old password cannot overwrite the first change",async()=>{
    const inputs=["new-password-one","new-password-two"];
    const responses=await Promise.all(inputs.map(newPassword=>password({currentPassword:"old-password",newPassword,confirmPassword:newPassword})));
    assert.equal(responses.filter(r=>r.status===200).length,1);
    assert.ok(responses.some(r=>[400,401].includes(r.status)));
    assert.equal(state.effects.filter((row:Row)=>row[0]==="audit").length,1);
  });

  test("password transaction failure leaves old credentials and sessions intact without leaking database errors",async()=>{
    const oldHash=state.user.passwordHash;state.failAudit=true;
    const response=await password({currentPassword:"old-password",newPassword:"new-password",confirmPassword:"new-password"});
    assert.equal(response.status,500);assert.equal(state.user.passwordHash,oldHash);assert.equal(state.sessions.length,3);assert.equal(JSON.stringify(await response.json()).includes("private"),false);
  });

  test("profile and signature previews use only the authenticated account and private image headers",async()=>{
    state.session=activeSession("ADMIN");Object.assign(state.user,{profileImageStorageKey:"private-profile-key",profileImageStorageProvider:"local",profileImageMimeType:"image/png",profileImageSize:4});
    for(const kind of["profile","signature"]){
      const response=await routes[`account/${kind}-image`].GET(request(`account/${kind}-image`));assert.equal(response.status,200);privateResponse(response);
      assert.equal(response.headers.get("x-content-type-options"),"nosniff");assert.equal(response.headers.get("content-type"),"image/png");assert.equal(response.headers.get("content-length"),"4");
      assert.deepEqual(Buffer.from(await response.arrayBuffer()),state.imageBytes);
      assert.equal(state.effects.findLast((row:Row)=>row[0]==="readFile")[1].storageKey,kind==="profile"?"private-profile-key":"private-signature-key");
    }
    state.failRead=true;assert.equal((await routes["account/signature-image"].GET(request("account/signature-image"))).status,404);
    state.user.profileImageStorageKey=null;assert.equal((await routes["account/profile-image"].GET(request("account/profile-image"))).status,404);
  });

  test("uploads reject oversized, disguised, wrong-extension and multiple files before persistence",async()=>{
    for(const[bytes,name,status]of[[Buffer.from("<svg>private</svg>"),"file.png",400],[Buffer.from("not image"),"file.svg",400],[Buffer.alloc(4*1024*1024+1),"file.png",413]] as Array<[Buffer,string,number]>){assert.equal((await upload("signature",bytes,name)).status,status);}
    const form=new FormData();for(let i=0;i<2;i++)form.append("signatureImage",new File(["bad"],"file.png"));
    assert.equal((await routes["account/signature-image"].POST(request("account/signature-image","POST",form))).status,400);
    const huge=new Request("https://example.test/api/mobile/account/signature-image",{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"multipart/form-data; boundary=bad","Content-Length":String(5*1024*1024)},body:"bad"});
    assert.equal((await routes["account/signature-image"].POST(huge)).status,413);
    assert.deepEqual(state.stored,[]);assert.equal(state.effects.some((row:Row)=>row[0]==="update"),false);
  });

  test("animated images, oversized pixel dimensions and chunked bodies without Content-Length are rejected",async()=>{
    const frame=Buffer.from([0x21,0xf9,4,4,10,0,0,0,0x2c,0,0,0,0,1,0,1,0,0,2,2,0x44,1,0]);
    const second=Buffer.from(frame);second[20]=0x4c;
    const gif=Buffer.concat([Buffer.from("GIF89a"),Buffer.from([1,0,1,0,0x80,0,0,255,0,0,0,255,0]),frame,second,Buffer.from([0x3b])]);
    const animated=await sharp(gif,{animated:true}).webp().toBuffer();
    assert.equal((await sharp(animated).metadata()).pages,2);
    assert.equal((await upload("signature",animated,"stamp.webp","image/webp")).status,400);
    const hugePixels=await sharp({create:{width:7000,height:6000,channels:3,background:"white"}}).png().toBuffer();
    assert.equal((await upload("profile",hugePixels,"photo.png")).status,400);
    let cancelled=false;
    const body=new ReadableStream<Uint8Array>({start(controller){controller.enqueue(new Uint8Array(4*1024*1024));controller.enqueue(new Uint8Array(100*1024));},cancel(){cancelled=true;}});
    const req=new Request("https://example.test/api/mobile/account/profile-image",{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"multipart/form-data; boundary=test"},body,duplex:"half"});
    assert.equal(req.headers.has("content-length"),false);
    assert.equal((await routes["account/profile-image"].POST(req)).status,413);
    assert.equal(cancelled,true);assert.deepEqual(state.stored,[]);
  });

  test("the upload deadline cancels a stalled body and returns a private timeout",async(t)=>{
    t.mock.timers.enable({apis:["setTimeout"]});
    let cancelled=false;
    const body=new ReadableStream<Uint8Array>({cancel(){cancelled=true;}});
    const req=new Request("https://example.test/api/mobile/account/profile-image",{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"multipart/form-data; boundary=test"},body,duplex:"half"});
    const pending=routes["account/profile-image"].POST(req);
    for(let i=0;i<10;i++)await Promise.resolve();
    t.mock.timers.tick(10_001);
    const response=await pending;assert.equal(response.status,408);privateResponse(response);assert.equal(cancelled,true);assert.deepEqual(state.stored,[]);
  });

  test("a legacy current password longer than 128 characters can still be changed",async()=>{
    const currentPassword="a".repeat(200);state.user.passwordHash=hashPassword(currentPassword);
    const response=await password({currentPassword,newPassword:"new-password",confirmPassword:"new-password"});
    assert.equal(response.status,200);assert.equal(verifyPassword("new-password",state.user.passwordHash),true);
  });

  test("signature upload re-encodes actual pixels, preserves transparency, strips metadata and removes only the old image",async()=>{
    const input=await sharp({create:{width:1200,height:400,channels:4,background:{r:255,g:0,b:0,alpha:0.3}}}).withMetadata({exif:{IFD0:{Artist:"private identity"}}}).png().toBuffer();
    const response=await upload("signature",input,"signature.png","text/html");assert.equal(response.status,200);privateResponse(response);
    const result=await response.json();assert.equal(result.image.exists,true);assert.equal(result.image.mimeType,"image/webp");assert.ok(result.image.size<=2*1024*1024);
    assert.equal(JSON.stringify(result).includes("signature-images/"),false);
    const stored=state.stored[0];const meta=await sharp(stored.buffer).metadata();
    assert.equal(meta.format,"webp");assert.equal(meta.width,1024);assert.equal(meta.hasAlpha,true);assert.equal(meta.exif,undefined);
    assert.equal(state.user.signatureImageStorageKey,stored.storageKey);assert.deepEqual(state.removed.map((row:Row)=>row.storageKey),["private-signature-key"]);
    assert.equal(state.effects.find((row:Row)=>row[0]==="prepare")[2].storageKeyPrefix,"signature-images/");
  });

  test("profile compression uses its existing 768px storage policy and leaves signature untouched",async()=>{
    const input=await sharp({create:{width:1000,height:1000,channels:3,background:"blue"}}).jpeg().toBuffer();
    const response=await upload("profile",Buffer.concat([input,Buffer.alloc(2*1024*1024+100)]),"photo.jpg");assert.equal(response.status,200);
    const meta=await sharp(state.stored[0].buffer).metadata();assert.equal(meta.width,768);assert.equal(meta.height,768);
    assert.equal(state.user.signatureImageStorageKey,"private-signature-key");assert.equal(state.effects.find((row:Row)=>row[0]==="prepare")[2].storageKeyPrefix,"profile-images/");
  });

  test("storage or transaction failure cleans new orphan bytes and preserves the old image",async()=>{
    state.failStorage=true;let response=await upload();assert.equal(response.status,503);assert.equal(state.user.signatureImageStorageKey,"private-signature-key");
    state.failStorage=false;state.failAudit=true;response=await upload();assert.equal(response.status,500);assert.equal(state.user.signatureImageStorageKey,"private-signature-key");
    assert.ok(state.removed.some((row:Row)=>row.storageKey.startsWith("signature-images/")));assert.equal(state.removed.some((row:Row)=>row.storageKey==="private-signature-key"),false);
    assert.equal(JSON.stringify(await response.json()).includes("private"),false);
  });

  test("concurrent replacements clean superseded images without deleting the final selected image",async()=>{
    const responses=await Promise.all([upload(),upload()]);assert.ok(responses.every(r=>r.status===200));
    const current=state.user.signatureImageStorageKey;assert.equal(state.removed.some((row:Row)=>row.storageKey===current),false);
    assert.ok(state.removed.some((row:Row)=>row.storageKey==="private-signature-key"));
    assert.equal(state.stored.filter((row:Row)=>row.storageKey!==current).every((row:Row)=>state.removed.some((removed:Row)=>removed.storageKey===row.storageKey)),true);
  });

  test("deletion is personal and idempotent, audits only an actual removal and clears preview metadata",async()=>{
    state.session=activeSession("ADMIN");
    for(let i=0;i<2;i++){
      const response=await routes["account/signature-image"].DELETE(request("account/signature-image","DELETE"));assert.equal(response.status,200);privateResponse(response);
      assert.deepEqual((await response.json()).image,{exists:false,mimeType:null,size:null,updatedAt:null});
    }
    assert.equal(state.user.signatureImageStorageKey,null);assert.equal(state.user.signatureImageUpdatedAt,null);
    assert.equal(state.effects.filter((row:Row)=>row[0]==="audit").length,1);assert.deepEqual(state.removed.map((row:Row)=>row.storageKey),["private-signature-key"]);
  });

  test("a revoked in-flight session cannot update images after acquiring the user lock",async()=>{
    state.sessions=state.sessions.filter((row:Row)=>row.userId!=="staff");
    const response=await upload();assert.equal(response.status,401);assert.equal(state.user.signatureImageStorageKey,"private-signature-key");
    assert.equal(state.effects.some((row:Row)=>row[0]==="update"),false);assert.equal(state.removed.length,1);
  });
});
