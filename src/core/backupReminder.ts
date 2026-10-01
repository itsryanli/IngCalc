/**
 * Everything lives on this one device, so a lost or reset phone loses it all.
 * The reminder asks for a backup once there is something worth keeping and the
 * last one is old enough that a loss would hurt.
 */

export const BACKUP_DUE_AFTER_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface BackupStatus {
  /** True when the app should ask for a backup. */
  due: boolean;
  /** "Last backup: 3 days ago", or "Not backed up yet". */
  text: string;
}

function ago(days: number): string {
  if (days < 1) return 'today';
  if (days < 2) return 'yesterday';
  if (days < 14) return `${Math.floor(days)} days ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
}

export function backupStatus(lastBackupAt: number | undefined, hasData: boolean, now: number): BackupStatus {
  if (lastBackupAt === undefined) {
    return { due: hasData, text: 'Not backed up yet' };
  }
  // A clock set backwards would otherwise read as a backup made in the future.
  const days = Math.max(0, (now - lastBackupAt) / DAY_MS);
  return { due: hasData && days >= BACKUP_DUE_AFTER_DAYS, text: `Last backup: ${ago(days)}` };
}
