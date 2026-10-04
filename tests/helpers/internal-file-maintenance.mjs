import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript');
export const settle=async()=>{for(let i=0;i<70;i++)await Promise.resolve();};
export function maintenanceHarness(){
 const h={clock:0,imports:[],calls:[],behaviors:{},results:{resource:{checked:10,completed:3},youthExpiry:{checked:3,expired:3},youthQueue:{checked:5,completed:0},approvedPurge:{checked:2,completed:0,pending:2}}};
 const cache=new Map(),timers=new Map();let id=0;
 const names={'@/lib/resource-file-cleanup':{reconcileResourceLibraryMaintenance:'resource'},'@/lib/youth-decision-file-cleanup':{reconcileYouthDecisionUploadExpiry:'youthExpiry',reconcileYouthDecisionFileQueue:'youthQueue'},'@/lib/youth-purge':{reconcileYouthPurgeMaintenance:'approvedPurge'}};
 const call=lane=>async(context,options)=>{const value={lane,context,options};h.calls.push(value);return h.behaviors[lane]?h.behaviors[lane](value):h.results[lane];};
 function load(name){if(cache.has(name))return cache.get(name);h.imports.push(name);if(names[name]){const port=Object.fromEntries(Object.entries(names[name]).map(([key,lane])=>[key,call(lane)]));cache.set(name,port);return port;}if(name==='node:crypto')return require(name);assert(name==='route'||name==='@/lib/internal-file-maintenance','unexpected import '+name);const file=name==='route'?'src/app/api/internal/resource-maintenance/route.ts':'src/lib/internal-file-maintenance.ts';const input=readFileSync(new URL('../../'+file,import.meta.url),'utf8'),output=ts.transpileModule(input,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,evaluated={exports:{}};cache.set(name,evaluated.exports);new Function('require','module','exports','Date','setTimeout','clearTimeout',output)(load,evaluated,evaluated.exports,{now:()=>h.clock},(fn,ms)=>{const key=++id;timers.set(key,{at:h.clock+ms,fn});return key;},key=>timers.delete(key));return evaluated.exports;}
 const route=load('route');h.imports=[];
 return{h,route,timers,engine(){return load('@/lib/internal-file-maintenance');},async advance(ms){h.clock+=ms;for(const[key,value]of[...timers])if(value.at<=h.clock){timers.delete(key);value.fn();}await settle();}};
}
