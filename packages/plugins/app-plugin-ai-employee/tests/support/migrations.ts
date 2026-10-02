import { fileURLToPath } from 'node:url';

import type { MigrationSource } from '@nocobase/db';

/** This plugin's migrations, as an application loads them. */
export const aiEmployeeMigrations: readonly MigrationSource[] = [
  {
    packageName: '@nocobase/app-plugin-ai-employee',
    directory: fileURLToPath(
      new URL('../../database/migrations', import.meta.url),
    ),
  },
];
