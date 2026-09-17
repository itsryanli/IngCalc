import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const CORE = join(process.cwd(), 'src/core');
const FORBIDDEN = [/from ['"]dexie/, /from ['"].*\/ui\//, /from ['"].*\/data\//, /from ['"]react/];

describe('core purity', () => {
  it('has no imports from ui, data, react or dexie', () => {
    const offenders: string[] = [];
    for (const file of readdirSync(CORE).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))) {
      const src = readFileSync(join(CORE, file), 'utf8');
      for (const pattern of FORBIDDEN) {
        if (pattern.test(src)) offenders.push(`${file} matches ${pattern}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
