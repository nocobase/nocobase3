import { afterEach, describe, expect, it } from 'vitest';
import type { Knex } from 'knex';
import { DatabaseCollectionMetadataStore } from '../../../src/metadata/internal/database-document-store.js';
import { createKnexClient } from '../../../src/database/internal/knex/client.js';
import { resolveKnexConnectionConfig } from '../../../src/database/internal/knex/config.js';

describe('DatabaseCollectionMetadataStore', () => {
  const clients: Knex[] = [];

  afterEach(async () => {
    await Promise.all(clients.splice(0).map((client) => client.destroy()));
  });

  it('initializes its internal table and persists V1 documents', async () => {
    const { client, store } = createStore('app_metadata');

    await Promise.all([store.initialize(), store.initialize()]);
    expect(await client.schema.hasTable('app_metadata')).toBe(true);
    const created = await store.put(
      { version: 1, name: 'orders', title: 'Orders' },
      { expectedRevision: null },
    );
    expect(created.revision).toBe(1);

    const reloaded = new DatabaseCollectionMetadataStore({
      resolveClient: async () => client,
      tableName: 'app_metadata',
    });
    await expect(reloaded.get('orders')).resolves.toEqual(created);
  });

  it('performs atomic create, update, and delete compare-and-swap', async () => {
    const { store } = createStore();
    const created = await store.put(
      { version: 1, name: 'orders' },
      { expectedRevision: null },
    );

    await expect(
      Promise.all([
        store.put(
          { version: 1, name: 'orders', title: 'First' },
          { expectedRevision: created.revision },
        ),
        store.put(
          { version: 1, name: 'orders', title: 'Second' },
          { expectedRevision: created.revision },
        ),
      ]),
    ).rejects.toMatchObject({ code: 'METADATA_CONFLICT' });
    const current = await store.get('orders');
    expect(current?.revision).toBe(2);
    expect(['First', 'Second']).toContain(current?.document.title);

    await expect(
      store.delete('orders', { expectedRevision: created.revision }),
    ).rejects.toMatchObject({
      code: 'METADATA_CONFLICT',
      actualRevision: 2,
    });
    await store.delete('orders', { expectedRevision: current!.revision });
    await expect(store.get('orders')).resolves.toBeUndefined();
  });

  it('returns stable lightweight pagination directly from the database', async () => {
    const { store } = createStore();
    await store.put(
      { version: 1, name: 'zebra', title: 'Zebra' },
      { expectedRevision: null },
    );
    await store.put(
      {
        version: 1,
        name: 'accounts',
        naming: { tablePrefix: 'app_' },
        description: 'Accounts',
      },
      { expectedRevision: null },
    );

    const first = await store.list({ limit: 1 });
    expect(first.items).toEqual([
      {
        name: 'accounts',
        revision: 1,
        naming: { tablePrefix: 'app_' },
        description: 'Accounts',
      },
    ]);
    const second = await store.list({ limit: 1, cursor: first.nextCursor });
    expect(second).toEqual({
      items: [{ name: 'zebra', revision: 1, title: 'Zebra' }],
    });
  });

  it('detects persisted row/document name drift', async () => {
    const { client, store } = createStore();
    await store.initialize();
    await client('__nocobase_collection_metadata').insert({
      name: 'orders',
      document: JSON.stringify({ version: 1, name: 'customers' }),
      revision: 1,
      created_at: new Date(),
      updated_at: new Date(),
    });

    await expect(store.get('orders')).rejects.toThrow(
      'does not match document name',
    );
  });

  it('rejects revisions that cannot be represented by the database backend', async () => {
    const { store } = createStore();

    await expect(
      store.put(
        { version: 1, name: 'orders' },
        { expectedRevision: 'module-revision' },
      ),
    ).rejects.toMatchObject({ code: 'METADATA_STORE_INVALID_OPTIONS' });
    await expect(
      store.put(
        { version: 1, name: 'orders' },
        { expectedRevision: Number.MAX_SAFE_INTEGER },
      ),
    ).rejects.toMatchObject({ code: 'METADATA_STORE_INVALID_OPTIONS' });
    await expect(
      store.delete('orders', { expectedRevision: 1.5 }),
    ).rejects.toMatchObject({ code: 'METADATA_STORE_INVALID_OPTIONS' });
  });

  function createStore(tableName?: string): {
    client: Knex;
    store: DatabaseCollectionMetadataStore;
  } {
    const client = createKnexClient(
      resolveKnexConnectionConfig({
        dialect: 'sqlite',
        filename: ':memory:',
      }),
    );
    clients.push(client);
    return {
      client,
      store: new DatabaseCollectionMetadataStore({
        resolveClient: async () => client,
        tableName,
      }),
    };
  }
});
