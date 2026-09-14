import { describe, expect, it } from 'vitest';
import { loadDatabaseIntegrationTests } from '../../src/integration-loader.js';

describe('loadDatabaseIntegrationTests', () => {
  const createModules = () => {
    const loaded: string[] = [];
    const modules = {
      '/workspace/packages/libs/db-testkit/tests/integration/schema/inspector.test.ts':
        async () => {
          loaded.push('inspector');
        },
      '/workspace/packages/libs/db-testkit/tests/integration/query/count.test.ts':
        async () => {
          loaded.push('count');
        },
    };
    return { loaded, modules };
  };

  it('loads all modules by default', async () => {
    const { loaded, modules } = createModules();
    await loadDatabaseIntegrationTests(modules, undefined);
    expect(loaded).toEqual(['inspector', 'count']);
  });

  it('loads selected modules and normalizes the integration prefix', async () => {
    const { loaded, modules } = createModules();
    await loadDatabaseIntegrationTests(
      modules,
      JSON.stringify(['tests/integration/schema/inspector.test.ts']),
    );
    expect(loaded).toEqual(['inspector']);
  });

  it('fails when a selected module does not exist', async () => {
    const { modules } = createModules();
    await expect(
      loadDatabaseIntegrationTests(
        modules,
        JSON.stringify(['tests/integration/missing.test.ts']),
      ),
    ).rejects.toThrow('No database integration test file matched');
  });
});
