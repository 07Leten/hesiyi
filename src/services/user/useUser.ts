import { useSyncExternalStore } from 'react';
import { userStore } from './UserStore';

export function useUser() {
  return useSyncExternalStore(userStore.subscribe, userStore.getSnapshot);
}

export { userStore };
