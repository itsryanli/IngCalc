import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataPanel } from './DataPanel';
import { MAX_BACKUP_BYTES, NOT_READABLE, TOO_LARGE } from '../../core/backup';
import { db } from '../../storage/db';
import { g, myr } from '../../core/units';
import * as backupStorage from '../../storage/backup';

vi.mock('../download', () => ({ downloadText: vi.fn() }));
import { downloadText } from '../download';

const FIXTURE = readFileSync(join(process.cwd(), 'src/storage/__fixtures__/backup-v3.json'), 'utf8');
const LIST = '2 purchases, 1 cook, 4 meals, 1 profile and 1 added ingredient';
const TODAY = new Date(2026, 8, 23);

const setup = (over: Partial<Parameters<typeof DataPanel>[0]> = {}) => {
  const onRestored = vi.fn();
  render(<DataPanel onExportPurchases={null} onExportMeals={null} onRestored={onRestored} today={TODAY} {...over} />);
  return { onRestored, user: userEvent.setup() };
};

const fileOf = (text: string) => new File([text], 'backup.json', { type: 'application/json' });
const restoreInput = () => screen.getByLabelText(/restore from backup/i);

beforeEach(async () => {
  vi.restoreAllMocks();
  vi.mocked(downloadText).mockClear();
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('DataPanel: exports and backup', () => {
  it('disables an export with nothing in it, and runs one that has', async () => {
    const onExportMeals = vi.fn();
    const { user } = setup({ onExportMeals });
    expect(screen.getByRole('button', { name: 'Export purchases (CSV)' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Export meals (CSV)' }));
    expect(onExportMeals).toHaveBeenCalledOnce();
  });

  it('downloads the whole database as a backup named for today', async () => {
    await db.profiles.put({ id: 'p1', name: 'Ali', sex: 'male', birthYear: 1995, heightCm: 175, weightKg: 72, sessionsPerWeek: 4, goal: 'maintain' });
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Download backup (JSON)' }));
    await waitFor(() => expect(downloadText).toHaveBeenCalledOnce());
    const [name, mime, text] = vi.mocked(downloadText).mock.calls[0]!;
    expect(name).toBe('ingcalc-backup-2026-09-23.json');
    expect(mime).toBe('application/json');
    expect(JSON.parse(text).tables.profiles[0].name).toBe('Ali');
  });
});

describe('DataPanel: restore', () => {
  it('rejects a file that is not JSON', async () => {
    const { user } = setup();
    await user.upload(restoreInput(), fileOf('{nope'));
    expect(await screen.findByRole('alert')).toHaveTextContent(NOT_READABLE);
  });

  it('rejects a file too large to be a backup before reading it', async () => {
    const { user } = setup();
    const big = fileOf('{}');
    Object.defineProperty(big, 'size', { value: MAX_BACKUP_BYTES + 1 });
    await user.upload(restoreInput(), big);
    expect(await screen.findByRole('alert')).toHaveTextContent(TOO_LARGE);
  });

  it('merges onto an empty device and reports what it added', async () => {
    const { user, onRestored } = setup();
    await user.upload(restoreInput(), fileOf(FIXTURE));
    await user.click(await screen.findByRole('button', { name: 'Merge' }));
    expect(await screen.findByTestId('restore-preview')).toHaveTextContent(`Adds ${LIST}.`);
    await user.click(screen.getByRole('button', { name: 'Merge into this device' }));
    await waitFor(() => expect(onRestored).toHaveBeenCalledOnce());
    expect(screen.getByTestId('restore-done')).toHaveTextContent(`Merged. Added ${LIST}.`);
    expect(await db.batches.count()).toBe(2);
    expect(restoreInput()).toBeInTheDocument();
  });

  it('spells out what a replace erases, offers a backup first, then replaces', async () => {
    await db.batches.put({
      id: 'b-local', ingredientId: 'chicken-breast', rawWeightG: g(500),
      purchase: { pricePaidMYR: myr(9), location: 'Here', date: '2026-09-22' }, createdAt: 1,
    });
    const { user, onRestored } = setup();
    await user.upload(restoreInput(), fileOf(FIXTURE));
    await user.click(await screen.findByRole('button', { name: 'Replace' }));
    expect(await screen.findByTestId('restore-preview'))
      .toHaveTextContent(`This erases everything on this device — 1 purchase — and replaces it with the backup's ${LIST}.`);

    await user.click(screen.getByRole('button', { name: 'Download a backup of this device first' }));
    await waitFor(() => expect(downloadText).toHaveBeenCalledOnce());

    await user.click(screen.getByRole('button', { name: 'Erase and restore' }));
    await waitFor(() => expect(onRestored).toHaveBeenCalledOnce());
    expect((await db.batches.toArray()).map((b) => b.id).sort()).toEqual(['b-chicken', 'b-tempeh']);
  });

  it('blocks the mode buttons while the preview is loading, so a race with Cancel is impossible', async () => {
    const original = backupStorage.previewRestore;
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    vi.spyOn(backupStorage, 'previewRestore').mockImplementationOnce(async (mode, tables) => {
      await gate;
      return original(mode, tables);
    });
    const { user } = setup();
    await user.upload(restoreInput(), fileOf(FIXTURE));
    await user.click(await screen.findByRole('button', { name: 'Merge' }));

    expect(screen.getByRole('button', { name: 'Merge' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Replace' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();

    release();
    expect(await screen.findByTestId('restore-preview')).toHaveTextContent(`Adds ${LIST}.`);
  });

  it('cancels back to the start without writing', async () => {
    const { user, onRestored } = setup();
    await user.upload(restoreInput(), fileOf(FIXTURE));
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(restoreInput()).toBeInTheDocument();
    expect(onRestored).not.toHaveBeenCalled();
    expect(await db.batches.count()).toBe(0);
  });

  it('reports an integrity failure when a mode is chosen, and writes nothing', async () => {
    const broken = JSON.parse(FIXTURE);
    broken.tables.batches = [];
    const { user } = setup();
    await user.upload(restoreInput(), fileOf(JSON.stringify(broken)));
    await user.click(await screen.findByRole('button', { name: 'Replace' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("1 cook refers to a purchase that isn't in the backup.");
    expect(restoreInput()).toBeInTheDocument();
  });

  it('says nothing changed when the write fails, and does not report success', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(db.dayLogs, 'bulkAdd').mockRejectedValueOnce(new Error('disk full'));
    const { user, onRestored } = setup();
    await user.upload(restoreInput(), fileOf(FIXTURE));
    await user.click(await screen.findByRole('button', { name: 'Merge' }));
    await user.click(await screen.findByRole('button', { name: 'Merge into this device' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The restore failed and nothing was changed.');
    expect(onRestored).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith('Restoring a backup failed', expect.any(Error));
    expect(await db.batches.count()).toBe(0);
  });
});
