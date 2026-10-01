import { useState } from 'react';
import type { Profile, ProfileGroup } from '../../core/types';
import { GroupCard } from '../components/GroupCard';
import { GroupForm } from '../components/GroupForm';
import { ProfileCard } from '../components/ProfileCard';
import { ProfileForm } from '../components/ProfileForm';
import { useGroups } from '../useGroups';

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
type View =
  | { kind: 'list' }
  | { kind: 'form'; profile?: Profile }
  | { kind: 'groupForm'; group?: ProfileGroup };

export function ProfileScreen({
  profiles, activeId, storageError, onSetActive, onChanged, today = new Date(),
}: Props) {
  const [view, setView] = useState<View>({ kind: 'list' });
  const { groups, refresh: refreshGroups } = useGroups();

  // A deleted profile can change or remove a group, so both lists re-read.
  const afterProfileChange = () => { onChanged(); void refreshGroups(); };

  if (view.kind === 'groupForm') {
    return (
      <section className="screen">
        <GroupForm
          profiles={profiles}
          group={view.group}
          onSaved={() => { void refreshGroups(); setView({ kind: 'list' }); }}
          onCancel={() => setView({ kind: 'list' })}
        />
      </section>
    );
  }

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
        food against. Each person has their own meal log; purchases and cooks in the
        Kitchen are shared by everyone.
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
          onDeleted={afterProfileChange}
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

      {profiles.length >= 2 && (
        <div className="profile-groups">
          <h3 className="profile-groups__title">Groups</h3>
          <p className="screen__hint">
            People who eat together. Log one meal for everyone at once, and see the whole
            group's day side by side on the Log.
          </p>
          {groups.map((g) => (
            <GroupCard
              key={g.id}
              group={g}
              profiles={profiles}
              onEdit={(group) => setView({ kind: 'groupForm', group })}
              onDeleted={() => { void refreshGroups(); }}
            />
          ))}
          <div className="btn-row">
            <button type="button" className="btn btn--secondary" onClick={() => setView({ kind: 'groupForm' })}>
              Add a group
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
