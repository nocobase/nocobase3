import { fileURLToPath } from 'node:url';

import { validateMigrations, validateSeeds } from '@nocobase/db';
import { describe, expect, it } from 'vitest';

describe(__NOCOBASE_PACKAGE_NAME_LITERAL__, () => {
  it('keeps database examples disabled by default', async () => {
    const migrationsDirectory = fileURLToPath(
      new URL('../database/migrations', import.meta.url),
    );
    const seedsDirectory = fileURLToPath(
      new URL('../database/seeds', import.meta.url),
    );

    await expect(validateMigrations(migrationsDirectory)).resolves.toEqual([]);
    await expect(validateSeeds(seedsDirectory)).resolves.toEqual([]);
  });
});
