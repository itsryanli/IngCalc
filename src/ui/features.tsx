import { createContext, useContext } from 'react';
import type { FeatureKey, HideableTab, Settings } from '../core/types';

export interface AppPrefs {
  /** True unless the person switched this feature off. */
  on: (feature: FeatureKey) => boolean;
  hiddenTabs: readonly HideableTab[];
  landingTab: Settings['landingTab'];
  /** Saves a change and applies it straight away. */
  update: (patch: Partial<Pick<Settings, 'hiddenTabs' | 'featuresOff' | 'landingTab'>>) => Promise<void>;
}

/** Everything on, every tab shown: what a fresh install and every test sees. */
export const DEFAULT_PREFS: AppPrefs = {
  on: () => true,
  hiddenTabs: [],
  landingTab: 'log',
  update: async () => {},
};

export const AppPrefsContext = createContext<AppPrefs>(DEFAULT_PREFS);

export const useAppPrefs = (): AppPrefs => useContext(AppPrefsContext);

export const prefsFrom = (
  s: Pick<Settings, 'hiddenTabs' | 'featuresOff' | 'landingTab'>,
  update: AppPrefs['update'],
): AppPrefs => ({
  on: (f) => !(s.featuresOff ?? []).includes(f),
  hiddenTabs: s.hiddenTabs ?? [],
  landingTab: s.landingTab,
  update,
});
