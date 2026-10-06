import { describe, it, expect, vi } from 'vitest';
import { checkPersistence, requestPersistence } from './persistence';

const storage = (persisted: boolean, grants: boolean) => ({
  persisted: vi.fn().mockResolvedValue(persisted),
  persist: vi.fn().mockResolvedValue(grants),
});

describe('requestPersistence', () => {
  it('does not ask again when storage is already persistent', async () => {
    const s = storage(true, false);
    expect(await requestPersistence(s)).toBe('persisted');
    expect(s.persist).not.toHaveBeenCalled();
  });

  it('asks, and reports a grant', async () => {
    const s = storage(false, true);
    expect(await requestPersistence(s)).toBe('persisted');
    expect(s.persist).toHaveBeenCalledOnce();
  });

  it('reports a refusal', async () => {
    expect(await requestPersistence(storage(false, false))).toBe('notPersisted');
  });

  it('treats an error as not persisted rather than failing', async () => {
    const s = { persisted: vi.fn().mockRejectedValue(new Error('nope')), persist: vi.fn() };
    expect(await requestPersistence(s)).toBe('notPersisted');
  });

  it('says so when the browser has no storage manager', async () => {
    expect(await requestPersistence(undefined)).toBe('unsupported');
  });
});

describe('checkPersistence', () => {
  it('reports without asking', async () => {
    const s = storage(false, true);
    expect(await checkPersistence(s)).toBe('notPersisted');
    expect(s.persist).not.toHaveBeenCalled();
  });
});
