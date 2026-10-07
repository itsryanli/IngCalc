import { useMemo, useState } from 'react';
import { batchState, type BatchState } from '../../core/batch';
import type { Batch, CookSession, Ingredient } from '../../core/types';
import { AddBatchForm } from '../components/AddBatchForm';
import { BatchCard } from '../components/BatchCard';
import { CookSessionForm } from '../components/CookSessionForm';
import { MyIngredients } from '../components/MyIngredients';
import { DishForm, type DishMode } from '../components/DishForm';
import { ShoppingTripForm } from '../components/ShoppingTripForm';
import { STATE_LABELS } from '../labels';
import { recentIngredientIds } from '../../core/recent';
import { useCatalogue } from '../useCatalogue';
import { useKitchen } from '../useKitchen';
import { AddIngredientScreen } from './AddIngredientScreen';

/** Raw first, because that is what needs doing; finished last and collapsed. */
const GROUP_ORDER: BatchState[] = ['raw', 'partiallyCooked', 'cooked', 'finished'];

type View =
  | { kind: 'list' }
  // A new purchase: one or more items from one shopping trip.
  | { kind: 'tripForm' }
  // `initialIngredientId` carries an ingredient just created via the add-ingredient
  // flow back into the picker, so it is preselected rather than lost.
  | { kind: 'batchForm'; batch?: Batch; initialIngredientId?: string }
  | { kind: 'cookForm'; batch: Batch; session?: CookSession }
  // `batch` remembers which batch (if any) was being edited when "add a new
  // ingredient" was tapped, so cancelling or saving returns to that same form.
  | { kind: 'addIngredient'; typedName: string; batch?: Batch; searchOnline?: boolean }
  | { kind: 'editIngredient'; ingredient: Ingredient }
  | { kind: 'dishForm'; mode: DishMode; dish?: Ingredient };

export function KitchenScreen({ today = new Date() }: { today?: Date }) {
  const { catalogue, all, refresh: refreshCatalogue } = useCatalogue();
  const mine = useMemo(() => all.filter((i) => i.source === 'user'), [all]);
  const { batches, sessions, samples, entries, loading, storageError, refresh } = useKitchen();
  const [view, setView] = useState<View>({ kind: 'list' });
  const [showFinished, setShowFinished] = useState(false);

  const grouped = useMemo(() => {
    const out = new Map<BatchState, Batch[]>(GROUP_ORDER.map((s) => [s, []]));
    // Newest purchase first within each group: the thing you just bought is
    // the thing you are most likely to be looking for.
    const ordered = [...batches].sort((a, b) => b.createdAt - a.createdAt);
    for (const b of ordered) out.get(batchState(b, sessions, entries))!.push(b);
    return out;
  }, [batches, sessions, entries]);

  const recentIds = useMemo(
    () => recentIngredientIds(batches, sessions, entries), [batches, sessions, entries]);

  // Shops already used, most recent first, as suggestions for the next trip.
  const pastLocations = useMemo(() => {
    const seen = new Set<string>();
    for (const b of [...batches].sort((x, y) => y.createdAt - x.createdAt)) {
      const l = b.purchase.location.trim();
      if (l !== '') seen.add(l);
    }
    return [...seen];
  }, [batches]);

  // From every ingredient, archived ones included: archiving hides an ingredient
  // from new choices, not from the batches already bought.
  const ingredientFor = (batch: Batch) =>
    all.find((i) => i.id === batch.ingredientId) ?? null;

  const backToList = () => setView({ kind: 'list' });

  const afterChange = async () => {
    await refresh();
    backToList();
  };

  // The new ingredient is already persisted by the time onSaved fires, so its id is
  // real immediately. refreshCatalogue() re-merges storage into `catalogue` so the
  // picker can resolve that id to a name, but refresh() swallows storage errors (the
  // calculator's own catalogue must keep working offline) and so can't be awaited to
  // confirm success. Setting the id does not depend on that outcome: if the refresh
  // fails, the id is still selected, and the picker will show it as soon as a later
  // refresh succeeds instead of silently stranding the selection.
  const handleIngredientAdded = (added: Ingredient, forBatch: Batch | undefined) => {
    void refreshCatalogue();
    setView({ kind: 'batchForm', batch: forBatch, initialIngredientId: added.id });
  };

  if (view.kind === 'dishForm') {
    return (
      <section className="screen">
        <DishForm
          mode={view.mode}
          {...(view.dish === undefined ? {} : { dish: view.dish })}
          catalogue={catalogue}
          all={all}
          recentIds={recentIds}
          onSaved={() => { void refreshCatalogue(); backToList(); }}
          onCancel={backToList}
          onCatalogueChanged={() => { void refreshCatalogue(); }}
        />
      </section>
    );
  }

  if (view.kind === 'editIngredient') {
    return (
      <section className="screen">
        <AddIngredientScreen
          editing={view.ingredient}
          onSaved={() => { void refreshCatalogue(); void afterChange(); }}
          onCancel={backToList}
        />
      </section>
    );
  }

  if (view.kind === 'addIngredient') {
    return (
      <section className="screen">
        <AddIngredientScreen
          initialName={view.typedName}
          {...(view.searchOnline === true ? { searchFor: view.typedName } : {})}
          onSaved={(added) => handleIngredientAdded(added, view.batch)}
          onCancel={() => setView({ kind: 'batchForm', batch: view.batch })}
        />
      </section>
    );
  }

  if (view.kind === 'tripForm') {
    return (
      <section className="screen">
        <ShoppingTripForm
          recentIds={recentIds}
          catalogue={catalogue}
          pastLocations={pastLocations}
          today={today}
          onSaved={() => { void afterChange(); }}
          onCancel={backToList}
          onCatalogueChanged={() => { void refreshCatalogue(); }}
        />
      </section>
    );
  }

  if (view.kind === 'batchForm') {
    return (
      <section className="screen">
        <AddBatchForm
          recentIds={recentIds}
          catalogue={catalogue}
          batch={view.batch}
          sessions={sessions}
          initialIngredientId={view.initialIngredientId}
          today={today}
          onSaved={() => { void afterChange(); }}
          onCancel={backToList}
          onAddNew={(typedName, searchOnline) => setView({ kind: 'addIngredient', typedName, batch: view.batch, searchOnline })}
        />
      </section>
    );
  }

  if (view.kind === 'cookForm') {
    const ingredient = ingredientFor(view.batch);
    if (ingredient === null) {
      // Cooking needs the ingredient's yield and retention figures.
      return (
        <section className="screen">
          <p role="alert">
            This batch's ingredient is no longer in your list, so a cook cannot be
            worked out for it.
          </p>
          <button type="button" className="btn btn--secondary" onClick={backToList}>Back</button>
        </section>
      );
    }
    return (
      <section className="screen">
        <CookSessionForm
          batch={view.batch}
          ingredient={ingredient}
          sessions={sessions}
          samples={samples}
          entries={entries}
          session={view.session}
          today={today}
          onSaved={() => { void afterChange(); }}
          onCancel={backToList}
        />
      </section>
    );
  }

  const visibleGroups = GROUP_ORDER.filter(
    (s) => (grouped.get(s)!.length > 0) && (s !== 'finished' || showFinished),
  );
  const finishedCount = grouped.get('finished')!.length;

  return (
    <section className="screen">
      <h2>Kitchen</h2>

      {storageError !== null && <p role="alert" className="banner banner--warn">{storageError}</p>}

      <div className="btn-row">
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => setView({ kind: 'tripForm' })}
        >
          Log a purchase
        </button>
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => setView({ kind: 'dishForm', mode: 'new' })}
        >
          Make a dish
        </button>
      </div>

      {!loading && batches.length === 0 && storageError === null && (
        <p className="screen__hint" data-testid="kitchen-empty">
          Nothing in the kitchen yet. Log what you bought and this is where it
          lives until the last portion is eaten.
        </p>
      )}

      {visibleGroups.map((state) => (
        <div key={state} className="kitchen__group">
          <h3>{STATE_LABELS[state]}</h3>
          {grouped.get(state)!.map((b) => (
            <BatchCard
              key={b.id}
              batch={b}
              ingredient={ingredientFor(b)}
              sessions={sessions}
              entries={entries}
              onChanged={() => { void refresh(); }}
              onCook={(batch) => setView({ kind: 'cookForm', batch })}
              onEditBatch={(batch) => setView({ kind: 'batchForm', batch })}
              onEditSession={(batch, session) => setView({ kind: 'cookForm', batch, session })}
            />
          ))}
        </div>
      ))}

      {finishedCount > 0 && !showFinished && (
        <button type="button" className="btn btn--secondary" onClick={() => setShowFinished(true)}>
          Show finished ({finishedCount})
        </button>
      )}

      {showFinished && finishedCount > 0 && (
        <button type="button" className="btn btn--secondary" onClick={() => setShowFinished(false)}>
          Hide finished
        </button>
      )}

      <MyIngredients
        ingredients={mine}
        onEdit={(ingredient) => setView(ingredient.recipe === undefined
          ? { kind: 'editIngredient', ingredient }
          : { kind: 'dishForm', mode: 'edit', dish: ingredient })}
        onMakeAgain={(dish) => setView({ kind: 'dishForm', mode: 'again', dish })}
        onChanged={() => { void refreshCatalogue(); }}
      />
    </section>
  );
}
