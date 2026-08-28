import { fileURLToPath } from 'node:url';

import { validateMigrations, validateSeeds } from '@nocobase/app-database';
import { describe, expect, it } from 'vitest';

describe('@nocobase/app-plugin-workflow database', () => {
  it('provides the workflow collections migration and no seeds', async () => {
    const migrationsDirectory = fileURLToPath(
      new URL('../database/migrations', import.meta.url),
    );
    const seedsDirectory = fileURLToPath(
      new URL('../database/seeds', import.meta.url),
    );

    const migrations = await validateMigrations(migrationsDirectory);
    expect(migrations.map((migration) => migration.name)).toEqual([
      '202608200001_create_workflow_collections',
    ]);
    await expect(validateSeeds(seedsDirectory)).resolves.toEqual([]);
  });
});
