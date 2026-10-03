import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { loadChatFileModule } from './mobile-chat-file.mjs';
const api = loadChatFileModule('mobile/src/lib/api.ts', {});
const attachment = loadChatFileModule('mobile/src/lib/attachment-file.ts', {});
const resources = loadChatFileModule('mobile/src/lib/resources.ts', { './api': api });
const request = loadChatFileModule('mobile/src/lib/resource-request.ts', { './api': api });
const core = loadChatFileModule('mobile/src/lib/resource-file-core.ts', { './api': api, './attachment-file': attachment, './resources': resources, './resource-request': request });
export const ApiError = api.ApiError;
export const policy = { maxFileCount: 1, maxFileSizeMb: 300, allowedExtensions: ['.pdf','.png'] };
export const file = { id: 'synthetic-file', name: '표시 파일.pdf', mimeType: 'application/pdf', size: 12, previewKind: 'pdf' };
export function call() {
  const controller = new AbortController(), listeners = new Set(), progress = [];
  let account = true;
  return { token: 'synthetic-token', signal: controller.signal, progress,
    check() { if (!account || controller.signal.aborted) throw request.resourceAbort(); },
    onProgress(value) { this.check(); progress.push(value); },
    onCancel(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    cancel() { controller.abort(); for (const fn of listeners) fn(); },
    invalidate() { account = false; },
  };
}
export function nativeHarness() {
  const records = new Map(), directories = new Set(['file:///cache','file:///cache/DocumentPicker']);
  const requests = [], events = [], reads = [], wrapped = [], hashes = [];
  let os = 'android', disk = 1024*1024*1024, opaque = 0, status = 200, truncate = false;
  let bytes = new TextEncoder().encode('%PDF-1.7\nabc'), selectedSize = bytes.length;
  let picker = async () => ({ canceled:false,assets:[{uri:'file:///cache/DocumentPicker/selected',name:'자료.pdf',size:selectedSize,mimeType:'application/pdf'}] });
  let share = async () => {}, chooseDirectory;
  const join = values => values.map((value,index) => { const uri=typeof value==='string'?value:value.uri; return index===0?uri.replace(/\/$/,''):uri.replace(/^\/+|\/+$/g,''); }).join('/');
  class Directory {
    constructor(...parts) { this.uri = join(parts); }
    get exists() { return directories.has(this.uri); }
    create() { directories.add(this.uri); }
    delete() { events.push(['rmdir',this.uri]); directories.delete(this.uri); for (const key of [...records.keys()]) if (key.startsWith(this.uri+'/')) records.delete(key); }
    info() { return {files:[...records.values()].filter(record=>record.parent===this.uri).map(record=>record.name)}; }
    createFile(name) { const uri=`content://synthetic/document/opaque-${++opaque}`; records.set(uri,{bytes:new Uint8Array(),size:0,parent:this.uri,name});events.push(['external',name,uri]);return new File(uri); }
    static pickDirectoryAsync() { return chooseDirectory(); }
  }
  class File {
    constructor(...parts) { this.uri=join(parts); }
    get exists() { return records.has(this.uri); }
    get size() { return records.get(this.uri)?.size ?? 0; }
    delete() { events.push(['unlink',this.uri]);records.delete(this.uri); }
    move(target) { const record=records.get(this.uri);assert.ok(record);records.set(target.uri,record);records.delete(this.uri);events.push(['move',this.uri,target.uri]); }
    arrayBuffer() { throw Error('Whole native bytes forbidden'); }
    bytesSync() { throw Error('Whole native bytes forbidden'); }
    open(mode) {
      assert.ok(this.exists,'Physical native file must exist');const record=records.get(this.uri),uri=this.uri;let offset=0,closed=false;
      assert.ok(['r','w'].includes(mode));
      return { readBytes(length) { assert.equal(closed,false);reads.push(length);const value=record.bytes.slice(offset,offset+length);offset+=value.length;return value; },writeBytes(value) { assert.equal(closed,false);const count=truncate&&uri.startsWith('content:')?Math.max(0,value.length-1):value.length;const merged=new Uint8Array(offset+count);merged.set(record.bytes.subarray(0,offset));merged.set(value.subarray(0,count),offset);record.bytes=merged;offset+=count;record.size=offset; }, close(){closed=true;} };
    }
  }
  const folder=new Directory('content://synthetic/tree');folder.create();chooseDirectory=async()=>folder;
  const select = (size=bytes.length, uri='file:///cache/DocumentPicker/selected') => { selectedSize=size;records.set(uri,{bytes,size});picker=async()=>({canceled:false,assets:[{uri,name:'자료.pdf',size,mimeType:'application/pdf'}]}); };
  select();
  let transport = async req => { if (req.config.path) records.set(`file://${req.config.path}`,{bytes,size:bytes.length});return {status,headers:{'Content-Type':'application/pdf','Content-Length':String(bytes.length),'Content-Disposition':"attachment; filename*=UTF-8''actual.pdf"}}; };
  const blob={wrap(path){const record=records.get(`file://${path}`);assert.ok(record);wrapped.push({path,size:record.size});return `wrapped:${path}`;},fs:{async hash(path,algorithm){assert.equal(algorithm,'sha256');const record=records.get(`file://${path}`);hashes.push({path,size:record.size});return record.size>record.bytes.length?'a'.repeat(64):createHash('sha256').update(record.bytes).digest('hex');}},config(config){return{fetch(method,url,headers,body){const req={config,method,url,headers,body};requests.push(req);const promise=Promise.resolve().then(()=>transport(req)).then(value=>({info:()=>value,json:async()=>({error:'합성 실패'})}));promise.progress=()=>promise;promise.uploadProgress=()=>promise;promise.cancel=()=>events.push(['cancel']);return promise;}};}};
  let adapter;
  loadChatFileModule('mobile/src/lib/resource-file-transfer.native.ts',{
    'expo-document-picker':{getDocumentAsync:options=>{assert.equal(options.base64,false);assert.equal(options.copyToCacheDirectory,true);return picker();}},
    'expo-file-system':{Directory,File,FileMode:{ReadOnly:'r',WriteOnly:'w'},Paths:{cache:{uri:'file:///cache'},get availableDiskSpace(){return disk;}}},
    'expo-sharing':{isAvailableAsync:async()=>true,shareAsync:(uri,options)=>{assert.match(uri,/^file:\/\/\/cache\/resource-file-transfers\//);return share(uri,options);}},
    'react-native':{Platform:{get OS(){return os;}}},'react-native-blob-util':blob,
    './api':{...api,apiUrl:path=>`https://synthetic.example/api/mobile${path}`},'./attachment-file':attachment,'./resources':resources,'./resource-file-core':{...core,createResourceFileApi(value){adapter=value;return{};}},
  });
  return {adapter,records,requests,events,reads,wrapped,hashes,folder,select,File,
    setOS(value){os=value;},setDisk(value){disk=value;},setStatus(value){status=value;},setTruncate(value){truncate=value;},setShare(fn){share=fn;},setDirectory(fn){chooseDirectory=fn;},setTransport(fn){transport=fn;},setPicker(fn){picker=fn;},
  };
}
export function webHarness(sha256) {
  let adapter,fetcher=async()=>new Response(new TextEncoder().encode('%PDF-1.7\nabc'),{headers:{'Content-Type':'application/pdf','Content-Length':'12','Content-Disposition':'attachment; filename=actual.pdf'}});
  const calls=[],urls=[],revoked=[],timers=new Map(),elements=[];let selected=null, timer=0;
  const document={body:{appendChild(){}},createElement(tag){const listeners={};const value={tag,style:{},files:selected?[selected]:[],addEventListener(name,fn){listeners[name]=fn;},removeEventListener(name){delete listeners[name];},remove(){value.removed=true;},click(){value.clicked=true;if(tag==='input')listeners.change?.();}};elements.push(value);return value;}};
  loadChatFileModule('mobile/src/lib/resource-file-transfer.web.ts',{'@noble/hashes/sha2.js':{sha256},'./api':{...api,apiUrl:path=>`https://synthetic.example/api/mobile${path}`},'./attachment-file':attachment,'./resources':resources,'./resource-file-core':{...core,createResourceFileApi(value){adapter=value;return{};}}},{document,URL:{createObjectURL(){const value=`blob:synthetic-${urls.length}`;urls.push(value);return value;},revokeObjectURL(value){revoked.push(value);}},fetch:async(url,init)=>{calls.push({url,init});return fetcher(url,init);},setTimeout(fn,delay){if(delay===0){queueMicrotask(fn);return 0;}const id=++timer;timers.set(id,{fn,delay});return id;},clearTimeout(id){timers.delete(id);}});
  return {adapter,calls,urls,revoked,timers,elements,setSelected(value){selected=value;},setFetch(fn){fetcher=fn;}};
}
