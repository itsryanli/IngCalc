import { useId } from 'react';
import { FEATURE_KEYS, HIDEABLE_TABS, LANDING_TABS, type FeatureKey, type HideableTab } from '../../core/types';
import { useAppPrefs } from '../features';

const TAB_INFO: Record<HideableTab, { label: string; what: string }> = {
  log: { label: 'Log', what: 'What you ate each day against your calorie and protein targets.' },
  kitchen: { label: 'Kitchen', what: 'Purchases, cooking and portions; also your own ingredients and dishes.' },
  costs: { label: 'Costs', what: 'What you spent and protein per RM; CSV export and backups.' },
};

const FEATURE_INFO: Record<FeatureKey, { label: string; what: string }> = {
  labelPaste: { label: 'Fill in from a nutrition label', what: 'Paste or scan a label\'s text when adding an ingredient.' },
  onlineSearch: {
    label: 'Search online',
    what: 'Look foods up on Open Food Facts when you\'re online. Only the name you type is sent.',
  },
  dishes: { label: 'Make a dish', what: 'Work out a homemade dish, like bread, from what went in. On the Kitchen tab.' },
  week: { label: 'Your last 7 days', what: 'Protein dots, averages, spending and best buys on the Log.' },
};

const LANDING_LABELS: Record<(typeof LANDING_TABS)[number], string> = { log: 'Log', kitchen: 'Kitchen', calc: 'Calc' };

/**
 * Lets the person shape the app around how they use it: which tab it opens
 * on, which tabs show, and which optional features are on. Everything is on
 * until switched off, and every change applies straight away.
 */
export function AppSettings() {
  const ids = useId();
  const prefs = useAppPrefs();
  const hidden = new Set(prefs.hiddenTabs);
  const landingChoices = LANDING_TABS.filter((t) => !hidden.has(t as HideableTab));

  const toggleTab = (t: HideableTab, show: boolean) => {
    const hiddenTabs = show ? prefs.hiddenTabs.filter((x) => x !== t) : [...prefs.hiddenTabs, t];
    // Hiding the tab the app opens on moves the opening tab to Calc, which never hides.
    void prefs.update({ hiddenTabs, ...(!show && prefs.landingTab === t ? { landingTab: 'calc' as const } : {}) });
  };
  const toggleFeature = (f: FeatureKey, on: boolean) => {
    const off = FEATURE_KEYS.filter((k) => (k === f ? !on : !prefs.on(k)));
    void prefs.update({ featuresOff: off });
  };

  return (
    <section className="card app-settings" aria-labelledby={`${ids}-title`}>
      <h3 className="card__title" id={`${ids}-title`}>Your app</h3>
      <p className="screen__hint">Show only what you use. Changes apply straight away, and nothing is deleted.</p>

      <div className="field">
        <label htmlFor={`${ids}-landing`}>Open the app on</label>
        <select id={`${ids}-landing`} value={landingChoices.includes(prefs.landingTab) ? prefs.landingTab : 'calc'}
                onChange={(e) => { void prefs.update({ landingTab: e.target.value as (typeof LANDING_TABS)[number] }); }}>
          {landingChoices.map((t) => <option key={t} value={t}>{LANDING_LABELS[t]}</option>)}
        </select>
      </div>

      <fieldset>
        <legend>Tabs</legend>
        <p className="screen__hint app-settings__note">Calc and Profile are always shown.</p>
        {HIDEABLE_TABS.map((t) => (
          <label key={t} className="checkbox-row app-settings__row">
            <input type="checkbox" checked={!hidden.has(t)} onChange={(e) => toggleTab(t, e.target.checked)} />
            <span>
              <span className="app-settings__name">{TAB_INFO[t].label}</span>
              <span className="app-settings__what">{TAB_INFO[t].what}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <fieldset>
        <legend>Features</legend>
        {FEATURE_KEYS.map((f) => (
          <label key={f} className="checkbox-row app-settings__row">
            <input type="checkbox" checked={prefs.on(f)} onChange={(e) => toggleFeature(f, e.target.checked)} />
            <span>
              <span className="app-settings__name">{FEATURE_INFO[f].label}</span>
              <span className="app-settings__what">{FEATURE_INFO[f].what}</span>
            </span>
          </label>
        ))}
        {hidden.has('kitchen') && prefs.on('dishes') && (
          <p className="screen__hint app-settings__note">Make a dish and My ingredients live on the Kitchen tab, which is hidden.</p>
        )}
      </fieldset>
    </section>
  );
}
