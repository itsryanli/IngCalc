import { db, type Settings } from './db';

const DEFAULTS: Settings = {
  id: 'singleton',
  activeProfileId: null,
  landingTab: 'today',
  defaultWeightUnit: 'g',
};

export const getSettings = async (): Promise<Settings> =>
  (await db.settings.get('singleton')) ?? DEFAULTS;

export const saveSettings = async (s: Settings): Promise<void> => { await db.settings.put(s); };

/**
 * Read-modify-write rather than a whole-object put: settings is one singleton
 * row shared by every preference, so writing a fresh object built from
 * DEFAULTS would quietly reset `landingTab` and `defaultWeightUnit` every time
 * the user switched profile.
 */
export const setActiveProfile = async (id: string | null): Promise<void> => {
  await saveSettings({ ...(await getSettings()), activeProfileId: id });
};
