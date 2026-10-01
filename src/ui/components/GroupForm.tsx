import { useId, useState } from 'react';
import type { Profile, ProfileGroup } from '../../core/types';
import { saveGroup } from '../../storage/groups';
import { newId } from '../newId';

interface Props {
  profiles: readonly Profile[];
  /** Present when editing. */
  group?: ProfileGroup;
  onSaved: () => void;
  onCancel: () => void;
}

export function GroupForm({ profiles, group, onSaved, onCancel }: Props) {
  const ids = useId();
  const [name, setName] = useState(group?.name ?? '');
  const [memberIds, setMemberIds] = useState<string[]>(group?.memberIds ?? profiles.map((p) => p.id));
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) =>
    setMemberIds((list) => (list.includes(id) ? list.filter((m) => m !== id) : [...list, id]));

  const submit = async () => {
    if (name.trim() === '') { setError('Give the group a name, like "Family".'); return; }
    if (memberIds.length < 2) { setError('Pick at least two people.'); return; }
    // Kept in profile order, so the group reads the same everywhere it is shown.
    const ordered = profiles.map((p) => p.id).filter((id) => memberIds.includes(id));
    try {
      await saveGroup({ id: group?.id ?? newId(), name: name.trim(), memberIds: ordered });
    } catch (err) {
      console.error('Saving a group failed', err);
      setError('Could not save this group — storage may be blocked or full. Please try again.');
      return;
    }
    onSaved();
  };

  return (
    <div className="card group-form">
      <h3 className="card__title">{group === undefined ? 'New group' : 'Edit group'}</h3>

      <div className="field">
        <label htmlFor={`${ids}-name`}>Group name</label>
        <input id={`${ids}-name`} type="text" value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      <fieldset>
        <legend>Who is in it?</legend>
        {profiles.map((p) => (
          <label key={p.id} className="checkbox-row">
            <input type="checkbox" checked={memberIds.includes(p.id)} onChange={() => toggle(p.id)} />
            {p.name}
          </label>
        ))}
      </fieldset>

      {error !== null && <p role="alert">{error}</p>}

      <div className="btn-row">
        <button type="button" className="btn btn--primary" onClick={() => { void submit(); }}>Save group</button>
        <button type="button" className="btn btn--secondary" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
