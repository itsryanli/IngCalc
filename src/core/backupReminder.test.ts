import { describe, expect, it } from 'vitest';
import { BACKUP_DUE_AFTER_DAYS, backupStatus } from './backupReminder';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 1, 12);

describe('backupStatus', () => {
  it('asks for a first backup once there is data', () => {
    expect(backupStatus(undefined, true, NOW)).toEqual({ due: true, text: 'Not backed up yet' });
  });

  it('does not nag an empty app', () => {
    expect(backupStatus(undefined, false, NOW).due).toBe(false);
  });

  it('is quiet while the last backup is recent', () => {
    expect(backupStatus(NOW - 3 * DAY, true, NOW)).toEqual({ due: false, text: 'Last backup: 3 days ago' });
  });

  it('becomes due at the threshold', () => {
    expect(backupStatus(NOW - (BACKUP_DUE_AFTER_DAYS - 1) * DAY, true, NOW).due).toBe(false);
    expect(backupStatus(NOW - BACKUP_DUE_AFTER_DAYS * DAY, true, NOW).due).toBe(true);
  });

  it('words the age in the largest sensible unit', () => {
    expect(backupStatus(NOW - 2 * 60 * 60 * 1000, true, NOW).text).toBe('Last backup: today');
    expect(backupStatus(NOW - 1.5 * DAY, true, NOW).text).toBe('Last backup: yesterday');
    expect(backupStatus(NOW - 21 * DAY, true, NOW).text).toBe('Last backup: 3 weeks ago');
    expect(backupStatus(NOW - 95 * DAY, true, NOW).text).toBe('Last backup: 3 months ago');
  });

  it('treats a backup stamped in the future as made today', () => {
    expect(backupStatus(NOW + DAY, true, NOW)).toEqual({ due: false, text: 'Last backup: today' });
  });
});
