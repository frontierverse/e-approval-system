import type { RecoveryStoragePort } from './draft-recovery-storage';
const memory = new Map<string, string>();
export const draftRecoveryPort: RecoveryStoragePort = { available: async () => true, get: async key => memory.get(key) ?? null, set: async (key, value) => { memory.set(key, value); }, remove: async key => { memory.delete(key); } };
export const durableDraftRecovery = false;
