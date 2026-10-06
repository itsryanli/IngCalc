import { useEffect, useId, useRef, useState } from 'react';
import type { Ingredient } from '../../core/types';
import { rankIngredients } from '../rankIngredients';


interface Props {
  catalogue: readonly Ingredient[];
  /** Currently selected ingredient id, or '' for none. */
  value: string;
  onChange: (id: string) => void;
  /** Opens the add-ingredient flow, seeded with whatever the user had typed. */
  onAddNew: (initialName: string) => void;
  /** Recently used ingredient ids, newest first: listed at the top before anything is typed. */
  recentIds?: readonly string[];
}

export function IngredientPicker({ catalogue, value, onChange, onAddNew, recentIds = [] }: Props) {
  const inputId = useId();
  const listId = useId();
  const selected = catalogue.find((i) => i.id === value) ?? null;

  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);

  // While closed the field shows the chosen ingredient; while open it shows what
  // is being typed. Re-syncing on `value` keeps an externally-set selection (the
  // add-ingredient flow auto-selects) visible in the field.
  const display = open ? query : (selected?.name ?? '');

  const typed = open ? query.trim() : '';
  // Before anything is typed, recent ingredients come first; once typing starts
  // the ranking alone decides, so a search is never pushed down by history.
  const recent = typed === ''
    ? recentIds.flatMap((id) => catalogue.filter((i) => i.id === id))
    : [];
  const matches = [
    ...recent,
    ...rankIngredients(catalogue, typed).filter((i) => !recent.includes(i)),
  ];
  const addLabel = query.trim() === '' ? 'Add a new ingredient' : `Add "${query.trim()}"`;
  // The add row is always last, so its index is the match count.
  const addIndex = matches.length;

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (wrapRef.current !== null && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [open]);

  const choose = (index: number) => {
    if (index === addIndex) {
      setOpen(false);
      onAddNew(query.trim());
      return;
    }
    const picked = matches[index];
    if (picked === undefined) return;
    setOpen(false);
    setQuery('');
    onChange(picked.id);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) { setOpen(true); return; }
      const last = addIndex;
      setActiveIndex((i) => {
        if (e.key === 'ArrowDown') return i >= last ? 0 : i + 1;
        return i <= 0 ? last : i - 1;
      });
      return;
    }
    if (e.key === 'Enter' && open && activeIndex >= 0) {
      e.preventDefault();
      choose(activeIndex);
    }
  };

  return (
    <div className="field picker" ref={wrapRef}>
      <label htmlFor={inputId}>Ingredient</label>
      <input
        id={inputId}
        type="text"
        role="combobox"
        autoComplete="off"
        placeholder="Type to search, or browse the list"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
        value={display}
        onFocus={() => { setOpen(true); setActiveIndex(-1); }}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); setActiveIndex(-1); }}
        onKeyDown={onKeyDown}
      />

      {open && (
        <ul className="picker__list" id={listId} role="listbox" aria-label="Ingredient">
          {matches.map((ing, i) => (
            <li
              key={ing.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={ing.id === value}
              className={`picker__option${i === activeIndex ? ' is-active' : ''}`}
              // mousedown rather than click: the input's blur would otherwise close
              // the list before the click landed.
              onMouseDown={(e) => { e.preventDefault(); choose(i); }}
            >
              {ing.name}
              {i < recent.length && <span className="picker__tag" aria-hidden="true">Recent</span>}
            </li>
          ))}

          <li
            id={`${listId}-${addIndex}`}
            role="option"
            aria-selected={false}
            className={`picker__option picker__option--add${addIndex === activeIndex ? ' is-active' : ''}`}
            onMouseDown={(e) => { e.preventDefault(); choose(addIndex); }}
          >
            {addLabel}
          </li>
        </ul>
      )}
    </div>
  );
}
