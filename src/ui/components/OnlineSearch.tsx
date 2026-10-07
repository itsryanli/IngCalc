import { useEffect, useId, useRef, useState } from 'react';
import { knownCount, type OffFood } from '../../core/openFoodFacts';
import { searchOpenFoodFacts } from '../../online/openFoodFacts';
import { useOnline } from '../useOnline';

type State =
  | { kind: 'idle' }
  | { kind: 'searching' }
  | { kind: 'done'; foods: OffFood[] }
  | { kind: 'failed'; message: string };

const round = (n: number | undefined, places = 1) =>
  n === undefined ? '?' : n.toLocaleString('en-MY', { maximumFractionDigits: places });

/**
 * Looks a food up on Open Food Facts. Shown only while the phone is online,
 * and it contacts nothing until Search is tapped. Choosing a result fills the
 * form below for checking; nothing is saved from here.
 */
export function OnlineSearch({ initialQuery, autoSearch, onPick }: {
  initialQuery: string;
  /** Search straight away: the person already asked for it from the picker. */
  autoSearch: boolean;
  onPick: (food: OffFood) => void;
}) {
  const ids = useId();
  const online = useOnline();
  const [query, setQuery] = useState(initialQuery);
  const [state, setState] = useState<State>({ kind: 'idle' });
  const searched = useRef(false);

  const search = async (q: string) => {
    setState({ kind: 'searching' });
    const r = await searchOpenFoodFacts(q);
    setState(r.ok ? { kind: 'done', foods: r.foods } : { kind: 'failed', message: r.message });
  };

  useEffect(() => {
    if (!autoSearch || searched.current || !online || initialQuery.trim() === '') return;
    searched.current = true;
    void search(initialQuery);
  }, [autoSearch, online, initialQuery]);

  if (!online) return null;

  return (
    <details className="label-paste online-search" open={autoSearch}>
      <summary>Search online</summary>
      <p className="screen__hint">
        Looks the name up on Open Food Facts, a free database of packaged foods. Only what you
        type is sent; nothing else leaves your phone. Café and restaurant menus are rarely in it.
      </p>
      <form
        className="online-search__form"
        onSubmit={(e) => { e.preventDefault(); void search(query); }}
      >
        <div className="field">
          <label htmlFor={`${ids}-q`}>Food or product name</label>
          <input id={`${ids}-q`} type="search" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <button type="submit" className="btn btn--secondary" disabled={query.trim() === '' || state.kind === 'searching'}>
          {state.kind === 'searching' ? 'Searching…' : 'Search'}
        </button>
      </form>

      {state.kind === 'failed' && <p role="alert" className="banner banner--warn online-search__note">{state.message}</p>}
      {state.kind === 'done' && state.foods.length === 0 && (
        <p role="status" className="banner banner--warn online-search__note">
          Nothing found. Try fewer words, the brand name, or fill it in from the label instead.
        </p>
      )}
      {state.kind === 'done' && state.foods.length > 0 && (
        <ul className="online-search__results" aria-label="Search results">
          {state.foods.map((f) => {
            const usable = knownCount(f) > 0;
            return (
              <li key={f.code}>
                <button type="button" className="online-search__result" disabled={!usable} onClick={() => onPick(f)}>
                  <span className="online-search__name">{f.name}</span>
                  <span className="online-search__meta">
                    {[f.brand, f.quantity].filter((s) => s !== '').join(' · ')}
                  </span>
                  <span className="online-search__meta">
                    {usable
                      ? `Per 100 ${f.perMl ? 'ml' : 'g'}: ${round(f.values.kcal, 0)} kcal · ${round(f.values.protein)} g protein`
                      : 'No nutrition figures listed'}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </details>
  );
}
