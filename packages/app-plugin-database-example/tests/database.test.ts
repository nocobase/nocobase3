import { fileURLToPath } from 'node:url';

import { validateMigrations, validateSeeds } from '@nocobase/app-database';
import { describe, expect, it } from 'vitest';

describe('database example plugin', () => {
  it('provides a valid migration and seed', async () => {
    const migrationsDirectory = fileURLToPath(
      new URL('../database/migrations', import.meta.url),
    );
    const seedsDirectory = fileURLToPath(
      new URL('../database/seeds', import.meta.url),
    );

    await expect(validateMigrations(migrationsDirectory)).resolves.toEqual([
      expect.objectContaining({
        name: '202608220001_database_example_create_messages',
      }),
    ]);
    await expect(validateSeeds(seedsDirectory)).resolves.toEqual([
      expect.objectContaining({
        name: '202608220002_database_example_create_welcome_message',
      }),
    ]);
  });
});
