import { db } from './db';
import type { Profile } from '../core/types';

export const listProfiles = (): Promise<Profile[]> => db.profiles.toArray();
export const saveProfile = async (p: Profile): Promise<void> => { await db.profiles.put(p); };
export const deleteProfile = async (id: string): Promise<void> => { await db.profiles.delete(id); };
