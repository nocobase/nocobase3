import { fileURLToPath } from 'node:url';

import { validateMigrations, validateSeeds } from '@nocobase/database';
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
      '202608210001_add_workflow_node_description',
      '202608220001_add_workflow_node_run_error',
    ]);
    await expect(validateSeeds(seedsDirectory)).resolves.toEqual([]);
  });
});
