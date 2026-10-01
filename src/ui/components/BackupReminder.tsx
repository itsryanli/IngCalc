import { useBackup } from '../useBackup';

/**
 * Shown on the Log, the screen opened most, only when a backup is due. It
 * offers the backup itself rather than directions to the Costs tab.
 */
export function BackupReminder({ today }: { today?: Date }) {
  const { status, error, backUp } = useBackup(today);

  if (status === null || !status.due) return null;

  return (
    <div className="banner banner--warn backup-reminder" data-testid="backup-reminder">
      <p className="backup-reminder__text">
        <strong>{status.text}.</strong> Everything is stored only on this phone — save a
        backup file somewhere else so a lost or reset phone does not take it with it.
      </p>
      <button type="button" className="btn btn--secondary btn--small" onClick={() => { void backUp(); }}>
        Back up now
      </button>
      {error !== null && <p role="alert">{error}</p>}
    </div>
  );
}
