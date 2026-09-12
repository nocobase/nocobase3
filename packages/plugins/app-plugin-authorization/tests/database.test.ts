import { fileURLToPath } from 'node:url';

import { validateMigrations, validateSeeds } from '@nocobase/db';
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
      { name: '202608210001_create_permission_set_tables' },
      { name: '202608210002_create_default_access_rules' },
      { name: '202608210003_create_sharing_rules' },
      { name: '202608210004_create_restriction_rules' },
      { name: '202608250001_repair_authorization_administrator' },
      { name: '202608250002_create_default_pages_permission_set' },
    ]);
    await expect(validateSeeds(seedsDirectory)).resolves.toMatchObject([
      {
        name: '202608240001_authorization_create_system_administrator',
      },
    ]);
  });
});
