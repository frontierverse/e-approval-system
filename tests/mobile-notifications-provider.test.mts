import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, beforeEach, test } from "node:test";
import ts from "typescript";
import { ApiError } from "../mobile/src/lib/api.ts";

// Exercise production hooks and push helpers with lexical React/Expo/API boundaries, without changing real globals.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const key = "__notificationsAccountBoundary";
const state: Row = {};
let rendering: Hooks;
function activate(scope: Hooks) { rendering = scope; }
const same = (a: unknown[]|undefined, b: unknown[]) => !!a && a.length===b.length && a.every((item,index)=>Object.is(item,b[index]));
class Hooks {
  slots: Row[]=[]; index=0; effects: Row[]=[]; value: Row={}; mounted=true;
  token="account-a";
  render() {
    activate(this);this.index=0;
    const tree=native.AccountNotificationsProvider({children:null,token:this.token,isCurrentToken});
    this.value=tree.props.value;return this.value;
  }
  flush() { for(const effect of this.effects.splice(0)) { effect.slot.cleanup?.();effect.slot.cleanup=effect.slot.fn(); } }
  unmount() { this.mounted=false;for(const slot of this.slots)slot.cleanup?.(); }
  replayEffects() { for(const slot of this.slots)if(slot.effect) {slot.cleanup?.();slot.cleanup=slot.fn();} }
}
function slot() { const index=rendering.index++;return rendering.slots[index]??(rendering.slots[index]={}); }
const isCurrentToken=(token:string|null)=>token===state.activeToken;
const expireSession=async(token:string)=>{state.expired.push(token);};
const tick=async()=>{await new Promise<void>(resolve=>setImmediate(resolve));};
const listeners=(kind:string)=>state.listeners[kind] as Set<(value:Row)=>void>;
function listen(kind:string,callback:(value:Row)=>void) {listeners(kind).add(callback);return {remove(){listeners(kind).delete(callback);}};}
function permission(status="granted",granted=true) {return {status,granted,canAskAgain:true};}
const nativeModule:Row={
  AndroidImportance:{HIGH:4},IosAuthorizationStatus:{PROVISIONAL:3,EPHEMERAL:4},
  setNotificationHandler(){},
  async setNotificationChannelAsync(name:string){state.channels.push(name);},
  async getPermissionsAsync(){return state.permission;},
  async requestPermissionsAsync(){state.prompts+=1;state.permission=state.afterPrompt;return state.permission;},
  getExpoPushTokenAsync(options:Row){
    state.expoRequests.push(options);
    if(state.expoError)return Promise.reject(state.expoError);
    if(state.holdExpo)return new Promise(resolve=>{state.expoResolvers.push(()=>resolve({data:state.expoToken}));});
    return Promise.resolve({data:state.expoToken});
  },
  addNotificationReceivedListener:(fn:(value:Row)=>void)=>listen("received",fn),
  addNotificationResponseReceivedListener:(fn:(value:Row)=>void)=>listen("response",fn),
  addPushTokenListener:(fn:(value:Row)=>void)=>listen("rollover",fn),
  clearLastNotificationResponse(){state.cleared+=1;},
  getLastNotificationResponseAsync(){if(state.holdLast)return new Promise(resolve=>state.lastResolvers.push(resolve));return Promise.resolve(state.lastResponse);},
};
const harness:Row={
  Constants:{easConfig:{projectId:"public-project-id"}},Notifications:nativeModule,NativeNotifications:nativeModule,
  Platform:{get OS(){return state.platform;}},ApiError,
  AppState:{currentState:"active",addEventListener:(_event:string,fn:(value:Row)=>void)=>listen("app",fn)},
  Linking:{async openSettings(){state.settingsOpened+=1;}},router:{push:(path:string)=>state.routes.push(path)},
  useSession:()=>({expireSession}),
  createContext:()=>({Provider:"context"}),useContext:()=>null,
  useRef:(initial:unknown)=>{const cell=slot();if(!cell.ref)cell.ref={current:initial};return cell.ref;},
  useState:(initial:unknown)=>{const cell=slot();if(!cell.state){cell.state={value:initial};cell.setter=(next:unknown)=>{cell.state.value=typeof next==="function"?next(cell.state.value):next;};}return [cell.state.value,cell.setter];},
  useCallback:(fn:unknown,deps:unknown[])=>{const cell=slot();if(!same(cell.deps,deps)){cell.deps=deps;cell.value=fn;}return cell.value;},
  useMemo:(fn:()=>unknown,deps:unknown[])=>{const cell=slot();if(!same(cell.deps,deps)){cell.deps=deps;cell.value=fn();}return cell.value;},
  useEffect:(fn:()=>unknown,deps:unknown[])=>{const cell=slot();cell.effect=true;if(!same(cell.deps,deps)){cell.deps=deps;cell.fn=fn;rendering.effects.push({slot:cell});}},
  useLayoutEffect:()=>{},React:{createElement:(_type:unknown,props:Row)=>({props})},
  apiRequest(path:string,options:Row){
    state.requests.push({path,...options});
    if(path==="/notifications?page=1") {
      if(state.holdCount)return new Promise((resolve,reject)=>state.countResolvers.push({resolve,reject}));
      return Promise.resolve({unreadCount:state.unread});
    }
    if(path==="/notifications/read-document") {
      const id=options.body.documentId;
      if(state.holdDocuments.has(id))return new Promise((resolve,reject)=>state.documentResolvers.set(id,{resolve,reject}));
      if(state.documentErrors.has(id))return Promise.reject(state.documentErrors.get(id));
      return Promise.resolve({ok:true,unreadCount:state.unread,updatedCount:1});
    }
    if(path==="/push-subscription") {
      if(!options.method&&state.failPushGet){state.failPushGet=false;return Promise.reject(new ApiError("설정 조회 실패",503));}
      if(options.method==="DELETE"&&state.failPushDelete){state.failPushDelete=false;return Promise.reject(new ApiError("설정 해제 실패",503));}
      if(options.method==="POST"){state.enabled=true;return Promise.resolve({enabled:true});}
      if(options.method==="DELETE"){state.enabled=false;return Promise.resolve({enabled:false});}
      return Promise.resolve({enabled:state.enabled});
    }
    return Promise.reject(new Error("Unexpected API path"));
  },
};
(globalThis as Row)[key]=harness;
function compile(source:string,jsx=false) {return ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:jsx?ts.JsxEmit.React:undefined}}).outputText;}
let pushSource=readFileSync(new URL("../mobile/src/lib/push.ts",import.meta.url),"utf8");
pushSource=pushSource.replace(/^import[\s\S]*?from "react-native";\n/,`const {Constants,Notifications,Platform}=globalThis.${key};\n`);
const push=await import(`data:text/javascript;base64,${Buffer.from(compile(pushSource)).toString("base64")}`);
harness.PushPermissionError=push.PushPermissionError;harness.notificationDocumentId=push.notificationDocumentId;harness.validNotificationDocumentId=push.validNotificationDocumentId;
harness.getPushToken=(requestPermission:boolean,deviceToken:Row,isActive:()=>boolean)=>{state.tokenCalls.push({requestPermission,deviceToken});return push.getPushToken(requestPermission,deviceToken,isActive);};
let providerSource=readFileSync(new URL("../mobile/src/lib/notifications.tsx",import.meta.url),"utf8");
providerSource=providerSource.replace(/^import[\s\S]*?from "\.\/session";\n/,`const {router,NativeNotifications,createContext,useCallback,useContext,useEffect,useLayoutEffect,useMemo,useRef,useState,AppState,Linking,Platform,apiRequest,ApiError,getPushToken,notificationDocumentId,PushPermissionError,validNotificationDocumentId,useSession,React}=globalThis.${key};\n`)+"\nexport {AccountNotificationsProvider};\n";
const native=await import(`data:text/javascript;base64,${Buffer.from(compile(providerSource,true)).toString("base64")}`);
let scopes:Hooks[]=[];
beforeEach(()=>{
  for(const scope of scopes)scope.unmount();scopes=[];
  Object.assign(state,{activeToken:"account-a",platform:"android",permission:permission(),afterPrompt:permission(),prompts:0,channels:[],expoRequests:[],expoError:null,holdExpo:false,expoResolvers:[],expoToken:"ExpoPushToken[abcdefghijk]",tokenCalls:[],settingsOpened:0,
    listeners:{app:new Set(),received:new Set(),response:new Set(),rollover:new Set()},lastResponse:null,holdLast:false,lastResolvers:[],cleared:0,routes:[],expired:[],requests:[],unread:8,holdCount:false,countResolvers:[],enabled:true,
    holdDocuments:new Set(),documentResolvers:new Map(),documentErrors:new Map(),failPushGet:false,failPushDelete:false});
});
after(()=>{for(const scope of scopes)scope.unmount();delete(globalThis as Row)[key];});
async function mount(){const scope=new Hooks();scopes.push(scope);scope.render();scope.flush();await tick();scope.render();return scope;}
const emit=(kind:string,value:Row)=>{for(const callback of [...listeners(kind)])callback(value);};
const response=(documentId:string,id=documentId)=>({actionIdentifier:"default",notification:{request:{identifier:id,content:{data:{documentId}}}}});
const countRequests=()=>state.requests.filter((row:Row)=>row.path==="/notifications?page=1");
const posts=()=>state.requests.filter((row:Row)=>row.path==="/push-subscription"&&row.method==="POST");

test("push helper never prompts in background or after a denial, but allows one explicit first-time prompt",async()=>{
  state.permission=permission("undetermined",false);
  assert.equal(await push.getPushToken(false),null);assert.equal(state.prompts,0);
  assert.equal(await push.getPushToken(true),state.expoToken);assert.equal(state.prompts,1);
  state.permission=permission("denied",false);
  await assert.rejects(push.getPushToken(true),push.PushPermissionError);assert.equal(state.prompts,1);
});
test("iOS provisional permission and rollover device token are accepted without another permission or device-token lookup",async()=>{
  state.platform="ios";state.permission={...permission("denied",false),ios:{status:3}};
  const device={type:"ios",data:"new-native-token"};
  assert.equal(await push.getPushToken(false,device),state.expoToken);
  assert.deepEqual(state.expoRequests[0].devicePushToken,device);assert.equal(state.prompts,0);assert.equal(state.channels.length,0);
});
test("account change between native permission awaits prevents a prompt or Expo request",async()=>{
  state.permission=permission("undetermined",false);let checks=0;
  await assert.rejects(push.getPushToken(true,undefined,()=>++checks<3),(error:Error)=>error.name==="AbortError");
  assert.equal(state.prompts,0);assert.equal(state.expoRequests.length,0);
});
test("notification payloads accept only bounded document IDs and badges cap at 99+",()=>{
  for(const value of ["../secret","id?x=1","","x".repeat(101),23])assert.equal(push.notificationDocumentId(response(value as string)),null);
  assert.equal(push.notificationDocumentId(response("cuid_abc-12")),"cuid_abc-12");
  assert.equal(native.notificationBadge(null),undefined);assert.equal(native.notificationBadge(0),undefined);assert.equal(native.notificationBadge(99),99);assert.equal(native.notificationBadge(100),"99+");
});
test("unread count starts unknown, summary loads once and public callbacks stay stable across count updates",async()=>{
  state.holdCount=true;const scope=await mount();const first=scope.value;
  assert.equal(first.unreadCount,null);assert.equal(first.notificationRevision,0);
  state.countResolvers[0].resolve({unreadCount:125});await tick();scope.render();
  assert.equal(scope.value.unreadCount,125);assert.equal(scope.value.refreshUnreadCount,first.refreshUnreadCount);
  assert.equal(scope.value.setUnreadCount,first.setUnreadCount);assert.equal(scope.value.openNotificationDocument,first.openNotificationDocument);
  assert.equal(scope.value.notificationRevision,0);assert.equal(countRequests().length,1);
});
test("foreground and received events refresh summary and revision without ordinary refresh revision loops",async()=>{
  const scope=await mount();const initial=countRequests().length;
  emit("app","background" as unknown as Row);emit("app","active" as unknown as Row);await tick();scope.render();
  assert.equal(scope.value.notificationRevision,1);assert.ok(countRequests().length>initial);
  emit("received",{});await tick();scope.render();assert.equal(scope.value.notificationRevision,2);
  await scope.value.refreshUnreadCount();scope.render();assert.equal(scope.value.notificationRevision,2);
  assert.ok(state.tokenCalls.every((row:Row)=>row.requestPermission===false));
});
test("coalesced summary cannot overwrite a later read count and the queued refresh fetches current server count",async()=>{
  const scope=await mount();state.holdCount=true;
  const pending=scope.value.refreshUnreadCount();scope.value.refreshUnreadCount();scope.value.setUnreadCount(0);
  assert.equal(state.countResolvers.length,1);state.countResolvers[0].resolve({unreadCount:8});await pending;await tick();scope.render();
  assert.equal(scope.value.unreadCount,0);assert.equal(state.countResolvers.length,2);
  state.countResolvers[1].resolve({unreadCount:0});await tick();scope.render();assert.equal(scope.value.unreadCount,0);
});
test("document opens only after authenticated permission/read success, and forbidden IDs never route",async()=>{
  const scope=await mount();state.holdDocuments.add("doc-a");const pending=scope.value.openNotificationDocument("doc-a");
  assert.equal(state.routes.length,0);const read=state.requests.at(-1);assert.equal(read.path,"/notifications/read-document");assert.equal(read.token,"account-a");
  state.unread=3;state.documentResolvers.get("doc-a").resolve({ok:true,unreadCount:3});await pending;await tick();scope.render();
  assert.deepEqual(state.routes,["/documents/doc-a"]);assert.equal(scope.value.unreadCount,3);assert.equal(scope.value.notificationRevision,1);
  state.documentErrors.set("hidden",new ApiError("문서를 찾을 수 없습니다.",404));await assert.rejects(scope.value.openNotificationDocument("hidden"),ApiError);assert.equal(state.routes.length,1);
  const total=state.requests.length;await assert.rejects(scope.value.openNotificationDocument("../private"),ApiError);assert.equal(state.requests.length,total);
});
test("cold-start and live duplicate push responses share one permission/read and one navigation",async()=>{
  const event=response("doc-a","notification-1");state.lastResponse=event;const scope=await mount();
  emit("response",event);await tick();scope.render();
  assert.equal(state.requests.filter((row:Row)=>row.path==="/notifications/read-document").length,1);
  assert.deepEqual(state.routes,["/documents/doc-a"]);assert.equal(scope.value.notificationOpenError,null);
});
test("late push A failure cannot replace successful push B with an old error or retry document",async()=>{
  const scope=await mount();state.holdDocuments.add("doc-a");emit("response",response("doc-a"));
  emit("response",response("doc-b"));await tick();
  state.documentResolvers.get("doc-a").reject(new ApiError("옛 A 실패",404));await tick();scope.render();
  assert.deepEqual(state.routes,["/documents/doc-b"]);assert.equal(scope.value.notificationOpenError,null);
  const total=state.requests.length;await scope.value.retryNotificationOpen();assert.equal(state.requests.length,total);
});
test("push failure becomes visible and explicit retry rechecks document permission before routing",async()=>{
  const scope=await mount();state.documentErrors.set("doc-a",new ApiError("열 수 없는 문서",404));
  emit("response",response("doc-a"));await tick();scope.render();assert.equal(scope.value.notificationOpenError,"열 수 없는 문서");assert.equal(state.routes.length,0);
  state.documentErrors.delete("doc-a");await scope.value.retryNotificationOpen();scope.render();assert.equal(scope.value.notificationOpenError,null);assert.deepEqual(state.routes,["/documents/doc-a"]);
});
test("automatic registration failure is visible and an OFF status query retry keeps notifications OFF",async()=>{
  state.enabled=false;const scope=await mount();state.failPushGet=true;
  await scope.value.refreshPushStatus();scope.render();assert.equal(scope.value.pushError,"설정 조회 실패");
  await scope.value.retryPushRegistration();scope.render();assert.equal(scope.value.pushStatus.enabled,false);assert.equal(posts().length,0);assert.equal(state.tokenCalls.length,0);
});
test("failed disable preserves OFF intent on foreground and retries DELETE, without automatically re-registering",async()=>{
  const scope=await mount();const initialPosts=posts().length;const initialTokens=state.tokenCalls.length;state.failPushDelete=true;
  await scope.value.disablePush();scope.render();assert.equal(scope.value.pushError,"설정 해제 실패");
  await scope.value.refreshPushStatus();scope.render();assert.equal(scope.value.pushError,"설정 해제 실패");assert.equal(posts().length,initialPosts);assert.equal(state.tokenCalls.length,initialTokens);
  await scope.value.retryPushRegistration();scope.render();assert.equal(scope.value.pushStatus.enabled,false);assert.equal(state.enabled,false);assert.equal(scope.value.pushError,null);
});
test("permission denial preserves enabled intent and opens settings only after a user action",async()=>{
  state.permission=permission("denied",false);const scope=await mount();
  assert.equal(scope.value.pushNeedsSettings,true);assert.equal(scope.value.pushStatus.enabled,true);assert.ok(scope.value.pushError);assert.equal(state.prompts,0);assert.equal(state.settingsOpened,0);assert.equal(posts().length,0);
  await scope.value.openPushSettings();assert.equal(state.settingsOpened,1);state.permission=permission();
  emit("app","background" as unknown as Row);emit("app","active" as unknown as Row);await tick();scope.render();
  assert.equal(scope.value.pushNeedsSettings,false);assert.equal(scope.value.pushError,null);assert.equal(posts().length,1);assert.equal(state.prompts,0);
});
test("registration is coalesced and rollover passes the native token while duplicate events do not POST twice",async()=>{
  const scope=await mount();const initialPosts=posts().length;const device={type:"android",data:"rollover-native"};
  emit("rollover",device);emit("rollover",device);await tick();scope.render();
  assert.deepEqual(state.expoRequests.at(-1).devicePushToken,device);assert.equal(posts().length,initialPosts);
  state.holdExpo=true;const pending=scope.value.enablePush();const duplicate=scope.value.enablePush();assert.equal(pending,duplicate);await tick();
  state.expoResolvers[0]();await pending;assert.equal(posts().length,initialPosts+1);
});
test("token change blocks old navigation, unread results, registration and token rollover callbacks",async()=>{
  const scope=await mount();state.holdDocuments.add("doc-a");const read=scope.value.openNotificationDocument("doc-a");const readFailure=assert.rejects(read,(error:Error)=>error.name==="AbortError");
  state.holdCount=true;const count=scope.value.refreshUnreadCount();const countFailure=assert.rejects(count,(error:Error)=>error.name==="AbortError");
  state.holdExpo=true;const registering=scope.value.enablePush();await tick();const rollover=[...listeners("rollover")][0];const received=[...listeners("received")][0];const initialPosts=posts().length;
  state.activeToken="account-b";received({});rollover({type:"android",data:"old-late-token"});
  state.documentResolvers.get("doc-a").resolve({ok:true,unreadCount:0});state.countResolvers[0].resolve({unreadCount:99});state.expoResolvers[0]();
  await Promise.all([readFailure,countFailure,registering]);scope.render();
  assert.equal(state.routes.length,0);assert.equal(scope.value.unreadCount,8);assert.equal(posts().length,initialPosts);assert.equal(state.expired.length,0);
});
test("StrictMode effect cleanup/restart fences prior requests and leaves exactly one subscription of each kind",async()=>{
  state.holdCount=true;state.holdLast=true;const scope=await mount();const oldCount=state.countResolvers[0];const oldResponse=[...listeners("response")][0];
  scope.replayEffects();await tick();assert.equal(listeners("response").size,1);assert.equal(listeners("received").size,1);assert.equal(listeners("rollover").size,1);assert.equal(listeners("app").size,1);
  oldCount.resolve({unreadCount:99});state.lastResolvers[0](response("old-doc"));oldResponse(response("old-doc"));await tick();scope.render();
  assert.equal(scope.value.unreadCount,null);assert.equal(state.routes.length,0);
  state.countResolvers[1].resolve({unreadCount:2});state.lastResolvers[1](null);await tick();scope.render();assert.equal(scope.value.unreadCount,2);
});
