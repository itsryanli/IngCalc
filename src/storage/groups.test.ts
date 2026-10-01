import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from './db';
import { deleteGroup, listGroups, saveGroup } from './groups';
import { deleteProfile, saveProfile } from './profiles';
import type { Profile } from '../core/types';

const person = (id: string, name: string): Profile => ({
  id, name, sex: 'female', birthYear: 1990, heightCm: 160, weightKg: 55, sessionsPerWeek: 2, goal: 'maintain',
});

beforeEach(async () => {
  await db.profiles.clear();
  await db.groups.clear();
  await Promise.all([person('a', 'Ali'), person('b', 'Bea'), person('c', 'Cai')].map(saveProfile));
});

describe('groups', () => {
  it('lists groups by name', async () => {
    await saveGroup({ id: 'g2', name: 'Office', memberIds: ['a', 'b'] });
    await saveGroup({ id: 'g1', name: 'Family', memberIds: ['a', 'c'] });
    expect((await listGroups()).map((g) => g.name)).toEqual(['Family', 'Office']);
  });

  it('deletes a group without touching its members', async () => {
    await saveGroup({ id: 'g1', name: 'Family', memberIds: ['a', 'b'] });
    await deleteGroup('g1');
    expect(await db.groups.count()).toBe(0);
    expect(await db.profiles.count()).toBe(3);
  });

  it('takes a deleted profile out of its groups', async () => {
    await saveGroup({ id: 'g1', name: 'Family', memberIds: ['a', 'b', 'c'] });
    await deleteProfile('b');
    expect((await db.groups.get('g1'))!.memberIds).toEqual(['a', 'c']);
  });

  it('removes a group once its last member is deleted', async () => {
    await saveGroup({ id: 'g1', name: 'Solo', memberIds: ['a'] });
    await deleteProfile('a');
    expect(await db.groups.get('g1')).toBeUndefined();
  });
});
