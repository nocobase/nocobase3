import { fileURLToPath } from 'node:url';

import { validateMigrations, validateSeeds } from '@nocobase/database';
import { describe, expect, it } from 'vitest';

describe('@nocobase/app-plugin-authorization database', () => {
  it('loads the permission set migration and administrator seed', async () => {
    const migrationsDirectory = fileURLToPath(
      new URL('../database/migrations', import.meta.url),
    );
    const seedsDirectory = fileURLToPath(
      new URL('../database/seeds', import.meta.url),
    );

    await expect(
      validateMigrations(migrationsDirectory),
    ).resolves.toMatchObject([
      {
        name: '202608210001_create_permission_set_tables',
      },
    ]);
    await expect(validateSeeds(seedsDirectory)).resolves.toMatchObject([
      {
        name: '202608240001_authorization_create_system_administrator',
      },
    ]);
  });
});
