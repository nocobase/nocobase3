import { describe, expect, it, vi } from 'vitest';

import { DatabaseExplorerClient } from '../client/database-explorer-client.js';
import plugin from '../client/plugin.js';
import routes, { DATABASE_EXPLORER_ACCESS } from '../client/routes.js';
import { DATABASE_EXPLORER_PAGE } from '../server/routes/index.js';

describe('@nocobase/app-plugin-database-explorer Client routes', () => {
  it('contributes one Settings page behind a lazy component', () => {
    expect(routes).toMatchObject({
      parent: 'settings',
      routes: [
        {
          name: 'database-explorer',
          path: '/database-explorer',
          access: { resource: 'database-explorer', action: 'access' },
          navigation: { title: 'nav.databaseExplorer' },
          componentLoader: expect.any(Function),
        },
      ],
    });
  });

  it('guards the page with the resource the server checks', () => {
    // One grant governs the navigation entry and the API; the two halves of
    // that contract can only stay aligned if they name the same resource.
    expect(DATABASE_EXPLORER_ACCESS.resource).toBe(DATABASE_EXPLORER_PAGE);
    expect(DATABASE_EXPLORER_ACCESS.action).toBe('access');
  });

  it('registers as a client plugin with its locales', () => {
    expect(plugin).toEqual(expect.any(Function));
  });
});

describe('DatabaseExplorerClient', () => {
  it('reads connections without a query', async () => {
    const { client, request } = fakeApi();

    await client.connections();

    expect(request).toHaveBeenCalledWith({
      path: 'database-explorer/connections',
      query: {},
    });
  });

  it('escapes a connection name that needs it', async () => {
    const { client, request } = fakeApi();

    await client.collections('external/crm');

    expect(request).toHaveBeenCalledWith({
      path: 'database-explorer/connections/external%2Fcrm/collections',
      query: {},
    });
  });

  it('sends a cursor back unchanged', async () => {
    const { client, request } = fakeApi();

    await client.collections('main', { limit: 25, cursor: 'opaque+blob=' });

    expect(request).toHaveBeenCalledWith({
      path: 'database-explorer/connections/main/collections',
      query: { limit: 25, cursor: 'opaque+blob=' },
    });
  });

  it('omits paging options that were not given', async () => {
    const { client, request } = fakeApi();

    await client.collections('main', { limit: 10 });

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ query: { limit: 10 } }),
    );
  });

  it('addresses a collection and its physical schema separately', async () => {
    const { client, request } = fakeApi();

    await client.collection('main', 'order items');
    await client.physicalCollection('main', 'order items');

    expect(request.mock.calls.map(([options]) => options.path)).toEqual([
      'database-explorer/connections/main/collections/order%20items',
      'database-explorer/connections/main/collections/order%20items/physical',
    ]);
  });

  it('unwraps the data envelope', async () => {
    const { client, request } = fakeApi();
    request.mockResolvedValue({ data: { default: 'main', items: [] } });

    await expect(client.connections()).resolves.toEqual({
      default: 'main',
      items: [],
    });
  });
});

function fakeApi() {
  const request = vi.fn().mockResolvedValue({ data: {} });
  return {
    request,
    client: new DatabaseExplorerClient({
      request,
    } as unknown as ConstructorParameters<typeof DatabaseExplorerClient>[0]),
  };
}
