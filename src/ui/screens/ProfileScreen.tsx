import { useState } from 'react';
import type { Profile } from '../../core/types';
import { ProfileCard } from '../components/ProfileCard';
import { ProfileForm } from '../components/ProfileForm';

interface Props {
  profiles: Profile[];
  activeId: string | null;
  storageError: string | null;
  onSetActive: (id: string) => void;
  /** Re-read storage: a profile was added, edited or deleted. */
  onChanged: () => void;
  today?: Date;
}

// `profile` absent means the form is adding rather than editing.
type View = { kind: 'list' } | { kind: 'form'; profile?: Profile };

export function ProfileScreen({
  profiles, activeId, storageError, onSetActive, onChanged, today = new Date(),
}: Props) {
  const [view, setView] = useState<View>({ kind: 'list' });

  if (view.kind === 'form') {
    const adding = view.profile === undefined;
    return (
      <section className="screen">
        <ProfileForm
          profile={view.profile}
          today={today}
          onSaved={(saved) => {
            // A profile you just created is the one you meant to use. Editing an
            // existing one leaves the active selection alone.
            if (adding) onSetActive(saved.id);
            onChanged();
            setView({ kind: 'list' });
          }}
          onCancel={() => setView({ kind: 'list' })}
        />
      </section>
    );
  }

  return (
    <section className="screen">
      <h2>Profile</h2>
      <p className="screen__hint">
        Body stats produce the calorie and protein targets every other screen measures
        food against. Nothing you log is tied to a profile — batches and cooks are
        household-level, so switching here only changes the yardstick.
      </p>

      {storageError !== null && <p role="alert" className="banner banner--warn">{storageError}</p>}

      {profiles.length === 0 && storageError === null && (
        <p className="screen__hint" data-testid="profiles-empty">
          No profiles yet. Add one and the calculator can show what a portion is worth
          against your daily targets.
        </p>
      )}

      {profiles.map((p) => (
        <ProfileCard
          key={p.id}
          profile={p}
          active={p.id === activeId}
          today={today}
          onSetActive={onSetActive}
          onEdit={(profile) => setView({ kind: 'form', profile })}
          onDeleted={onChanged}
        />
      ))}

      <div className="btn-row">
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => setView({ kind: 'form' })}
        >
          Add a profile
        </button>
      </div>
    </section>
  );
}
