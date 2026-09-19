import type { SeedDefinition } from './types.js';
import { markSeedDefinition } from './internal/marker.js';

/** Marks and returns a seed definition for discovery by the seed loader. */
export function defineSeed<T extends SeedDefinition>(definition: T): T {
  return markSeedDefinition(definition);
}
