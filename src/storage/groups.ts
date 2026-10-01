import { db } from './db';
import type { ProfileGroup } from '../core/types';

export const listGroups = async (): Promise<ProfileGroup[]> =>
  (await db.groups.toArray()).sort((a, b) => a.name.localeCompare(b.name));

export const saveGroup = async (g: ProfileGroup): Promise<void> => { await db.groups.put(g); };

export const deleteGroup = async (id: string): Promise<void> => { await db.groups.delete(id); };
