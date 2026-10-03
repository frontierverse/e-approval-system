import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { attachment, filePolicy, loadChatFileCore, loadChatFileModule, message, response } from './mobile-chat-file.mjs';
export function nativeChatFileHarness() {
  const records = new Map(), dirs = new Set(['file:///cache','file:///cache/DocumentPicker']);
  const events = [], requests = [], reads = [], wrapped = [], hashes = [], timers = new Map();
  let timerId = 0, opaqueId = 0, foreground = true, actorCurrent = true, os = 'android';
  let binary = new TextEncoder().encode('%PDF-1.7\nabc'), downloadStatus = 200, externalTruncate = false;
  let pickerHandler, shareHandler = async () => {}, directoryHandler;
  let requestHandler = async url => url.endsWith('/status') ? response({ match: true, status: 'downloading' }) : response({ message: message({ ...attachment, status: 'deleted' }) });
  const join = parts => parts.map((p,index) => {const value=typeof p==='string'?p:p.uri;return index===0?value.replace(/\/$/,''):value.replace(/^\/+|\/+$/g,'');}).join('/');
  class Directory {
    constructor(...parts) { this.uri = join(parts); }
    get name() { return this.uri.split('/').at(-1); }
    get exists() { return dirs.has(this.uri); }
    create() { dirs.add(this.uri); events.push(['mkdir',this.uri]); }
    delete() { events.push(['rmdir',this.uri]); for (const path of [...records.keys()]) if (path.startsWith(this.uri+'/')) records.delete(path); for (const path of [...dirs]) if (path===this.uri || path.startsWith(this.uri+'/')) dirs.delete(path); }
    list() { return [...dirs].filter(p => p.startsWith(this.uri+'/') && !p.slice(this.uri.length+1).includes('/')).map(p => new Directory(p)); }
    info() { return { files: [...records.values()].filter(r => r.parent===this.uri).map(r => r.name) }; }
    createFile(name) { const uri = `content://qa/document/opaque-${++opaqueId}`; const file = new File(uri); records.set(uri,{ bytes: new Uint8Array(), size:0, parent:this.uri, name }); events.push(['external-create',name,uri]); return file; }
    static pickDirectoryAsync() { return directoryHandler(); }
  }
  class File {
    constructor(...parts) { this.uri = join(parts); }
    get exists() { return records.has(this.uri); }
    get size() { return records.get(this.uri)?.size ?? 0; }
    create() { assert.equal(this.exists,false); records.set(this.uri,{ bytes:new Uint8Array(),size:0 }); events.push(['create',this.uri]); }
    delete() { events.push(['unlink',this.uri]); records.delete(this.uri); }
    move(target) { assert.ok(this.exists); records.set(target.uri,records.get(this.uri)); records.delete(this.uri); events.push(['move',this.uri,target.uri]); }
    slice() { throw new Error('Whole-file native slice forbidden'); }
    bytesSync() { throw new Error('Whole-file native read forbidden'); }
    arrayBuffer() { throw new Error('Whole-file native read forbidden'); }
    open(mode) {
      // The installed iOS FileHandle cannot create a missing file when opening
      // it for writing. Keep that stricter behavior for both synthetic modes.
      if (!this.exists) throw new Error('iOS file handle requires a physical file');
      const uri=this.uri, record=records.get(uri); let offset=0, closed=false;
      if (mode==='write') { record.bytes=new Uint8Array();record.size=0; }
      return {
        get offset() { return offset; }, set offset(value) { offset=value; },
        readBytes(length) { assert.equal(closed,false); reads.push(length); const bytes=record.bytes.slice(offset,Math.min(offset+length,record.size));offset+=bytes.length;return bytes; },
        writeBytes(bytes) { assert.equal(closed,false); const length=externalTruncate && uri.startsWith('content:') ? Math.max(0,bytes.length-1) : bytes.length; const needed=offset+length; if (needed>record.bytes.length) { const capacity=Math.max(needed,record.bytes.length*2,65536);const buffer=new Uint8Array(capacity);buffer.set(record.bytes);record.bytes=buffer; } record.bytes.set(bytes.subarray(0,length),offset);offset+=length;record.size=Math.max(record.size,offset); },
        close() { closed=true;events.push(['close',uri,mode]); },
      };
    }
  }
  const folder=new Directory('content://qa/tree');folder.create();
  directoryHandler=async () => folder;
  function select(name='합성.pdf',bytes=binary) { const uri='file:///cache/DocumentPicker/chosen';records.set(uri,{bytes:bytes.slice(),size:bytes.length});pickerHandler=async () => ({canceled:false,assets:[{uri,name,size:bytes.length,mimeType:name.endsWith('.zip')?'application/zip':'application/pdf'}]}); }
  select();
  const fetch = async (url,init) => { requests.push({url,init,transport:'json'}); return requestHandler(url,init); };
  const coreModules=loadChatFileCore({ fetch, setTimeout(callback,delay) { const id=++timerId;timers.set(id,{callback,delay});return id; },clearTimeout(id) {timers.delete(id);} });
  let nativeHandler=async request => {
    if (request.config.path) { const uri=`file://${request.config.path}`; records.set(uri,{bytes:binary.slice(),size:binary.length});return {status:downloadStatus,headers:{'Content-Type':'application/pdf','Content-Disposition':"attachment; filename*=UTF-8''%ED%95%A9%EC%84%B1.pdf",...(request.url.endsWith('/preview') || request.headers.Authorization==='Bearer sender-session' ? {} : {'X-Chat-Download-Token':'receipt-token-123'})},data:{error:'synthetic failure'}}; }
    if (request.method==='PUT') return {status:200,headers:{},data:{ok:true}};
    return {status:200,headers:{},data:{message:message()}};
  };
  const blob={
    wrap(path) { const record=records.get(`file://${path}`);assert.ok(record);assert.ok(record.size<=4194304);wrapped.push({path,size:record.size});return `wrapped:${path}`; },
    fs:{async hash(path,algorithm) { assert.equal(algorithm,'sha256');const record=records.get(`file://${path}`);assert.ok(record && record.size<=4194304);hashes.push({path,size:record.size});return createHash('sha256').update(record.bytes.subarray(0,record.size)).digest('hex'); }},
    config(config) { return {fetch(method,url,headers,body) {
      const request={config,method,url,headers,body,transport:'native'};requests.push(request);let cancelled=false;
      const promise=Promise.resolve().then(() => nativeHandler(request)).then(value => ({info:()=>({status:value.status,headers:value.headers}),json:async()=>{events.push(['json',url]);return value.data;}}));
      promise.progress=()=>promise;promise.uploadProgress=()=>promise;promise.cancel=()=>{cancelled=true;events.push(['cancel',url]);};Object.defineProperty(promise,'cancelled',{get:()=>cancelled});return promise;
    }}; },
  };
  const native=loadChatFileModule('mobile/src/lib/chat-file-transfer.native.ts',{
    'expo-document-picker':{getDocumentAsync:options=>{assert.equal(options.base64,false);assert.equal(options.multiple,false);assert.equal(options.copyToCacheDirectory,true);return pickerHandler();}},
    'expo-file-system':{Directory,File,FileMode:{ReadOnly:'read',WriteOnly:'write'},Paths:{cache:{uri:'file:///cache'}}},
    'expo-sharing':{isAvailableAsync:async()=>true,shareAsync:(uri,options)=>{assert.match(uri,/^file:\/\/\/cache\/chat-file-transfers\//);return shareHandler(uri,options);}},
    'react-native':{Platform:{get OS(){return os;}}},'react-native-blob-util':blob,
    './api':coreModules.api,'./attachment-file':coreModules.attachment,'./chat-file-core':coreModules.core,
  });
  const transfer=(extra={})=>native.createChatFileTransfer({attachment,token:'synthetic-session',actorId:'recipient',peerId:'sender',messageId:'message-1',requestId:'request-original',isSender:false,isCurrent:()=>actorCurrent,...extra});
  return {native,records,dirs,events,requests,reads,wrapped,hashes,timers,folder,transfer,select,choose:()=>native.pickChatFile({policy:filePolicy,token:'synthetic-session',isCurrent:()=>actorCurrent}),setOS(value){os=value;},setForeground(value){foreground=value;},getForeground:()=>foreground,setActorCurrent(value){actorCurrent=value;},setShare(fn){shareHandler=fn;},setDirectory(fn){directoryHandler=fn;},setNativeHandler(fn){nativeHandler=fn;},setRequestHandler(fn){requestHandler=fn;},setBinary(bytes,status=200){binary=bytes;downloadStatus=status;},setExternalTruncate(value){externalTruncate=value;},setPicker(fn){pickerHandler=fn;},File,Directory};
}
