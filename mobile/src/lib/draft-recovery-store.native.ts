import * as SecureStore from 'expo-secure-store';
import type { RecoveryStoragePort } from './draft-recovery-storage';
const options: SecureStore.SecureStoreOptions = { keychainService: 'gyeoljaeon.draft-recovery.v1', keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY, requireAuthentication: false };
export const draftRecoveryPort: RecoveryStoragePort = { available: () => SecureStore.isAvailableAsync(), get: key => SecureStore.getItemAsync(key, options), set: (key, value) => SecureStore.setItemAsync(key, value, options), remove: key => SecureStore.deleteItemAsync(key, options) };
export const durableDraftRecovery = true;
