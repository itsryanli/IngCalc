import { useEffect, useState } from 'react';
import {
  MAX_BACKUP_BYTES, NOT_READABLE, parseBackup, planSummary, restoredSummary, TOO_LARGE,
  type BackupTables, type RestoreMode, type RestorePlan,
} from '../../core/backup';
import { applyRestore, previewRestore } from '../../storage/backup';
import { checkPersistence, type Persistence } from '../../storage/persistence';
import { useBackup } from '../useBackup';

type Stage =
  | { kind: 'idle' }
  | { kind: 'chooseMode'; tables: BackupTables }
  | { kind: 'preview'; tables: BackupTables; plan: RestorePlan };

interface Props {
  /** Null when the export would have no rows; the button is then disabled. */
  onExportPurchases: (() => void) | null;
  onExportMeals: (() => void) | null;
  /** Called only after a restore has actually been written. */
  onRestored: () => void;
  today?: Date;
}

/** `Blob.text()` where the browser has it, FileReader where it does not. */
const readText = (file: Blob): Promise<string> =>
  typeof file.text === 'function'
    ? file.text()
    : new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });

/**
 * The restore pipeline of spec §5.3, as a small state machine: pick a file,
 * choose merge or replace, read the preview, confirm. Every failure lands back
 * at the start with the reason, and nothing is written before the confirm.
 */
export function DataPanel({ onExportPurchases, onExportMeals, onRestored, today = new Date() }: Props) {
  const [stage, setStage] = useState<Stage>({ kind: 'idle' });
  const [errors, setErrors] = useState<string[]>([]);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = (nextErrors: string[] = []) => {
    setStage({ kind: 'idle' });
    setErrors(nextErrors);
    setBusy(false);
  };

  const backup = useBackup(today);
  const [persistence, setPersistence] = useState<Persistence>('unsupported');
  useEffect(() => {
    let cancelled = false;
    void checkPersistence().then((p) => { if (!cancelled) setPersistence(p); });
    return () => { cancelled = true; };
  }, []);
  const downloadBackup = async () => {
    await backup.backUp();
  };

  const pickFile = async (file: File | undefined) => {
    setDone(null);
    setErrors([]);
    if (file === undefined) return;
    if (file.size > MAX_BACKUP_BYTES) {
      reset([TOO_LARGE]);
      return;
    }
    let text: string;
    try {
      text = await readText(file);
    } catch (err) {
      console.error('Reading a backup file failed', err);
      reset([NOT_READABLE]);
      return;
    }
    const parsed = parseBackup(text);
    if (!parsed.ok) {
      reset(parsed.errors);
      return;
    }
    setStage({ kind: 'chooseMode', tables: parsed.value });
  };

  const choose = async (mode: RestoreMode, tables: BackupTables) => {
    setBusy(true);
    try {
      const plan = await previewRestore(mode, tables);
      if (!plan.ok) {
        reset(plan.errors);
        return;
      }
      setStage({ kind: 'preview', tables, plan: plan.value });
      setBusy(false);
    } catch (err) {
      console.error('Reading this device before a restore failed', err);
      reset(["This device's data could not be read, so nothing was changed."]);
    }
  };

  const confirm = async (mode: RestoreMode, tables: BackupTables) => {
    setBusy(true);
    setErrors([]);
    let result: Awaited<ReturnType<typeof applyRestore>>;
    try {
      result = await applyRestore(mode, tables);
    } catch (err) {
      console.error('Restoring a backup failed', err);
      reset(['The restore failed and nothing was changed.']);
      return;
    }
    if (!result.ok) {
      // The device changed between the preview and the confirm.
      reset(result.errors);
      return;
    }
    reset();
    setDone(restoredSummary(result.value));
    // A replace restores the backup's own record of when it was last backed up.
    void backup.reload();
    onRestored();
  };

  return (
    <div className="card data-panel">
      <h3 className="card__title">Your data</h3>

      <div className="data-panel__actions">
        <button
          type="button"
          className="btn btn--secondary"
          disabled={onExportPurchases === null}
          onClick={() => onExportPurchases?.()}
        >
          Export purchases (CSV)
        </button>
        <button
          type="button"
          className="btn btn--secondary"
          disabled={onExportMeals === null}
          onClick={() => onExportMeals?.()}
        >
          Export meals (CSV)
        </button>
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => { setDone(null); setErrors([]); void downloadBackup(); }}
        >
          Download backup (JSON)
        </button>
        <p className="data-panel__note">
          Everything on this device, in one file. Keep it somewhere other than this phone.
          {backup.status !== null && (
            <> <span data-testid="last-backup">{backup.status.text}.</span></>
          )}
        </p>
        {persistence !== 'unsupported' && (
          <p className="data-panel__note" data-testid="persistence">
            {persistence === 'persisted'
              ? 'This browser has agreed to keep the app\'s data, even when the phone is low on space.'
              : 'This browser may clear the app\'s data if the phone runs low on space, so keep regular backups.'}
          </p>
        )}
        {backup.error !== null && <p role="alert">{backup.error}</p>}

        {stage.kind === 'idle' && (
          <label className="btn btn--secondary data-panel__restore">
            Restore from backup…
            <input
              type="file"
              accept=".json,application/json"
              className="visually-hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                // Reset so picking the same file again (e.g. after fixing it) fires onChange again.
                e.target.value = '';
                void pickFile(file);
              }}
            />
          </label>
        )}
      </div>

      {stage.kind === 'chooseMode' && (
        <div className="data-panel__step">
          <p>
            Merge keeps everything on this device and adds what is new. Replace erases this
            device and restores the backup exactly.
          </p>
          <div className="btn-row">
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy}
              onClick={() => { void choose('merge', stage.tables); }}
            >
              Merge
            </button>
            <button
              type="button"
              className="btn btn--secondary"
              disabled={busy}
              onClick={() => { void choose('replace', stage.tables); }}
            >
              Replace
            </button>
            <button type="button" className="btn btn--secondary" disabled={busy} onClick={() => reset()}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {stage.kind === 'preview' && (
        <div className="data-panel__step">
          <p data-testid="restore-preview">{planSummary(stage.plan)}</p>
          <div className="btn-row">
            {stage.plan.mode === 'merge' ? (
              <button
                type="button"
                className="btn btn--primary"
                disabled={busy}
                onClick={() => { void confirm('merge', stage.tables); }}
              >
                Merge into this device
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="btn btn--secondary"
                  disabled={busy}
                  onClick={() => { void downloadBackup(); }}
                >
                  Download a backup of this device first
                </button>
                <button
                  type="button"
                  className="btn btn--danger"
                  disabled={busy}
                  onClick={() => { void confirm('replace', stage.tables); }}
                >
                  Erase and restore
                </button>
              </>
            )}
            <button type="button" className="btn btn--secondary" disabled={busy} onClick={() => reset()}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {done !== null && <p className="banner banner--info" data-testid="restore-done">{done}</p>}

      {errors.length > 0 && (
        <div role="alert">
          {errors.map((line, i) => <p key={i}>{line}</p>)}
        </div>
      )}
    </div>
  );
}
