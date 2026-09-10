import { installDatabaseIntegrationAdapter } from '@nocobase/db-testkit';
import { sqliteDialectIntegrationAdapter } from './adapter.js';

declare global {
  interface ImportMeta {
    glob(
      pattern: string,
      options?: { eager?: boolean },
    ): Record<string, () => Promise<unknown>>;
  }
}

installDatabaseIntegrationAdapter(sqliteDialectIntegrationAdapter);
process.chdir(new URL('../../../db/', import.meta.url).pathname);

const loadTests = import.meta.glob(
  '../../../db/tests/integration/**/*.test.ts',
  { eager: false },
);

for (const loadTest of Object.values(loadTests) as Array<
  () => Promise<unknown>
>) {
  await loadTest();
}
