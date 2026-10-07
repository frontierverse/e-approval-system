import { readFileSync } from 'node:fs';
import ts from 'typescript';
// Actual production modules execute with lexical transport/OS boundaries. No
// Node globals are replaced, including in the full --test-isolation=none run.
export function loadChatFileModule(relative, dependencies, boundary = {}) {
  const source = readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const cjsModule = { exports: {} };
  let updateSafety;
  const require = path => { if (path === './app-update-safety') return updateSafety ??= loadChatFileModule('mobile/src/lib/app-update-safety.ts', {}); if (!(path in dependencies)) throw new Error(`Missing lexical dependency: ${path}`); return dependencies[path]; };
  const names = Object.keys(boundary);
  new Function('require', 'exports', 'module', ...names, output)(require, cjsModule.exports, cjsModule, ...names.map(name => boundary[name]));
  return cjsModule.exports;
}
export const ApiError = loadChatFileModule('mobile/src/lib/api.ts', {}).ApiError;
export function loadChatFileCore(boundary = {}) {
  const api = { ApiError, apiUrl: path => `https://synthetic.example/api/mobile${path}` };
  const attachment = loadChatFileModule('mobile/src/lib/attachment-file.ts', {});
  const chat = loadChatFileModule('mobile/src/lib/chat.ts', { '@/lib/api': api, './api': api, '@/lib/drafts': { requestKey: () => 'synthetic-request' }, './drafts': { requestKey: () => 'synthetic-request' } });
  const core = loadChatFileModule('mobile/src/lib/chat-file-core.ts', { './api': api, './attachment-file': attachment, './chat': chat }, boundary);
  return { api, attachment, chat, core };
}
export const filePolicy = { maxFileSize: 4194304, zipMaxFileSize: 104857600, uploadChunkSize: 4194304, maxFileCount: 1, allowedExtensions: ['.pdf','.png','.zip'] };
export const attachment = { id: 'file-1', originalName: '합성.pdf', size: 12, status: 'available' };
export function message(file = attachment, overrides = {}) { return { id: 'message-1', sequence: '90071992547409930', senderId: 'sender', recipientId: 'recipient', body: `파일: ${file.originalName}`, createdAt: '2026-10-03T01:00:00.000Z', readAt: null, attachment: file, ...overrides }; }
export function response(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } }); }
export const tick = () => new Promise(resolve => setImmediate(resolve));
