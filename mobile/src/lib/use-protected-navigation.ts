import { usePreventRemove as useNativePreventRemove } from 'expo-router/react-navigation';
import { useAppUpdateBlocker } from './use-app-update-blocker';

// Preserve each screen's existing leave policy and use the same condition to
// protect it from applying an update while it sits behind another screen.
export function usePreventRemove(...args: Parameters<typeof useNativePreventRemove>) {
  useAppUpdateBlocker(args[0]);
  return useNativePreventRemove(...args);
}
