import { sha256 } from '@noble/hashes/sha2.js';
import type { DraftData, DraftOptions, DraftTemplate, SaveDraftResult } from './drafts';

export const RECOVERY_RECORD_BYTES = 65536;
export const RECOVERY_CHUNK_BYTES = 1800;
export const RECOVERY_SLOTS = 4;
export const RECOVERY_CHUNKS = 37;
export type RecoveryScope = { kind: 'new'; localId: string } | { kind: 'document'; documentId: string };
export type FrozenDraftText = { title: string; templateId: string; fieldValues: Record<string, string>; approverIds: string[] };
export type RecoveryPendingProof = { requestId: string; intent: 'draft' | 'submit'; revision: number; expectedUpdatedAt: string | null; stage: 'prepared' | 'sent' | 'unknown'; hasNewUploads: boolean; replayable: false };
export type RecoveryPendingText = Omit<RecoveryPendingProof, 'hasNewUploads' | 'replayable'> & { hasNewUploads: false; replayable: true; templateFingerprint: string; text: FrozenDraftText };
type RecoveryBase = { version: 1; actorId: string; scope: RecoveryScope; revision: number; savedAt: string };
export type RecoveryRecord = (RecoveryBase & { mode: 'full-text'; templateFingerprint: string; baselineUpdatedAt: string | null; text: FrozenDraftText; omittedAttachmentCount: number; pending: RecoveryPendingText | null }) | (RecoveryBase & { mode: 'proof-only'; pending: RecoveryPendingProof });
export type RecoveryMetadata = { scope: RecoveryScope; revision: number; savedAt: string; mode: RecoveryRecord['mode']; pending: boolean };
export type DraftCommitProof = { requestId: string; intent: 'draft' | 'submit'; originalDocumentId: string | null; documentId: string; committedAt: string; committedUpdatedAt: string };
export type DraftRequestStatus = DraftCommitProof & { ok: true; outcome: 'present' | 'deleted'; current: { status: string; updatedAt: string; editable: boolean } | null };
export class RecoveryUnavailable extends Error { constructor(message = '작성 내용을 이 기기에 보관하지 못했습니다.') { super(message); this.name = 'RecoveryUnavailable'; } }
export function recoveryAbort() { const error = new Error('이전 작성 작업을 취소했습니다.'); error.name = 'AbortError'; return error; }
export function recoveryObject(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function exact(value: Record<string, unknown>, keys: string[]) { return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)); }
export function draftId(value: unknown): value is string { return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value); }
export function draftRequestId(value: unknown): value is string { return typeof value === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(value); }
export function draftIso(value: unknown): value is string { if (typeof value !== 'string') return false; const date = new Date(value); return Number.isFinite(date.getTime()) && date.toISOString() === value; }
export function recoveryScopeKey(scope: RecoveryScope) { return scope.kind === 'new' ? `new:${scope.localId}` : `document:${scope.documentId}`; }
export function isRecoveryScope(value: unknown): value is RecoveryScope { return recoveryObject(value) && ((value.kind === 'new' && exact(value, ['kind', 'localId']) && draftId(value.localId)) || (value.kind === 'document' && exact(value, ['kind', 'documentId']) && draftId(value.documentId))); }
export function validRecoveryUnicode(value: string) { for (const point of value) { const code = point.codePointAt(0)!; if (code >= 0xd800 && code <= 0xdfff) return false; } return true; }
export function utf8Bytes(value: string) { return new TextEncoder().encode(value).length; }
export function recoveryDigest(value: string) { return Array.from(sha256(new TextEncoder().encode(value)), byte => byte.toString(16).padStart(2, '0')).join(''); }
export function recoveryChunks(value: string): string[] {
  const result: string[] = []; let text = '', size = 0;
  for (const point of value) { const code = point.codePointAt(0)!; if (code >= 0xd800 && code <= 0xdfff) throw new RecoveryUnavailable('작성 내용의 문자 형식을 확인하지 못했습니다. 입력은 유지됩니다.'); const length = utf8Bytes(point); if (size + length > RECOVERY_CHUNK_BYTES) { result.push(text); text = ''; size = 0; } text += point; size += length; }
  if (text) result.push(text);
  return result;
}
function strings(value: unknown): value is Record<string, string> { return recoveryObject(value) && Object.keys(value).length <= 50 && Object.entries(value).every(([key, v]) => key.length > 0 && key.length <= 100 && validRecoveryUnicode(key) && !['__proto__', 'constructor', 'prototype', 'attachments'].includes(key) && typeof v === 'string' && v.length <= 5000 && validRecoveryUnicode(v)); }
export function isFrozenDraftText(value: unknown): value is FrozenDraftText { return recoveryObject(value) && exact(value, ['title', 'templateId', 'fieldValues', 'approverIds']) && typeof value.title === 'string' && value.title.length <= 120 && validRecoveryUnicode(value.title) && draftId(value.templateId) && strings(value.fieldValues) && Array.isArray(value.approverIds) && value.approverIds.length <= 20 && value.approverIds.every(draftId) && new Set(value.approverIds).size === value.approverIds.length; }
function hash(value: unknown): value is string { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value); }
function positive(value: unknown): value is number { return Number.isSafeInteger(value) && Number(value) > 0; }
function baseline(value: unknown, scope: RecoveryScope) { return scope.kind === 'new' ? value === null : draftIso(value); }
function pending(value: unknown, scope: RecoveryScope, text: boolean): boolean {
  if (!recoveryObject(value)) return false;
  const keys = ['requestId', 'intent', 'revision', 'expectedUpdatedAt', 'stage', 'hasNewUploads', 'replayable', ...(text ? ['templateFingerprint', 'text'] : [])];
  return exact(value, keys) && draftRequestId(value.requestId) && ['draft', 'submit'].includes(String(value.intent)) && positive(value.revision) && baseline(value.expectedUpdatedAt, scope) && ['prepared', 'sent', 'unknown'].includes(String(value.stage)) && (text ? value.hasNewUploads === false && value.replayable === true && hash(value.templateFingerprint) && isFrozenDraftText(value.text) : typeof value.hasNewUploads === 'boolean' && value.replayable === false);
}
export function isRecoveryRecord(value: unknown): value is RecoveryRecord {
  if (!recoveryObject(value) || value.version !== 1 || !draftId(value.actorId) || !isRecoveryScope(value.scope) || !positive(value.revision) || !draftIso(value.savedAt)) return false;
  const keys = ['version', 'actorId', 'scope', 'revision', 'savedAt', 'mode'];
  if (value.mode === 'proof-only') return exact(value, [...keys, 'pending']) && pending(value.pending, value.scope, false) && Number((value.pending as Record<string, unknown>).revision) <= Number(value.revision);
  return value.mode === 'full-text' && exact(value, [...keys, 'templateFingerprint', 'baselineUpdatedAt', 'text', 'omittedAttachmentCount', 'pending']) && hash(value.templateFingerprint) && baseline(value.baselineUpdatedAt, value.scope) && isFrozenDraftText(value.text) && Number.isSafeInteger(value.omittedAttachmentCount) && Number(value.omittedAttachmentCount) >= 0 && (value.pending === null || pending(value.pending, value.scope, true) && Number((value.pending as Record<string, unknown>).revision) <= Number(value.revision));
}
export function boundRecoveryRecord(record: RecoveryRecord): RecoveryRecord {
  if (!isRecoveryRecord(record)) throw new RecoveryUnavailable('복구 내용을 확인하지 못했습니다. 현재 입력은 유지됩니다.');
  const serialized = JSON.stringify(record);
  if (utf8Bytes(serialized) <= RECOVERY_RECORD_BYTES) { recoveryChunks(serialized); return record; }
  if (record.mode === 'proof-only' || !record.pending) throw new RecoveryUnavailable('작성 내용이 기기 보관 용량을 넘었습니다. 현재 입력은 유지됩니다.');
  const { requestId, intent, revision, expectedUpdatedAt, stage, hasNewUploads } = record.pending;
  return { version: 1, actorId: record.actorId, scope: record.scope, revision: record.revision, savedAt: record.savedAt, mode: 'proof-only', pending: { requestId, intent, revision, expectedUpdatedAt, stage, hasNewUploads, replayable: false } };
}
export function templateFingerprint(template: DraftTemplate) {
  const fields = template.fields.filter(field => field.type !== 'attachments' && field.name !== 'title' && field.name !== 'attachments').map(field => ({ name: field.name, label: field.label, type: field.type, required: field.required, placeholder: field.placeholder ?? null, helpText: field.helpText ?? null, options: field.options?.map(option => ({ label: option.label, value: option.value })) ?? null, visibleWhen: field.visibleWhen ? { field: field.visibleWhen.field, values: [...field.visibleWhen.values] } : null }));
  return recoveryDigest(JSON.stringify({ fields, approval: { candidates: 'active-other-user', submit: 'one-facility-director', order: 'ascending-position-level' } }));
}
export function canonicalDraftText(text: FrozenDraftText): FrozenDraftText { return { title: text.title.trim(), templateId: text.templateId.trim(), fieldValues: Object.fromEntries(Object.entries(text.fieldValues).map(([key, value]) => [key, value.trim()])), approverIds: [...new Set(text.approverIds.map(id => id.trim()).filter(Boolean))] }; }
export function recoveryText(template: DraftTemplate, text: FrozenDraftText): FrozenDraftText {
  const names = new Set(template.fields.filter(field => field.type !== 'attachments' && field.name !== 'title' && field.name !== 'attachments').map(field => field.name));
  return { ...text, approverIds: [...text.approverIds], fieldValues: Object.fromEntries(Object.entries(text.fieldValues).filter(([name]) => names.has(name))) };
}
export function compatibleRecoveryText(template: DraftTemplate, text: FrozenDraftText, options: DraftOptions) { const allowed = new Set(template.fields.filter(field => field.type !== 'attachments').map(field => field.name)); return text.templateId === template.id && Object.keys(text.fieldValues).every(name => allowed.has(name)) && template.fields.every(field => { const value = text.fieldValues[field.name] ?? ''; return field.type === 'select' ? value === '' || !!field.options?.some(option => option.value === value) : field.type === 'checkbox' ? ['', 'true', 'false'].includes(value) : true; }) && text.approverIds.every(id => options.approvers.some(approver => approver.id === id)); }
export function isDraftOptions(value: unknown): value is DraftOptions {
  if (!recoveryObject(value) || !Array.isArray(value.templates) || !Array.isArray(value.approvers) || !recoveryObject(value.attachmentPolicy)) return false;
  const policy = value.attachmentPolicy;
  return value.templates.every(item => recoveryObject(item) && draftId(item.id) && typeof item.name === 'string' && strings(item.initialValues) && Array.isArray(item.fields) && item.fields.every(field => recoveryObject(field) && typeof field.name === 'string' && typeof field.label === 'string' && ['text', 'textarea', 'number', 'date', 'select', 'checkbox', 'attachments'].includes(String(field.type)) && typeof field.required === 'boolean' && (field.placeholder === undefined || typeof field.placeholder === 'string') && (field.helpText === undefined || typeof field.helpText === 'string') && (field.options === undefined || Array.isArray(field.options) && field.options.every(option => recoveryObject(option) && typeof option.label === 'string' && typeof option.value === 'string')) && (field.visibleWhen === undefined || recoveryObject(field.visibleWhen) && typeof field.visibleWhen.field === 'string' && Array.isArray(field.visibleWhen.values) && field.visibleWhen.values.every(v => typeof v === 'string')))) && value.approvers.every(item => recoveryObject(item) && draftId(item.id) && typeof item.name === 'string' && typeof item.positionName === 'string') && Number.isSafeInteger(policy.maxFileCount) && Number(policy.maxFileCount) >= 0 && typeof policy.maxFileSizeMb === 'number' && policy.maxFileSizeMb > 0 && Array.isArray(policy.allowedExtensions) && policy.allowedExtensions.every(v => typeof v === 'string');
}
export function isDraftData(value: unknown, expectedId?: string): value is DraftData { return recoveryObject(value) && draftId(value.id) && (!expectedId || value.id === expectedId) && typeof value.title === 'string' && draftId(value.templateId) && ['draft', 'recalled'].includes(String(value.status)) && strings(value.fieldValues) && Array.isArray(value.approverIds) && value.approverIds.every(draftId) && draftIso(value.updatedAt) && Array.isArray(value.attachments) && value.attachments.every(item => recoveryObject(item) && draftId(item.id) && typeof item.name === 'string' && Number.isSafeInteger(item.size) && Number(item.size) >= 0 && typeof item.mimeType === 'string'); }
export function isDraftCommitProof(value: unknown): value is DraftCommitProof { return recoveryObject(value) && exact(value, ['requestId', 'intent', 'originalDocumentId', 'documentId', 'committedAt', 'committedUpdatedAt']) && draftRequestId(value.requestId) && ['draft', 'submit'].includes(String(value.intent)) && (value.originalDocumentId === null || draftId(value.originalDocumentId)) && draftId(value.documentId) && draftIso(value.committedAt) && draftIso(value.committedUpdatedAt); }
export function matchesDraftProof(proof: DraftCommitProof, pending: Pick<RecoveryPendingProof, 'requestId' | 'intent'>, scope: RecoveryScope) { return proof.requestId === pending.requestId && proof.intent === pending.intent && proof.originalDocumentId === (scope.kind === 'document' ? scope.documentId : null) && (scope.kind === 'new' || proof.documentId === scope.documentId); }
export function isDraftSaveResult(value: unknown): value is SaveDraftResult { return recoveryObject(value) && draftId(value.documentId) && ['draft', 'submitted', 'in_progress', 'approved', 'rejected', 'recalled', 'discarded'].includes(String(value.status)) && draftIso(value.updatedAt) && (value.proof === undefined || isDraftCommitProof(value.proof)); }
export function isDraftRequestStatus(value: unknown): value is DraftRequestStatus {
  if (!recoveryObject(value) || !exact(value, ['ok', 'requestId', 'intent', 'originalDocumentId', 'documentId', 'committedAt', 'committedUpdatedAt', 'outcome', 'current'])) return false;
  const { ok, outcome, current, ...proof } = value;
  if (ok !== true || !isDraftCommitProof(proof)) return false;
  return outcome === 'deleted' ? current === null : outcome === 'present' && recoveryObject(current) && exact(current, ['status', 'updatedAt', 'editable']) && ['draft', 'submitted', 'in_progress', 'approved', 'rejected', 'recalled', 'discarded'].includes(String(current.status)) && draftIso(current.updatedAt) && typeof current.editable === 'boolean' && current.editable === ['draft', 'recalled'].includes(String(current.status));
}
