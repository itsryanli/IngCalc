import { useCallback, useEffect, useRef, useState } from 'react';
import { backupStatus, type BackupStatus } from '../core/backupReminder';
import { exportAll, hasUserData } from '../storage/backup';
import { getSettings, markBackedUp } from '../storage/settings';
import { todayIso } from './dates';
import { downloadText } from './download';

/**
 * The backup file and the "last backed up" record, in one place, so the Log's
 * reminder and the Costs tab's button cannot drift apart.
 */
export function useBackup(today: Date = new Date()) {
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generationRef = useRef(0);

  const fetchStatus = useCallback(async (gen: number) => {
    try {
      const [settings, hasData] = await Promise.all([getSettings(), hasUserData()]);
      if (gen === generationRef.current) setStatus(backupStatus(settings.lastBackupAt, hasData, Date.now()));
    } catch (err) {
      // Storage being unreadable is reported elsewhere; the reminder just stays away.
      console.error('Reading the backup status failed', err);
      if (gen === generationRef.current) setStatus(null);
    }
  }, []);

  useEffect(() => {
    const gen = ++generationRef.current;
    void fetchStatus(gen);
    return () => { generationRef.current += 1; };
  }, [fetchStatus]);

  const load = useCallback(async () => {
    const gen = ++generationRef.current;
    await fetchStatus(gen);
  }, [fetchStatus]);

  const backUp = async (): Promise<void> => {
    setError(null);
    try {
      const file = await exportAll();
      downloadText(`ingcalc-backup-${todayIso(today)}.json`, 'application/json', JSON.stringify(file, null, 2));
    } catch (err) {
      console.error('Creating a backup failed', err);
      setError('The backup could not be created.');
      return;
    }
    try {
      await markBackedUp();
    } catch (err) {
      // The file was handed over; only the reminder's record failed to save.
      console.error('Recording the backup time failed', err);
    }
    await load();
  };

  return { status, error, backUp, reload: load };
}
