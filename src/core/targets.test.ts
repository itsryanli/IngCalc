import { describe, it, expect } from 'vitest';
import { ageFrom, bmr, activityMultiplier, tdee, calorieTarget, proteinTargetG, proteinGPerLb, microTargets } from './targets';
import type { Profile } from './types';
import { rniFor } from '../data/rniMY';
import { DV_US } from '../data/dvUS';

const TODAY = new Date('2026-09-17T00:00:00Z');

const male: Profile = {
  id: 'p1', name: 'Ryan', sex: 'male', birthYear: 1996,
  heightCm: 175, weightKg: 75, sessionsPerWeek: 4, goal: 'maintain',
};

describe('targets', () => {
  it('derives age from birth year', () => {
    expect(ageFrom(male, TODAY)).toBe(30);
  });

  it('computes male BMR via Mifflin-St Jeor', () => {
    // 10*75 + 6.25*175 - 5*30 + 5 = 750 + 1093.75 - 150 + 5 = 1698.75
    expect(bmr(male, TODAY)).toBeCloseTo(1698.75, 2);
  });

  it('computes female BMR via Mifflin-St Jeor', () => {
    const female: Profile = { ...male, sex: 'female' };
    // 750 + 1093.75 - 150 - 161 = 1532.75
    expect(bmr(female, TODAY)).toBeCloseTo(1532.75, 2);
  });

  it('maps training frequency to an activity multiplier', () => {
    expect(activityMultiplier(0)).toBe(1.2);
    expect(activityMultiplier(1)).toBe(1.375);
    expect(activityMultiplier(2)).toBe(1.375);
    expect(activityMultiplier(3)).toBe(1.55);
    expect(activityMultiplier(4)).toBe(1.55);
    expect(activityMultiplier(5)).toBe(1.725);
    expect(activityMultiplier(6)).toBe(1.725);
    expect(activityMultiplier(7)).toBe(1.9);
    expect(activityMultiplier(12)).toBe(1.9);
  });

  it('computes TDEE from BMR and activity', () => {
    expect(tdee(male, TODAY)).toBeCloseTo(1698.75 * 1.55, 2);
  });

  it('adjusts the calorie target by goal', () => {
    const base = tdee(male, TODAY);
    expect(calorieTarget(male, TODAY)).toBeCloseTo(base, 2);
    expect(calorieTarget({ ...male, goal: 'cut' }, TODAY)).toBeCloseTo(base * 0.85, 2);
    expect(calorieTarget({ ...male, goal: 'bulk' }, TODAY)).toBeCloseTo(base * 1.10, 2);
  });

  it('sets protein target by goal and allows an override', () => {
    expect(proteinTargetG({ ...male, goal: 'cut' })).toBeCloseTo(75 * 2.2, 4);
    expect(proteinTargetG({ ...male, goal: 'maintain' })).toBeCloseTo(75 * 1.8, 4);
    expect(proteinTargetG({ ...male, goal: 'bulk' })).toBeCloseTo(75 * 2.0, 4);
    expect(proteinTargetG({ ...male, proteinGPerKg: 1.6 })).toBeCloseTo(75 * 1.6, 4);
  });

  it('expresses the protein target per pound as well as per kilogram', () => {
    expect(proteinGPerLb({ ...male, proteinGPerKg: 2.2 })).toBeCloseTo(2.2 / 2.20462, 4);
  });

  it('returns both RNI and DV figures for micronutrients', () => {
    const t = microTargets(male, TODAY, rniFor, DV_US);
    expect(t.potassium?.rni).toBeGreaterThan(0);
    expect(t.potassium?.dv).toBeGreaterThan(0);
    expect(t.iron?.rni).toBeGreaterThan(0);
  });

  it('omits a standard that has no figure rather than inventing one', () => {
    const t = microTargets(male, TODAY, () => ({}), {});
    expect(t.potassium?.rni).toBeUndefined();
    expect(t.potassium?.dv).toBeUndefined();
  });
});
