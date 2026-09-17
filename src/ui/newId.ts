/**
 * crypto.randomUUID() is only defined in a secure context (https, or localhost).
 * Serving the dev build to a phone over `http://<LAN-ip>:5173` — the obvious way to
 * test a phone-first PWA on the actual target device — is NOT a secure context, so
 * `crypto.randomUUID` is `undefined` there and calling it throws, taking the save
 * with it. Fall back to a non-cryptographic but adequately unique id in that case;
 * these ids only need to be unique within one user's local IndexedDB, never globally.
 */
export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
