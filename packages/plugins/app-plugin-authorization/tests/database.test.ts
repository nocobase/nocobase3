import { fileURLToPath } from 'node:url';

import { validateMigrations, validateSeeds } from '@nocobase/db';
import { describe, expect, it } from 'vitest';

describe('@nocobase/app-plugin-authorization database', () => {
  it('loads the permission set migrations and the built-in role seeds', async () => {
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
    ]);
    await expect(validateSeeds(seedsDirectory)).resolves.toMatchObject([
      {
        name: '202608240001_authorization_create_root_set',
      },
      {
        name: '202608250002_authorization_create_member_set',
      },
    ]);
  });
});
