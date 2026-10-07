import { useLayoutEffect, useRef } from 'react';
import { setAppUpdateBlocker } from './app-update-safety';

export function useAppUpdateBlocker(blocked: boolean) {
  const key = useRef(Symbol('app-update-blocker'));
  useLayoutEffect(() => {
    const id = key.current;
    setAppUpdateBlocker(id, blocked);
    return () => setAppUpdateBlocker(id, false);
  }, [blocked]);
}
