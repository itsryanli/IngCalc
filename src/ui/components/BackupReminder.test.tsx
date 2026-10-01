import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BackupReminder } from './BackupReminder';
import { db } from '../../storage/db';
import { getSettings, markBackedUp } from '../../storage/settings';
import { downloadText } from '../download';
import { g, myr } from '../../core/units';

vi.mock('../download', () => ({ downloadText: vi.fn() }));

const DAY = 24 * 60 * 60 * 1000;

const seedPurchase = () => db.batches.put({
  id: 'b1', ingredientId: 'chicken-breast', rawWeightG: g(1000),
  purchase: { pricePaidMYR: myr(20), location: 'Pasar', date: '2026-09-19' }, createdAt: 0,
});

beforeEach(async () => {
  await db.batches.clear();
  await db.mealEntries.clear();
  await db.settings.clear();
  vi.mocked(downloadText).mockClear();
});

describe('BackupReminder', () => {
  it('stays away while there is nothing to lose', async () => {
    render(<BackupReminder />);
    // Give the status read time to land before asserting absence.
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByTestId('backup-reminder')).toBeNull();
  });

  it('asks for a first backup once there is data, and goes once it is made', async () => {
    await seedPurchase();
    render(<BackupReminder />);

    expect(await screen.findByTestId('backup-reminder')).toHaveTextContent(/not backed up yet/i);
    fireEvent.click(screen.getByRole('button', { name: /back up now/i }));

    await waitFor(() => expect(screen.queryByTestId('backup-reminder')).toBeNull());
    expect(downloadText).toHaveBeenCalledTimes(1);
    expect((await getSettings()).lastBackupAt).toBeTypeOf('number');
  });

  it('returns when the last backup is two weeks old', async () => {
    await seedPurchase();
    await markBackedUp(Date.now() - 15 * DAY);
    render(<BackupReminder />);
    expect(await screen.findByTestId('backup-reminder')).toHaveTextContent(/2 weeks ago/i);
  });

  it('is quiet after a recent backup', async () => {
    await seedPurchase();
    await markBackedUp(Date.now() - 2 * DAY);
    render(<BackupReminder />);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByTestId('backup-reminder')).toBeNull();
  });
});
