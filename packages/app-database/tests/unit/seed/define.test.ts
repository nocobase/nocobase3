import { describe, expect, it } from 'vitest';
import {
  defineSeed,
  isDefinedSeed,
  SEED_DEFINITION_SYMBOL,
  type SeedContext,
} from '../../../src/index.js';

describe('defineSeed', () => {
  it('marks seed definitions without exposing the marker in enumeration', () => {
    const seed = defineSeed({
      name: '202608210001_default_roles',
      async run() {},
    });

    expect(isDefinedSeed(seed)).toBe(true);
    expect(Object.keys(seed)).toEqual(['name', 'run']);
    expect(
      (seed as unknown as Record<symbol, unknown>)[SEED_DEFINITION_SYMBOL],
    ).toBe(true);
  });

  it('provides query and connection in the seed context', () => {
    defineSeed({
      name: '202608210001_context',
      async run(context: SeedContext) {
        void context.query;
        void context.connection;
      },
    });
  });

  it('does not accept unmarked plain objects', () => {
    expect(
      isDefinedSeed({
        name: '202608210001_plain',
        async run() {},
      }),
    ).toBe(false);
  });
});
