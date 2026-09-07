import { expect, test } from 'vitest';

import { createKnowledgeBaseService } from '../client/providers/service/knowledge-base-factory.ts';

const configured = {
  id: 1,
  key: 'configured',
  name: 'Configured',
  databaseSpec: 'PGVector',
  provider: 'NocobaseDefaultPGVectorProvider',
  connectProps: { host: 'localhost', port: 5432 },
  enabled: true,
  managedBy: 'config',
};

const manual = {
  ...configured,
  id: 2,
  key: 'manual',
  name: 'Manual',
  managedBy: null,
};

test('maps the config management marker without changing manual records', async () => {
  const client = {
    async action<T>(_resource: string, action: string): Promise<T> {
      if (action === 'list') {
        return {
          data: {
            data: [configured, manual],
            meta: { count: 2, page: 1, pageSize: 20 },
          },
        } as T;
      }
      return { data: configured } as T;
    },
  };
  const service = createKnowledgeBaseService(client);

  await expect(
    service.listVectorDatabases({ mode: 'server', page: 1, pageSize: 20 }),
  ).resolves.toEqual({
    rows: [
      configured,
      {
        id: manual.id,
        key: manual.key,
        name: manual.name,
        databaseSpec: manual.databaseSpec,
        provider: manual.provider,
        connectProps: manual.connectProps,
        enabled: manual.enabled,
      },
    ],
    count: 2,
    page: 1,
    pageSize: 20,
  });
  await expect(service.getVectorDatabase(1)).resolves.toEqual(configured);
});
