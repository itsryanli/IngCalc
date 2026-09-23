import { useEffect, useRef, useState } from 'react';
import { isStorageAvailable } from '../storage/db';
import { getSettings } from '../storage/settings';
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

      // Profiles are `useProfiles`' job; this only needs the landing tab.
      const settings = await getSettings();
      if (cancelled) return;
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

  return (
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

      {storageOk && profile === null && tab === 'calc' && (
        <p className="banner banner--info">
          Set up a profile to see what a portion is worth against your daily targets.
        </p>
      )}

      <main className="app__main">
        <ErrorBoundary resetKey={tab} onReset={() => selectTab('log')}>
          {tab === 'log' && <LogScreen profile={profile} />}
          {tab === 'kitchen' && <KitchenScreen />}
          {tab === 'calc' && <CalcScreen profile={profile} />}
          {tab === 'costs' && (
            <CostsScreen profiles={profiles} onDataReplaced={() => { void refresh(); }} />
          )}
          {tab === 'profile' && (
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
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            className="tab"
            aria-selected={tab === t.id}
            onClick={() => selectTab(t.id)}
          >
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
