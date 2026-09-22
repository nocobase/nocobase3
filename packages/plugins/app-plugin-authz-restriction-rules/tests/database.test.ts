import { fileURLToPath } from 'node:url';

import { validateMigrations } from '@nocobase/db';
import { describe, expect, it } from 'vitest';

describe('@nocobase/app-plugin-authz-restriction-rules', () => {
  it('owns its rule migration', async () => {
    const migrationsDirectory = fileURLToPath(
      new URL('../database/migrations', import.meta.url),
    );

    await expect(
      validateMigrations(migrationsDirectory),
    ).resolves.toMatchObject([
      { name: '202608210004_create_restriction_rules' },
    ]);
  });
});
