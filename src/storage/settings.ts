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
