import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import * as generated from '../../src/generated/prisma/client.ts';

const nativeRequire = createRequire(import.meta.url);
// The real mobile domain and adapters run unchanged. The shared approval effect
// is an explicit port here; the separate PG suite runs its real SQL implementation.
export function createDraftServerHarness() {
  const h = { now: new Date('2026-10-04T03:00:00.000Z'), clock: null, session: 'actor-a', reads: [], writes: [], locks: [], transactions: [], cache: [], errors: [], storage: [], next: 0, globalDb: 0, forbidGlobal: false, auditFailure: false, commitErrors: [], timers: new Map(), timerId: 0 };
  const fields = {
    user: ['id', 'name', 'status', 'role', 'email', 'position'],
    documentTemplate: ['id', 'name', 'isActive', 'schema'],
    attachmentPolicy: ['id', 'maxFileCount', 'maxFileSizeMb', 'allowedExtensions'],
    approvalDocument: ['id', 'drafterId', 'title', 'category', 'content', 'templateId', 'status', 'updatedAt', 'createdAt'],
    approvalStep: ['id', 'documentId', 'approverId', 'order'],
    documentAttachment: ['id', 'documentId', 'originalName', 'mimeType', 'size', 'createdAt'],
    mobileDraftUpload: ['id', 'userId', 'documentId', 'originalName', 'mimeType', 'size', 'completedAt', 'expiresAt', 'storageProvider', 'storageKey'],
    auditLog: ['id', 'actorId', 'documentId', 'action', 'targetType', 'targetId', 'metadata', 'createdAt'],
  };
  const equal = (a, b) => a instanceof Date && b instanceof Date ? +a === +b : a === b;
  function match(row, where = {}) { return Object.entries(where).every(([key, value]) => {
    if (key === 'AND') return (Array.isArray(value) ? value : [value]).every(v => match(row, v));
    if (key === 'OR') return value.some(v => match(row, v));
    if (key === 'NOT') return !(Array.isArray(value) ? value : [value]).some(v => match(row, v));
    return scalar(row[key], value);
  }); }
  function scalar(actual, expected) {
    if (expected === null || expected instanceof Date || typeof expected !== 'object') return equal(actual, expected);
    if ('path' in expected) return scalar(expected.path.reduce((v, key) => v?.[key], actual), Object.fromEntries(Object.entries(expected).filter(([key]) => key !== 'path')));
    for (const [key, value] of Object.entries(expected)) {
      if (key === 'in') { if (!value.some(v => equal(actual, v))) return false; }
      else if (key === 'notIn') { if (value.some(v => equal(actual, v))) return false; }
      else if (key === 'not') { if (scalar(actual, value)) return false; }
      else if (key === 'equals') { if (!equal(actual, value)) return false; }
      else if (key === 'gt') { if (!(actual > value)) return false; }
      else if (key === 'lte') { if (!(actual <= value)) return false; }
      else return actual != null && match(actual, expected);
    } return true;
  }
  const relate = (model, row) => model !== 'approvalDocument' ? row : { ...row,
    template: h.documentTemplate.find(v => v.id === row.templateId),
    approvalSteps: h.approvalStep.filter(v => v.documentId === row.id),
    attachments: h.documentAttachment.filter(v => v.documentId === row.id),
    _count: { attachments: h.documentAttachment.filter(v => v.documentId === row.id).length },
  };
  function project(row, select) {
    if (!select) return structuredClone(row);
    return Object.fromEntries(Object.entries(select).filter(([, v]) => v).map(([key, value]) => [key, value === true ? structuredClone(row[key]) : Array.isArray(row[key]) ? row[key].map(v => project(v, value.select)) : row[key] == null ? null : project(row[key], value.select)]));
  }
  function rows(model, args = {}) {
    const result = h[model].map(v => relate(model, v)).filter(v => match(v, args.where));
    const orders = Array.isArray(args.orderBy) ? args.orderBy : [args.orderBy ?? {}];
    result.sort((a, b) => { for (const order of orders) for (const [key, dir] of Object.entries(order)) { const delta = a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0; if (delta) return dir === 'desc' ? -delta : delta; } return 0; });
    return result.slice(args.skip ?? 0, args.take == null ? undefined : (args.skip ?? 0) + args.take).map(v => project(v, args.select));
  }
  const check = (model, data) => Object.keys(data).forEach(key => assert.ok(fields[model].includes(key), model + ': unknown Prisma data ' + key));
  const db = { async $queryRaw(query) {
    assert.ok(!/^SELECT\s+pg_advisory_xact_lock/.test(query.sql), 'Prisma adapter cannot deserialize void projection');
    h.locks.push({ sql: query.sql, values: query.values }); return [];
  } };
  for (const model of Object.keys(fields)) db[model] = {
    async findMany(args = {}) { h.reads.push({ model, ...args }); return rows(model, args); },
    async findFirst(args = {}) { return (await this.findMany({ ...args, take: 1 }))[0] ?? null; },
    async findUnique(args) { return this.findFirst(args); },
    async findUniqueOrThrow(args) { const result = await this.findFirst(args); assert.ok(result, model + ' required'); return result; },
    async findFirstOrThrow(args) { return this.findUniqueOrThrow(args); },
    async count(args = {}) { return (await this.findMany(args)).length; },
    async create(args) { check(model, args.data); const value = { id: model + '-' + ++h.next, createdAt: new Date(h.now), updatedAt: new Date(h.now), ...structuredClone(args.data) }; h[model].push(value); h.writes.push({ model, operation: 'create', ...args }); return project(relate(model, value), args.select); },
    async update(args) { check(model, args.data); if (model === 'auditLog' && h.auditFailure) throw Error('Synthetic binding failure'); const row = h[model].find(v => match(relate(model, v), args.where)); assert.ok(row, model + ' updated row'); Object.assign(row, structuredClone(args.data)); h.writes.push({ model, operation: 'update', ...args }); return project(relate(model, row), args.select); },
    async updateMany(args) { check(model, args.data); const found = h[model].filter(v => match(relate(model, v), args.where)); found.forEach(v => Object.assign(v, structuredClone(args.data))); h.writes.push({ model, operation: 'updateMany', ...args }); return { count: found.length }; },
  };
  let queue = Promise.resolve();
  db.$transaction = (callback, options) => {
    const next = queue.then(async () => {
      h.transactions.push(options);
      const snapshot = structuredClone(Object.fromEntries(Object.keys(fields).map(model => [model, h[model]]))), count = h.writes.length;
      try { const result = await callback(db); if (h.commitErrors.length) throw h.commitErrors.shift(); return result; }
      catch (cause) { Object.assign(h, snapshot); h.writes.length = count; throw cause; }
    }); queue = next.catch(() => undefined); return next;
  };
  const defaultDb = new Proxy(db, { get(target, key) { h.globalDb++; if (h.forbidGlobal) throw Error('Supplied DB escaped to global'); return Reflect.get(target, key); } });
  async function effect(data, actorId, id) {
    const submitted = data.submitImmediately;
    let row = id && h.approvalDocument.find(v => v.id === id);
    if (row) Object.assign(row, { title: data.title, content: data.content, status: submitted ? 'SUBMITTED' : row.status, updatedAt: new Date(h.now) });
    else { row = await db.approvalDocument.create({ data: { drafterId: actorId, title: data.title, category: data.category, content: data.content, templateId: data.templateId, status: submitted ? 'SUBMITTED' : 'DRAFT', updatedAt: new Date(h.now) } }); }
    await db.auditLog.create({ data: { actorId, documentId: row.id, action: submitted ? 'SUBMIT' : id ? 'UPDATE_DRAFT' : 'CREATE_DRAFT', targetType: 'ApprovalDocument', targetId: row.id, metadata: { privateSeed: 'NO_METADATA_IN_DTO' } } });
    return row;
  }
  class ScopedDate extends Date { constructor(...args) { super(...(args.length ? args : [h.now.getTime()])); } static now() { return h.clock ?? Date.now(); } }
  const mocks = {
    'server-only': {}, '@/generated/prisma/client': generated, '@/lib/prisma': { prisma: defaultDb },
    'next/cache': { revalidatePath: path => h.cache.push(path) },
    '@/lib/approval-document-lock': { lockApprovalDocument: async (_tx, id) => h.locks.push({ documentId: id }) },
    '@/lib/approval-mutations': { createApprovalDocument: data => effect(data, data.drafterId, null), updateDraftDocument: async data => ({ ok: true, documentId: (await effect(data, data.actorId, data.documentId)).id }), deleteDocumentAttachment: async () => { throw Error('Unexpected attachment mutation'); } },
    '@/lib/generated-approval-pdf': { getGeneratedApprovalPdfStorageError: () => null, attachGeneratedApprovalPdfToDocument: async () => { throw Error('Use supplied PDF port'); } },
    '@/lib/attachment-storage': { defaultAttachmentPolicy: { maxFileCount: 10, maxFileSizeMb: 20, allowedExtensions: ['.pdf'] }, ...Object.fromEntries(['encryptStoredAttachmentInPlace', 'getSignedUploadUrlForAttachment', 'readStoredAttachmentFile', 'removeStoredAttachmentFiles'].map(name => [name, async () => { h.storage.push(name); throw Error('Unexpected storage IO'); }])) },
  };
  const modules = new Map();
  function load(file) {
    if (modules.has(file)) return modules.get(file);
    const source = readFileSync(new URL('../../src/' + file, import.meta.url), 'utf8');
    const output = ts.transpileModule(source, { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const evaluated = { exports: {} }; modules.set(file, evaluated.exports);
    new Function('require', 'module', 'exports', 'Date', 'setTimeout', 'clearTimeout', 'console', output)(name => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name.startsWith('@/')) return load(name.slice(2) + '.ts');
      return nativeRequire(name);
    }, evaluated, evaluated.exports, ScopedDate, (fn, delay) => { const id = ++h.timerId; h.timers.set(id, { fn, delay }); return id; }, id => h.timers.delete(id), { error: (...args) => h.errors.push(args) });
    modules.set(file, evaluated.exports); return evaluated.exports;
  }
  for (const model of Object.keys(fields)) h[model] = [];
  h.user = [
    { id: 'actor-a', name: 'Synthetic A', status: 'ACTIVE', role: 'USER', email: 'PRIVATE_EMAIL', position: { name: '직원', level: 1 } },
    { id: 'actor-b', name: 'Synthetic B', status: 'ACTIVE', role: 'ADMIN', email: 'PRIVATE_B_EMAIL', position: { name: '직원', level: 1 } },
    { id: 'director', name: 'Synthetic Director', status: 'ACTIVE', role: 'USER', position: { name: '시설장', level: 10 } },
  ];
  h.documentTemplate = [{ id: 'template-a', name: 'Synthetic template', isActive: true, schema: { version: 1, fields: [{ name: 'note', label: 'Synthetic note', type: 'textarea', required: true }] } }];
  const actualAuth = load('lib/mobile-auth.ts');
  mocks['@/lib/mobile-auth'] = { ...actualAuth, getMobileSession: async () => h.session ? { userId: h.session } : null };
  return { h, db, load, dependencies: { db, now: () => h.now, cache: path => h.cache.push(path), generatePdf: async () => undefined }, fireTimers() { for (const { fn } of [...h.timers.values()]) fn(); } };
}
