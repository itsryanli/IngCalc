import { useState } from 'react';
import type { Profile } from '../../core/types';
import { calorieTarget, proteinTargetG } from '../../core/targets';
import { deleteProfile } from '../../storage/profiles';

interface Props {
  profile: Profile;
  active: boolean;
  today: Date;
  onSetActive: (id: string) => void;
  onEdit: (profile: Profile) => void;
  onDeleted: () => void;
}

export function ProfileCard({ profile, active, today, onSetActive, onEdit, onDeleted }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const kcal = Math.round(calorieTarget(profile, today)).toLocaleString('en-MY');
  const protein = Math.round(proteinTargetG(profile));

  const remove = async () => {
    try {
      await deleteProfile(profile.id);
    } catch (err) {
      console.error('Deleting a profile failed', err);
      // Without this the rejection goes unhandled and the user taps
      // "Yes, delete it" to nothing: no error, profile still listed.
      setConfirming(false);
      setError('Could not delete this profile — storage may be blocked or full. Please try again.');
      return;
    }
    setError(null);
    setConfirming(false);
    onDeleted();
  };

  return (
    <article
      className="card profile-card"
      data-testid={`profile-${profile.id}`}
      aria-current={active ? 'true' : undefined}
    >
      <h3 className="card__title">
        {profile.name}
        {active && <span className="profile-card__active"> · active</span>}
      </h3>

      <p className="profile-card__targets" data-testid="profile-targets">
        {kcal} kcal · {protein}g protein
      </p>

      {confirming ? (
        <>
          {/* A question with its own buttons, not an assertive announcement —
              plain text, so role="alert" stays free to mean "a write just
              failed" (execution record §3.5). */}
          <p>
            Delete "{profile.name}"? Every meal logged for {profile.name} goes with it,
            along with that day's targets. The kitchen keeps its batches and cooks, and
            the food those meals used counts as uneaten again.
          </p>
          <div className="btn-row">
            <button type="button" className="btn btn--primary" onClick={() => { void remove(); }}>
              Yes, delete it
            </button>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => { setError(null); setConfirming(false); }}
            >
              Keep it
            </button>
          </div>
        </>
      ) : (
        <div className="btn-row">
          {!active && (
            <button type="button" className="btn btn--primary" onClick={() => onSetActive(profile.id)}>
              Use this one
            </button>
          )}
          <button type="button" className="btn btn--secondary" onClick={() => onEdit(profile)}>
            Edit
          </button>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => { setError(null); setConfirming(true); }}
          >
            Delete
          </button>
        </div>
      )}

      {error !== null && <p role="alert">{error}</p>}
    </article>
  );
}
