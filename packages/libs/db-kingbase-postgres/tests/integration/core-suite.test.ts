import { installDatabaseIntegrationAdapter } from '@nocobase/db-testkit';
import { kingbasePostgresDialectIntegrationAdapter } from './legacy-adapter.js';

declare global {
  interface ImportMeta {
    glob(
      pattern: string,
      options?: { eager?: boolean },
    ): Record<string, () => Promise<unknown>>;
  }
}

installDatabaseIntegrationAdapter(kingbasePostgresDialectIntegrationAdapter);
await import('./reset-managed-schema.test.js');
process.chdir(new URL('../../../db-testkit/', import.meta.url).pathname);

const loadTests = import.meta.glob(
  '../../../db-testkit/tests/integration/**/*.test.ts',
  {
    eager: false,
  },
);

for (const loadTest of Object.values(loadTests) as Array<
  () => Promise<unknown>
>) {
  await loadTest();
}
