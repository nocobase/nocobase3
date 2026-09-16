import { fileURLToPath } from 'node:url';

import { validateMigrations, validateSeeds } from '@nocobase/db';
import { describe, expect, it } from 'vitest';

describe('@nocobase/app-plugin-authz-sharing-rules', () => {
  it('owns its rule migration', async () => {
    const migrationsDirectory = fileURLToPath(
      new URL('../database/migrations', import.meta.url),
    );
    const seedsDirectory = fileURLToPath(
      new URL('../database/seeds', import.meta.url),
    );

    await expect(
      validateMigrations(migrationsDirectory),
    ).resolves.toMatchObject([{ name: '202608210003_create_sharing_rules' }]);
    await expect(validateSeeds(seedsDirectory)).resolves.toEqual([]);
  });
});
