import { useSyncExternalStore } from 'react';
import { installOffer } from '@/lib/serviceWorker';

/** Whether the browser offers to install Nabd as an app (task 3.25). */
export function useInstallOffer() {
  return useSyncExternalStore(installOffer.subscribe, installOffer.available, () => false);
}
