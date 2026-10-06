/**
 * Browsers may delete a site's stored data when the device runs low on space,
 * unless the site has been granted persistent storage. Everything this app knows
 * lives in that storage, so it asks once at start-up. Chrome and Safari decide
 * silently (an installed app is usually granted); Firefox may ask the person.
 */
export type Persistence = 'persisted' | 'notPersisted' | 'unsupported';

type StorageLike = Pick<StorageManager, 'persist' | 'persisted'>;

const manager = (): StorageLike | undefined =>
  typeof navigator !== 'undefined' && typeof navigator.storage?.persist === 'function'
    ? navigator.storage
    : undefined;

/** Asks for persistent storage if it is not already granted, and says how it went. */
export async function requestPersistence(storage: StorageLike | undefined = manager()): Promise<Persistence> {
  if (storage === undefined) return 'unsupported';
  try {
    if (await storage.persisted()) return 'persisted';
    return (await storage.persist()) ? 'persisted' : 'notPersisted';
  } catch {
    // A refusal must never stop the app from starting.
    return 'notPersisted';
  }
}

/** Reports the current state without asking. */
export async function checkPersistence(storage: StorageLike | undefined = manager()): Promise<Persistence> {
  if (storage === undefined) return 'unsupported';
  try {
    return (await storage.persisted()) ? 'persisted' : 'notPersisted';
  } catch {
    return 'notPersisted';
  }
}
