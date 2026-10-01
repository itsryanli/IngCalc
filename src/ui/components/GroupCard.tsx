import { useState } from 'react';
import type { Profile, ProfileGroup } from '../../core/types';
import { deleteGroup } from '../../storage/groups';

interface Props {
  group: ProfileGroup;
  profiles: readonly Profile[];
  onEdit: (group: ProfileGroup) => void;
  onDeleted: () => void;
}

export function GroupCard({ group, profiles, onEdit, onDeleted }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const names = group.memberIds
    .map((id) => profiles.find((p) => p.id === id)?.name)
    .filter((n): n is string => n !== undefined);

  const remove = async () => {
    try {
      await deleteGroup(group.id);
    } catch (err) {
      console.error('Deleting a group failed', err);
      setConfirming(false);
      setError('Could not delete this group — storage may be blocked or full. Please try again.');
      return;
    }
    onDeleted();
  };

  return (
    <article className="card" data-testid={`group-${group.id}`}>
      <h3 className="batch__name">{group.name}</h3>
      <p className="profile-card__targets">{names.join(', ')}</p>

      {confirming ? (
        <>
          <p>
            Delete the group "{group.name}"? Only the group goes — everyone in it keeps
            their profile and everything they have logged.
          </p>
          <div className="btn-row">
            <button type="button" className="btn btn--primary" onClick={() => { void remove(); }}>
              Yes, delete it
            </button>
            <button type="button" className="btn btn--secondary" onClick={() => setConfirming(false)}>
              Keep it
            </button>
          </div>
        </>
      ) : (
        <div className="btn-row">
          <button type="button" className="btn btn--secondary" onClick={() => onEdit(group)}>Edit group</button>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => { setError(null); setConfirming(true); }}
          >
            Delete group
          </button>
        </div>
      )}

      {error !== null && <p role="alert">{error}</p>}
    </article>
  );
}
