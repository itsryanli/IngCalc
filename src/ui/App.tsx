import { useEffect, useRef, useState } from 'react';
import type { Profile } from '../core/types';
import { isStorageAvailable } from '../storage/db';
import { listProfiles } from '../storage/profiles';
import { getSettings } from '../storage/settings';
import { CalcScreen } from './screens/CalcScreen';
import { ProfileScreen } from './screens/ProfileScreen';

type Tab = 'today' | 'kitchen' | 'calc' | 'costs' | 'profile';

const TABS: { id: Tab; label: string; phase?: number }[] = [
  { id: 'today', label: 'Today', phase: 3 },
  { id: 'kitchen', label: 'Kitchen', phase: 2 },
  { id: 'calc', label: 'Calc' },
  { id: 'costs', label: 'Costs', phase: 4 },
  { id: 'profile', label: 'Profile' },
];

/** Tabs that actually exist in Phase 1. A stored preference for any other tab falls back to Calc. */
const BUILT: readonly Tab[] = ['calc', 'profile'];

export function App() {
  const [tab, setTab] = useState<Tab>('calc');
  const [profile, setProfile] = useState<Profile | null>(null);
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

      const [settings, profiles] = await Promise.all([getSettings(), listProfiles()]);
      if (cancelled) return;
      if (!userNavigated.current) {
        setTab(BUILT.includes(settings.landingTab) ? settings.landingTab : 'calc');
      }
      setProfile(profiles[0] ?? null);
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
        {tab === 'calc' && <CalcScreen profile={profile} />}
        {tab === 'profile' && <ProfileScreen onSaved={(p) => { setProfile(p); setTab('calc'); }} />}
      </main>

      <nav role="tablist" className="tabbar">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            className="tab"
            aria-selected={tab === t.id}
            disabled={t.phase !== undefined}
            title={t.phase !== undefined ? `Arrives in Phase ${t.phase}` : undefined}
            onClick={() => selectTab(t.id)}
          >
            <span>{t.label}</span>
            {t.phase !== undefined && (
              <span className="tab__phase" aria-hidden="true">Phase {t.phase}</span>
            )}
          </button>
        ))}
      </nav>
    </div>
  );
}
