import { useEffect, useState } from 'react';

/**
 * Whether the browser thinks it has a network. Used only to hide "Search
 * online" when it plainly cannot work; a search can still fail with signal
 * that is too weak, and says so when it does.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? false : navigator.onLine));
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}
