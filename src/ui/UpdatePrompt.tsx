/// <reference types="vite-plugin-pwa/react" />
import { useRegisterSW } from 'virtual:pwa-register/react';
import { UpdateBanner } from './components/UpdateBanner';

const HOURLY_MS = 60 * 60 * 1000;

/**
 * An installed app on a phone is usually resumed rather than reopened, and a
 * resumed app never asks for a new version, so an update could wait days to
 * arrive. This asks whenever the app comes back to the screen, and hourly while
 * it stays open, then lets the person reload when it suits them.
 */
export function UpdatePrompt() {
  const { needRefresh: [needRefresh, setNeedRefresh], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (registration === undefined) return;
      const check = () => {
        // Offline at the market is normal: skip the check rather than log an error.
        if (document.visibilityState !== 'visible' || !navigator.onLine) return;
        registration.update().catch(() => {});
      };
      document.addEventListener('visibilitychange', check);
      setInterval(check, HOURLY_MS);
    },
  });

  if (!needRefresh) return null;
  return (
    <UpdateBanner
      onReload={() => { void updateServiceWorker(true); }}
      onDismiss={() => setNeedRefresh(false)}
    />
  );
}
