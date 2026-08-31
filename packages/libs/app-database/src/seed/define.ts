import type { SeedDefinition } from './types.js';

export const SEED_DEFINITION_SYMBOL: symbol = Symbol.for(
  '@nocobase/app-database.seed',
);

export function defineSeed<T extends SeedDefinition>(definition: T): T {
  Object.defineProperty(definition, SEED_DEFINITION_SYMBOL, {
    value: true,
    enumerable: false,
    configurable: false,
  });
  return definition;
}

export function isDefinedSeed(value: unknown): value is SeedDefinition {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Record<symbol, unknown>)[SEED_DEFINITION_SYMBOL] === true
  );
}
