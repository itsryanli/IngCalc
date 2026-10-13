import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isStorageAvailable } from '../storage/db';
import { getSettings, updateSettings } from '../storage/settings';
import type { HideableTab, Settings } from '../core/types';
import { AppPrefsContext, prefsFrom, type AppPrefs } from './features';
import { requestPersistence } from '../storage/persistence';
import { useProfiles } from './useProfiles';
import { ErrorBoundary } from './components/ErrorBoundary';
import { CalcScreen } from './screens/CalcScreen';
import { CostsScreen } from './screens/CostsScreen';
import { KitchenScreen } from './screens/KitchenScreen';
import { LogScreen } from './screens/LogScreen';
import { ProfileScreen } from './screens/ProfileScreen';

type Tab = 'log' | 'kitchen' | 'calc' | 'costs' | 'profile';

const TABS: { id: Tab; label: string }[] = [
  { id: 'log', label: 'Log' },
  { id: 'kitchen', label: 'Kitchen' },
  { id: 'calc', label: 'Calc' },
  { id: 'costs', label: 'Costs' },
  { id: 'profile', label: 'Profile' },
];

/** Tabs that actually exist. A stored preference for any other tab falls back to Log. */
const BUILT: readonly Tab[] = ['log', 'kitchen', 'calc', 'costs', 'profile'];

export function App() {
  const [tab, setTab] = useState<Tab>('log');
  const { profiles, active: profile, storageError, refresh, setActive } = useProfiles();
  const [storageOk, setStorageOk] = useState(true);
  const [prefs, setPrefs] = useState<Pick<Settings, 'hiddenTabs' | 'featuresOff' | 'landingTab'>>({ landingTab: 'log' });
  // Guards against the initial settings load clobbering a tab the user has
  // already clicked while that load was still in flight.
  const userNavigated = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const ok = await isStorageAvailable();
      if (cancelled) return;
      setStorageOk(ok);
      if (!ok) return;
      void requestPersistence();

      // Profiles are `useProfiles`' job; this only needs the landing tab.
      const settings = await getSettings();
      if (cancelled) return;
      setPrefs({ hiddenTabs: settings.hiddenTabs, featuresOff: settings.featuresOff, landingTab: settings.landingTab });
      if (!userNavigated.current) {
        setTab(BUILT.includes(settings.landingTab) ? settings.landingTab : 'log');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const selectTab = (id: Tab) => {
    userNavigated.current = true;
    setTab(id);
  };

  const update = useCallback<AppPrefs['update']>(async (patch) => {
    // Applied at once, then saved: a storage failure still leaves this session as chosen.
    setPrefs((p) => ({ ...p, ...patch }));
    try { await updateSettings(patch); } catch { /* the choice still holds until the app closes */ }
  }, []);
  const appPrefs = useMemo(() => prefsFrom(prefs, update), [prefs, update]);
  const hidden = (id: Tab) => (prefs.hiddenTabs ?? []).includes(id as HideableTab);
  const shownTabs = TABS.filter((t) => !hidden(t.id));
  // A tab hidden while open, or a hidden landing tab, falls back to Calc, which is never hidden.
  const current: Tab = hidden(tab) ? 'calc' : tab;

  return (
    <AppPrefsContext.Provider value={appPrefs}>
    <div className="app">
      <header className="app__header">
        <h1>IngCalc</h1>
        {profile !== null && <span className="app__profile">{profile.name}</span>}
      </header>

      {!storageOk && (
        <p role="alert" className="banner--warn">
          This browser will not let the app save anything — private browsing blocks storage.
          You can still use the calculator, but profiles and ingredients you add will be lost
          when you close the tab.
        </p>
      )}

      {storageOk && profile === null && current === 'calc' && (
        <p className="banner banner--info">
          Set up a profile to see what a portion is worth against your daily targets.
        </p>
      )}

      <main className="app__main">
        <ErrorBoundary resetKey={current} onReset={() => selectTab('log')}>
          {current === 'log' && <LogScreen profile={profile} profiles={profiles} />}
          {current === 'kitchen' && <KitchenScreen />}
          {current === 'calc' && <CalcScreen profile={profile} />}
          {current === 'costs' && (
            <CostsScreen profiles={profiles} onDataReplaced={() => { void refresh(); }} />
          )}
          {current === 'profile' && (
            <ProfileScreen
              profiles={profiles}
              activeId={profile?.id ?? null}
              storageError={storageError}
              onSetActive={(id) => { void setActive(id); }}
              onChanged={() => { void refresh(); }}
            />
          )}
        </ErrorBoundary>
      </main>

      <nav role="tablist" className="tabbar">
        {shownTabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            className="tab"
            aria-selected={current === t.id}
            onClick={() => selectTab(t.id)}
          >
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
    </AppPrefsContext.Provider>
  );
}
