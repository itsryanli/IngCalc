import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AddIngredientScreen } from './AddIngredientScreen';
import { zeroNutrients } from '../../core/nutrients';
import { db } from '../../storage/db';
import * as userIngredientsModule from '../../storage/userIngredients';
import * as offModule from '../../online/openFoodFacts';

beforeEach(async () => { await db.userIngredients.clear(); });

describe('AddIngredientScreen', () => {
  it('prefills the name from the failed search', () => {
    render(<AddIngredientScreen initialName="Petai" onSaved={vi.fn()} />);
    expect(screen.getByLabelText(/^name$/i)).toHaveValue('Petai');
  });

  it('saves a user ingredient marked as user-sourced', async () => {
    const onSaved = vi.fn();
    render(<AddIngredientScreen initialName="Petai" onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText(/^energy/i), { target: { value: '140' } });
    fireEvent.change(screen.getByLabelText(/^protein/i), { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const saved = await db.userIngredients.toArray();
    expect(saved).toHaveLength(1);
    expect(saved[0]!.source).toBe('user');
    expect(saved[0]!.per100gRaw.protein).toBe(6);
    expect(saved[0]!.archived).toBe(false);
  });

  it('requires a name', async () => {
    render(<AddIngredientScreen initialName="" onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/name/i);
  });

  it('rejects a negative nutrient value', async () => {
    render(<AddIngredientScreen initialName="Petai" onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/^protein/i), { target: { value: '-3' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/negative/i);
  });

  it('defaults unfilled nutrients to zero rather than leaving them undefined', async () => {
    const onSaved = vi.fn();
    render(<AddIngredientScreen initialName="Petai" onSaved={onSaved} />);
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const saved = (await db.userIngredients.toArray())[0]!;
    expect(saved.per100gRaw.magnesium).toBe(0);
  });

  it('records a blank nutrient as not known, keeping 0 only for the sums', async () => {
    const onSaved = vi.fn();
    render(<AddIngredientScreen initialName="Petai" onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText(/^protein/i), { target: { value: '6' } });
    fireEvent.change(screen.getByLabelText(/^sodium/i), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const saved = (await db.userIngredients.toArray())[0]!;
    expect(saved.unknownNutrients).toContain('iron');
    expect(saved.unknownNutrients).not.toContain('protein');
    // Typed as 0 means really zero, not unknown.
    expect(saved.unknownNutrients).not.toContain('sodium');
  });

  it('rejects non-numeric nutrient input and does not save', async () => {
    const onSaved = vi.fn();
    render(<AddIngredientScreen initialName="Petai" onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText(/^protein/i), { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/must be a number/i);
    expect(onSaved).not.toHaveBeenCalled();
    const saved = await db.userIngredients.toArray();
    expect(saved).toHaveLength(0);
  });

  it('rejects whitespace-only name like empty name', async () => {
    render(<AddIngredientScreen initialName="   " onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/name/i);
  });

  it('has no Cancel button when no onCancel is given', () => {
    render(<AddIngredientScreen initialName="Petai" onSaved={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();
  });

  it('calls onCancel and does not save when Cancel is clicked', async () => {
    const onCancel = vi.fn();
    const onSaved = vi.fn();
    render(<AddIngredientScreen initialName="Petai" onSaved={onSaved} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSaved).not.toHaveBeenCalled();
    expect(await db.userIngredients.toArray()).toHaveLength(0);
  });

  it('treats whitespace-only nutrient field as unfilled default', async () => {
    const onSaved = vi.fn();
    render(<AddIngredientScreen initialName="Petai" onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText(/^protein/i), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const saved = (await db.userIngredients.toArray())[0]!;
    expect(saved.per100gRaw.protein).toBe(0);
  });

  it('shows a plain-language error and does not call onSaved when saving fails', async () => {
    // Dexie can reject (private browsing, quota, a blocked upgrade). Without a try/catch
    // around the save, that rejection is unhandled, onSaved never fires, and the user taps
    // Save to absolutely nothing: no error, no navigation, form unchanged.
    const onSaved = vi.fn();
    const spy = vi
      .spyOn(userIngredientsModule, 'saveUserIngredient')
      .mockRejectedValue(new Error('storage unavailable'));
    try {
      render(<AddIngredientScreen initialName="Petai" onSaved={onSaved} />);
      fireEvent.click(screen.getByRole('button', { name: /save/i }));
      expect(await screen.findByRole('alert')).toHaveTextContent(/could not save/i);
      expect(onSaved).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  describe('fill in from a nutrition label', () => {
    const LABEL = 'Per 100 g   Per serving (30 g)\nEnergy 1580 kJ (378 kcal) 474 kJ (113 kcal)\nProtein 12.5 g 3.8 g\nFat 10 g 3 g\nCarbohydrate 60.1 g 18 g';

    const paste = (text: string) => {
      fireEvent.change(screen.getByLabelText(/label text/i), { target: { value: text } });
      fireEvent.click(screen.getByRole('button', { name: /fill in values/i }));
    };

    it('fills the form from pasted label text and lists what the label did not give', () => {
      render(<AddIngredientScreen initialName="Oat crackers" onSaved={vi.fn()} />);
      paste(LABEL);
      expect(screen.getByLabelText(/^energy/i)).toHaveValue('378');
      expect(screen.getByLabelText(/^protein/i)).toHaveValue('12.5');
      expect(screen.getByLabelText(/^fat/i)).toHaveValue('10');
      expect(screen.getByLabelText(/^carbohydrate/i)).toHaveValue('60.1');
      const status = screen.getByRole('status');
      expect(status).toHaveTextContent(/filled in 4 values from the per 100 g column/i);
      expect(status).toHaveTextContent(/not on the label.*fibre, potassium/i);
    });

    it('replaces earlier values rather than mixing two labels', () => {
      render(<AddIngredientScreen initialName="x" onSaved={vi.fn()} />);
      fireEvent.change(screen.getByLabelText(/^sodium/i), { target: { value: '999' } });
      paste(LABEL);
      expect(screen.getByLabelText(/^sodium/i)).toHaveValue('');
    });

    it('leaves the form alone and says so when nothing is found', () => {
      render(<AddIngredientScreen initialName="x" onSaved={vi.fn()} />);
      fireEvent.change(screen.getByLabelText(/^protein/i), { target: { value: '7' } });
      paste('just some words');
      expect(screen.getByRole('status')).toHaveTextContent(/no nutrition values were found/i);
      expect(screen.getByLabelText(/^protein/i)).toHaveValue('7');
    });

    it('shows the parser notes, such as a per-serving conversion', () => {
      render(<AddIngredientScreen initialName="x" onSaved={vi.fn()} />);
      paste('Serving size 1 piece\nAmount per serving\nProtein 3 g');
      expect(screen.getByRole('status')).toHaveTextContent(/no serving size in grams/i);
    });

    it('saves label values only when the person taps Save, recording the label as the source', async () => {
      const onSaved = vi.fn();
      render(<AddIngredientScreen initialName="Oat crackers" onSaved={onSaved} />);
      paste(LABEL);
      expect(await db.userIngredients.count()).toBe(0);
      fireEvent.click(screen.getByRole('button', { name: /save/i }));
      await waitFor(() => expect(onSaved).toHaveBeenCalled());
      const saved = (await db.userIngredients.toArray())[0]!;
      expect(saved.per100gRaw.protein).toBe(12.5);
      expect(saved.per100gRaw.potassium).toBe(0);
      expect(saved.sourceRef).toBe('Nutrition label');
    });

    it('highlights each value that came from the label until it is edited', () => {
      render(<AddIngredientScreen initialName="x" onSaved={vi.fn()} />);
      paste(LABEL);
      expect(screen.getByLabelText(/^protein/i).closest('.field')).toHaveClass('field--from-label');
      expect(screen.getAllByText(/from label/i)).toHaveLength(4);
      expect(screen.getByLabelText(/^sodium/i).closest('.field')).not.toHaveClass('field--from-label');

      fireEvent.change(screen.getByLabelText(/^protein/i), { target: { value: '12' } });
      expect(screen.getByLabelText(/^protein/i).closest('.field')).not.toHaveClass('field--from-label');
      expect(screen.getAllByText(/from label/i)).toHaveLength(3);
    });

    it('marks a label food as eaten without cooking, which can be unticked', async () => {
      const onSaved = vi.fn();
      render(<AddIngredientScreen initialName="Crackers" onSaved={onSaved} />);
      paste(LABEL);
      const box = screen.getByLabelText(/usually eaten without cooking/i);
      expect(box).toBeChecked();
      fireEvent.click(screen.getByRole('button', { name: /save/i }));
      await waitFor(() => expect(onSaved).toHaveBeenCalled());
      expect((await db.userIngredients.toArray())[0]!.defaultMethod).toBe('asIs');
    });

    it('saves no usual method when the box is left unticked', async () => {
      const onSaved = vi.fn();
      render(<AddIngredientScreen initialName="Petai" onSaved={onSaved} />);
      expect(screen.getByLabelText(/usually eaten without cooking/i)).not.toBeChecked();
      fireEvent.click(screen.getByRole('button', { name: /save/i }));
      await waitFor(() => expect(onSaved).toHaveBeenCalled());
      expect((await db.userIngredients.toArray())[0]!.defaultMethod).toBeUndefined();
    });

    it('records no source when the values were typed in', async () => {
      const onSaved = vi.fn();
      render(<AddIngredientScreen initialName="Petai" onSaved={onSaved} />);
      fireEvent.click(screen.getByRole('button', { name: /save/i }));
      await waitFor(() => expect(onSaved).toHaveBeenCalled());
      expect((await db.userIngredients.toArray())[0]!.sourceRef).toBeUndefined();
    });
  });

  describe('editing', () => {
    const crackers = {
      id: 'my-crackers', name: 'Oat crackers', category: 'other' as const,
      per100gRaw: { ...zeroNutrients(), kcal: 400, protein: 1.25 }, publishedYield: {},
      absorbsWater: false, defaultMethod: 'asIs' as const, source: 'user' as const,
      sourceRef: 'Nutrition label', archived: false,
    };

    it('shows an unknown nutrient as blank, not 0, when editing', () => {
      render(<AddIngredientScreen editing={{ ...crackers, unknownNutrients: ['iron'] }} onSaved={vi.fn()} />);
      expect(screen.getByLabelText(/^iron/i)).toHaveValue('');
      expect(screen.getByLabelText(/^zinc/i)).toHaveValue('0');
    });

    it('starts from what was saved and says edits reach past meals', () => {
      render(<AddIngredientScreen editing={crackers} onSaved={vi.fn()} />);
      expect(screen.getByRole('heading', { name: 'Edit Oat crackers' })).toBeInTheDocument();
      expect(screen.getByLabelText(/^protein/i)).toHaveValue('1.25');
      expect(screen.getByLabelText(/usually eaten without cooking/i)).toBeChecked();
      expect(screen.getByText(/including meals already logged/i)).toBeInTheDocument();
    });

    it('saves a correction under the same id, keeping where the values came from', async () => {
      await db.userIngredients.put(crackers);
      const onSaved = vi.fn();
      render(<AddIngredientScreen editing={crackers} onSaved={onSaved} />);
      fireEvent.change(screen.getByLabelText(/^protein/i), { target: { value: '12.5' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
      await waitFor(() => expect(onSaved).toHaveBeenCalled());
      const all = await db.userIngredients.toArray();
      expect(all).toHaveLength(1);
      expect(all[0]).toMatchObject({ id: 'my-crackers', sourceRef: 'Nutrition label', defaultMethod: 'asIs' });
      expect(all[0]!.per100gRaw.protein).toBe(12.5);
    });

    it('drops "not cooked" as the usual method when unticked', async () => {
      const onSaved = vi.fn();
      render(<AddIngredientScreen editing={crackers} onSaved={onSaved} />);
      fireEvent.click(screen.getByLabelText(/usually eaten without cooking/i));
      fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
      await waitFor(() => expect(onSaved).toHaveBeenCalled());
      expect((await db.userIngredients.get('my-crackers'))!.defaultMethod).toBeUndefined();
    });
  });

  describe('search online', () => {
    const milo = {
      code: '9556001', name: 'Milo Kotak', brand: 'Nestlé', quantity: '200 ml', perMl: true,
      values: { kcal: 70, protein: 2.1, carbs: 11, fat: 1.6, sodium: 45 },
    };

    it('searches straight away when asked from the picker, and fills the form from a result', async () => {
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
      const search = vi.spyOn(offModule, 'searchOpenFoodFacts').mockResolvedValue({ ok: true, foods: [milo] });
      const onSaved = vi.fn();
      render(<AddIngredientScreen initialName="milo kotak" searchFor="milo kotak" onSaved={onSaved} />);
      expect(search).toHaveBeenCalledWith('milo kotak');

      fireEvent.click(await screen.findByRole('button', { name: /milo kotak/i }));
      expect(screen.getByLabelText(/^name$/i)).toHaveValue('Milo Kotak (Nestlé)');
      expect(screen.getByLabelText(/^protein/i)).toHaveValue('2.1');
      expect(screen.getAllByText(/from search/i)).toHaveLength(5);
      expect(screen.getByLabelText(/usually eaten without cooking/i)).toBeChecked();
      expect(screen.getByRole('status')).toHaveTextContent(/per 100 ml, used as per 100 g/);

      fireEvent.click(screen.getByRole('button', { name: /save ingredient/i }));
      await waitFor(() => expect(onSaved).toHaveBeenCalled());
      const saved = (await db.userIngredients.toArray())[0]!;
      expect(saved).toMatchObject({ sourceRef: 'Open Food Facts 9556001', defaultMethod: 'asIs' });
      expect(saved.unknownNutrients).toContain('iron');
      search.mockRestore();
    });

    it('does not contact anything until asked', () => {
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
      const search = vi.spyOn(offModule, 'searchOpenFoodFacts');
      render(<AddIngredientScreen initialName="Petai" onSaved={vi.fn()} />);
      expect(screen.getByText('Search online')).toBeInTheDocument();
      expect(search).not.toHaveBeenCalled();
      search.mockRestore();
    });

    it('says when the search fails, and is hidden entirely offline', async () => {
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
      const search = vi.spyOn(offModule, 'searchOpenFoodFacts')
        .mockResolvedValue({ ok: false, message: "Couldn't reach Open Food Facts. Check your connection and try again." });
      const { unmount } = render(<AddIngredientScreen initialName="milo" searchFor="milo" onSaved={vi.fn()} />);
      expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't reach Open Food Facts");
      unmount();
      search.mockRestore();

      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
      render(<AddIngredientScreen initialName="milo" onSaved={vi.fn()} />);
      expect(screen.queryByText('Search online')).not.toBeInTheDocument();
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    });
  });
});
