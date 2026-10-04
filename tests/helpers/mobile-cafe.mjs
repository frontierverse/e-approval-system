import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import * as generated from '../../src/generated/prisma/client.ts';

const nativeRequire = createRequire(import.meta.url);
const models = {
  user: ['id', 'name', 'status', 'role', 'email'],
  cafeItem: ['id', 'name', 'category', 'purchasedAt', 'priceWon', 'purchaseReason', 'expirationDate', 'expirationHoldReason', 'createdAt', 'updatedAt'],
  cafeComplianceNote: ['id', 'content', 'createdAt', 'updatedAt', 'createdById'],
  cafeMutationReceipt: ['id', 'actorId', 'requestId', 'operation', 'targetType', 'targetId', 'payloadHash', 'committedUpdatedAt', 'committedAt'],
  auditLog: ['id', 'actorId', 'action', 'targetType', 'targetId', 'message', 'metadata', 'ipAddress', 'userAgent', 'createdAt', 'updatedAt'],
  lunchBoxSchool: ['id', 'name', 'type', 'active', 'order'],
  lunchBoxMenu: ['id', 'date', 'items'],
  lunchBoxCount: ['id', 'schoolId', 'date', 'class1Count', 'class2Count', 'class3Count', 'class4Count', 'linkedCount', 'preservationCount', 'deliveryDriverCount', 'checkedAt', 'checkedById'],
};
const compare = (a, b) => a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b;
const rangeValue = (current, operand) => current instanceof Date && typeof operand === 'string' ? new Date(operand) : operand;

// Evaluate production modules unchanged. Only framework, auth, clock/timers and
// supplied transaction ports are lexical. This mock is not a PostgreSQL proof.
export function createCafeHarness() {
  const h = { now: new Date('2026-10-04T03:00:00.000Z'), clock: null, session: 'actor', reads: [], writes: [], locks: [], transactions: [], invalidated: [], next: 0, globalDbReads: 0, timeouts: new Map(), timerId: 0, nextTxErrors: [], auditFailure: false, receiptFailure: false, cacheFailure: false, beforeTx: null, modelFailure: null };
  const relation = (model, row) => ({ ...row,
    ...(model === 'cafeComplianceNote' ? { createdBy: h.user.find(v => v.id === row.createdById) ?? null } : {}),
    ...(model === 'auditLog' ? { actor: h.user.find(v => v.id === row.actorId) ?? null } : {}),
    ...(model === 'lunchBoxCount' ? { school: h.lunchBoxSchool.find(v => v.id === row.schoolId) ?? null } : {}),
  });
  function scalar(current, value) {
    if (value === null || value instanceof Date || typeof value !== 'object') return compare(current, value);
    if ('path' in value) return scalar(value.path.reduce((v, k) => v?.[k], current), Object.fromEntries(Object.entries(value).filter(([k]) => k !== 'path')));
    for (const [key, operand] of Object.entries(value)) {
      if (key === 'mode') continue;
      if (key === 'equals' && !compare(current, operand === generated.Prisma.JsonNull ? null : operand)) return false;
      else if (key === 'not' && scalar(current, operand)) return false;
      else if (key === 'in' && !operand.some(v => compare(current, v))) return false;
      else if (key === 'notIn' && operand.some(v => compare(current, v))) return false;
      else if (key === 'lt' && !(current != null && current < rangeValue(current, operand))) return false;
      else if (key === 'lte' && !(current != null && current <= rangeValue(current, operand))) return false;
      else if (key === 'gt' && !(current != null && current > rangeValue(current, operand))) return false;
      else if (key === 'gte' && !(current != null && current >= rangeValue(current, operand))) return false;
      else if (['contains', 'string_contains', 'startsWith'].includes(key)) {
        if (typeof current !== 'string') return false;
        const text = value.mode === 'insensitive' ? current.toLowerCase() : current;
        const needle = value.mode === 'insensitive' ? String(operand).toLowerCase() : String(operand);
        if (!(key === 'startsWith' ? text.startsWith(needle) : text.includes(needle))) return false;
      } else if (!['equals', 'not', 'in', 'notIn', 'lt', 'lte', 'gt', 'gte'].includes(key)) {
        // Relation filters have actual named fields, not silently accepted operators.
        return current != null && matches(current, value);
      }
    }
    return true;
  }
  function matches(row, where = {}) {
    return Object.entries(where).every(([key, value]) => {
      if (key === 'AND') return (Array.isArray(value) ? value : [value]).every(v => matches(row, v));
      if (key === 'OR') return value.some(v => matches(row, v));
      if (key === 'NOT') return !(Array.isArray(value) ? value : [value]).some(v => matches(row, v));
      if (key === 'actorId_requestId' || key === 'schoolId_date') return matches(row, value);
      return scalar(row[key], value);
    });
  }
  const projection = (row, select) => !select ? structuredClone(row) : Object.fromEntries(Object.entries(select).filter(([, v]) => v).map(([k, v]) => [k, v === true ? structuredClone(row[k]) : row[k] == null ? null : projection(row[k], v.select)]));
  function find(model, args = {}) {
    let rows = h[model].map(row => relation(model, row)).filter(row => matches(row, args.where));
    const orders = Array.isArray(args.orderBy) ? args.orderBy : [args.orderBy ?? {}];
    rows.sort((a, b) => {
      for (const order of orders) for (const [key, direction] of Object.entries(order)) {
        const sort = typeof direction === 'string' ? direction : direction.sort;
        if (typeof direction === 'object' && direction.nulls === 'last' && (a[key] == null || b[key] == null)) {
          if (a[key] == null && b[key] != null) return 1;
          if (b[key] == null && a[key] != null) return -1;
        }
        const delta = a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0;
        if (delta) return sort === 'desc' ? -delta : delta;
      }
      return 0;
    });
    if (args.distinct) rows = rows.filter((row, i, all) => all.findIndex(other => args.distinct.every(k => compare(other[k], row[k]))) === i);
    return rows.slice(args.skip ?? 0, args.take === undefined ? undefined : (args.skip ?? 0) + args.take).map(row => projection(row, args.select));
  }
  function checked(model, data) { for (const key of Object.keys(data)) assert.ok(models[model].includes(key), `${model}: unexpected Prisma data field ${key}`); }
  function read(model, args) { h.reads.push({ model, ...args }); if (h.modelFailure === model) throw Error('PRIVATE_PROVIDER_FAILURE'); }
  const db = { async $queryRaw(query, ...values) {
    const sql = query.sql ?? query.strings?.join('?') ?? query.join?.('?') ?? String(query);
    assert.ok(!/^SELECT\s+pg_advisory_xact_lock/.test(sql), 'actual adapter cannot deserialize PostgreSQL void projection');
    h.locks.push({ sql, values: query.values ?? values }); return [];
  } };
  for (const model of Object.keys(models)) db[model] = {
    async findUnique(args) { read(model, args); return find(model, { ...args, take: 1 })[0] ?? null; },
    async findUniqueOrThrow(args) { const row = await this.findUnique(args); assert.ok(row, 'required row'); return row; },
    async findFirst(args = {}) { read(model, args); return find(model, { ...args, take: 1 })[0] ?? null; },
    async findMany(args = {}) { read(model, args); return find(model, args); },
    async count(args = {}) { read(model, args); return h[model].map(row => relation(model, row)).filter(row => matches(row, args.where)).length; },
    async create(args) {
      checked(model, args.data);
      if (model === 'auditLog' && h.auditFailure || model === 'cafeMutationReceipt' && h.receiptFailure) throw Error('PRIVATE_COMMIT_FAILURE');
      if (model === 'cafeMutationReceipt' && h[model].some(v => v.actorId === args.data.actorId && v.requestId === args.data.requestId)) throw new generated.Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'fixture', meta: { modelName: 'CafeMutationReceipt', target: ['actorId', 'requestId'] } });
      const row = { id: `${model}-${++h.next}`, createdAt: new Date(h.now), updatedAt: new Date(h.now), committedAt: new Date(h.now), ...structuredClone(args.data) };
      h[model].push(row); h.writes.push({ model, op: 'create', data: structuredClone(args.data) }); return projection(relation(model, row), args.select);
    },
    async update(args) { checked(model, args.data); const row = h[model].find(v => matches(relation(model, v), args.where)); assert.ok(row, 'updated row'); Object.assign(row, structuredClone(args.data)); h.writes.push({ model, op: 'update', ...args }); return projection(relation(model, row), args.select); },
    async updateMany(args) { checked(model, args.data); const rows = h[model].filter(v => matches(relation(model, v), args.where)); rows.forEach(v => Object.assign(v, structuredClone(args.data))); h.writes.push({ model, op: 'updateMany', ...args }); return { count: rows.length }; },
    async delete(args) { const index = h[model].findIndex(v => matches(relation(model, v), args.where)); assert.ok(index >= 0, 'deleted row'); const [row] = h[model].splice(index, 1); h.writes.push({ model, op: 'delete', ...args }); return projection(relation(model, row), args.select); },
    async deleteMany(args) { const rows = h[model].filter(v => matches(relation(model, v), args.where)); h[model] = h[model].filter(v => !matches(relation(model, v), args.where)); h.writes.push({ model, op: 'deleteMany', ...args }); return { count: rows.length }; },
  };
  let queue = Promise.resolve();
  db.$transaction = (callback, options) => {
    const run = queue.then(async () => {
      h.transactions.push(options); h.beforeTx?.();
      const snapshot = structuredClone(Object.fromEntries(Object.keys(models).map(model => [model, h[model]]))), writes = h.writes.length;
      try { const result = await callback(db); if (h.nextTxErrors.length) throw h.nextTxErrors.shift(); return result; }
      catch (error) { Object.assign(h, snapshot); h.writes.length = writes; throw error; }
    }); queue = run.catch(() => undefined); return run;
  };
  const defaultPrisma = new Proxy(db, { get(target, key) { h.globalDbReads++; if (h.forbidGlobalDb) throw Error('supplied database escaped to global Prisma'); return Reflect.get(target, key); } });
  class ScopedDate extends Date { constructor(...args) { super(...(args.length ? args : [h.now.getTime()])); } static now() { return h.clock ?? Date.now(); } }
  const mocks = {
    'server-only': {}, '@/generated/prisma/client': generated, '@/lib/prisma': { prisma: defaultPrisma },
    'next/cache': { revalidatePath: path => { h.invalidated.push(path); if (h.cacheFailure) throw Error('PRIVATE_CACHE_FAILURE'); } },
    'next/navigation': { unstable_rethrow: nativeRequire('next/navigation').unstable_rethrow },
    '@/lib/auth': { requireUser: async () => { if (h.authError) throw h.authError; return structuredClone(h.user.find(v => v.id === h.session)); } },
    '@/lib/audit-log-request': { getCurrentAuditLogRequestData: async () => ({ ipAddress: 'PRIVATE_IP', userAgent: 'PRIVATE_UA' }), getAuditLogRequestData: () => ({ ipAddress: 'PRIVATE_IP', userAgent: 'PRIVATE_UA' }) },
    '@/lib/login-history-core': { getLoginRequestInfo: () => ({}) },
    '@/lib/mobile-auth': { getMobileSession: async () => h.session ? { userId: h.session } : null },
  };
  const modules = new Map();
  function load(file) {
    if (modules.has(file)) return modules.get(file);
    const source = readFileSync(new URL(`../../src/${file}`, import.meta.url), 'utf8');
    const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
    const evaluated = { exports: {} }; modules.set(file, evaluated.exports);
    new Function('require', 'module', 'exports', 'Date', 'setTimeout', 'clearTimeout', output)(name => {
      if (name in mocks) return mocks[name];
      if (name.startsWith('@/')) return load(name.slice(2) + '.ts');
      return nativeRequire(name);
    }, evaluated, evaluated.exports, ScopedDate, (fn, delay) => { const id = ++h.timerId; h.timeouts.set(id, { fn, delay }); return id; }, id => h.timeouts.delete(id));
    modules.set(file, evaluated.exports); return evaluated.exports;
  }
  function reset() {
    for (const model of Object.keys(models)) h[model] = [];
    h.user = [{ id: 'actor', name: '합성 직원', status: 'ACTIVE', role: 'USER', email: 'PRIVATE_EMAIL_ONLY' }, { id: 'other', name: '다른 직원', status: 'ACTIVE', role: 'ADMIN', email: 'SECOND_PRIVATE_EMAIL' }];
    Object.assign(h, { now: new Date('2026-10-04T03:00:00.000Z'), clock: null, session: 'actor', reads: [], writes: [], locks: [], transactions: [], invalidated: [], next: 0, globalDbReads: 0, nextTxErrors: [], auditFailure: false, receiptFailure: false, cacheFailure: false, beforeTx: null, modelFailure: null, forbidGlobalDb: false, authError: null }); h.timeouts.clear();
  }
  reset();
  return { h, db, ctx: { actorId: 'actor', db, now: () => h.now }, load, reset, fireTimeouts() { for (const timer of [...h.timeouts.values()]) timer.fn(); } };
}
