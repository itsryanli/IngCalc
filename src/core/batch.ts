import type { Batch, CookSession } from './types';
import { g, type Grams } from './units';

/**
 * Half a hundredth of a gram. Weights arrive from division (portion weights)
 * and from user input in kilograms, so exact comparison would report a sliver
 * of raw meat left on a batch that was entirely cooked.
 */
export const EPSILON = 0.005;

export type BatchState = 'raw' | 'partiallyCooked' | 'cooked' | 'finished';

export const sessionsOf = (
  batchId: string,
  sessions: readonly CookSession[],
): CookSession[] => sessions.filter((s) => s.batchId === batchId);

export function rawRemainingG(batch: Batch, sessions: readonly CookSession[]): Grams {
  const used = sessionsOf(batch.id, sessions).reduce((sum, s) => sum + s.rawUsedG, 0);
  return g(Math.max(0, batch.rawWeightG - used));
}

/**
 * Never stored, per the parent spec. A stored status would have to be updated
 * at every transition, and the transitions are exactly where it would go wrong.
 */
export function batchState(batch: Batch, sessions: readonly CookSession[]): BatchState {
  const mine = sessionsOf(batch.id, sessions);
  if (mine.length === 0) return 'raw';
  if (rawRemainingG(batch, sessions) > EPSILON) return 'partiallyCooked';
  const left = mine.reduce((sum, s) => sum + s.cookedRemainingG, 0);
  return left > EPSILON ? 'cooked' : 'finished';
}

export function portionWeightG(session: CookSession): Grams {
  if (session.portionCount < 1) {
    throw new RangeError(`portionCount must be at least 1, got ${session.portionCount}`);
  }
  return g(session.cookedWeightG / session.portionCount);
}

/**
 * Derived from grams, not counted down. Eating a weighed 100g out of a 148g
 * portion has to mean something, and "0.68 portions gone" is the only answer
 * consistent with the grams actually leaving the container.
 */
export function portionsRemaining(session: CookSession): number {
  if (session.cookedWeightG <= 0) return 0;
  return session.cookedRemainingG / portionWeightG(session);
}
