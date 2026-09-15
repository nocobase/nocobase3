import { describe, expect, it, vi } from 'vitest';

import { DatabaseExplorerClient } from '../client/database-explorer-client.js';
import plugin from '../client/plugin.js';
import routes, {
  DATABASE_EXPLORER_ACCESS,
  DEFAULT_PANE,
} from '../client/routes.js';
import { DATABASE_EXPLORER_PAGE } from '../server/routes/index.js';

describe('@nocobase/app-plugin-database-explorer Client routes', () => {
  it('contributes one Settings page with a pane route per tab', () => {
    expect(routes).toMatchObject({
      parent: 'settings',
      routes: [
        {
          name: 'database-explorer',
          path: '/database-explorer',
          access: { resource: 'database-explorer', action: 'access' },
          navigation: { title: 'nav.databaseExplorer' },
          componentLoader: expect.any(Function),
          children: [
            { name: 'database-explorer.fields', path: 'fields' },
            { name: 'database-explorer.columns', path: 'columns' },
          ],
        },
      ],
    });
  });

  it('resolves every lazy component it declares', async () => {
    // Executing the loaders is the point: asserting they are functions would
    // pass for a route pointing at a module that cannot be resolved at all.
    const page = routes.routes[0];
    await expect(page?.componentLoader?.()).resolves.toMatchObject({
      default: expect.any(Function),
    });
    for (const child of page?.children ?? []) {
      await expect(child.componentLoader?.()).resolves.toMatchObject({
        default: expect.any(Function),
      });
    }
  });

  it('opens on the pane its parent redirects to', () => {
    expect(routes.routes[0]?.children?.[0]?.path).toBe(DEFAULT_PANE);
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

  it('follows the cursor so a search sees every collection', async () => {
    const { client, request } = fakeApi();
    request
      .mockResolvedValueOnce({
        data: { items: [{ name: 'a' }], nextCursor: 'c1' },
      })
      .mockResolvedValueOnce({
        data: { items: [{ name: 'b' }], nextCursor: 'c2' },
      })
      .mockResolvedValueOnce({ data: { items: [{ name: 'c' }] } });

    await expect(client.allCollections('main')).resolves.toEqual({
      items: [{ name: 'a' }, { name: 'b' }, { name: 'c' }],
      truncated: false,
    });
    expect(request.mock.calls.map(([options]) => options.query)).toEqual([
      {},
      { cursor: 'c1' },
      { cursor: 'c2' },
    ]);
  });

  it('stops and says so rather than following a cursor forever', async () => {
    const { client, request } = fakeApi();
    request.mockResolvedValue({
      data: { items: [{ name: 'a' }], nextCursor: 'c' },
    });

    const result = await client.allCollections('main', 3);

    expect(result.truncated).toBe(true);
    expect(result.items).toHaveLength(3);
    expect(request).toHaveBeenCalledTimes(3);
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
