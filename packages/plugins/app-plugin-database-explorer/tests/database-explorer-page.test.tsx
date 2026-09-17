import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const explorer = vi.hoisted(() => ({
  connections: vi.fn(),
  collections: vi.fn(),
  allCollections: vi.fn(),
  collection: vi.fn(),
  physicalCollection: vi.fn(),
}));

// The real `useApiClient` resolves a container singleton, so the page memoizes
// its client on a stable value. A mock returning a fresh object per render
// would re-create the client every render and refetch forever.
const api = vi.hoisted(() => ({ request: vi.fn() }));
// react-i18next memoizes `t`, so the mock does too — the page must not be
// asserted against a hook looser than the real one.
const translation = vi.hoisted(() => ({ t: (key: string) => key }));

vi.mock('@nocobase/app-client', () => ({
  apiClientToken: Symbol('apiClient'),
  useApiClient: () => api,
}));

vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => translation,
}));

vi.mock('../client/database-explorer-client.js', () => ({
  DatabaseExplorerClient: class {
    connections = explorer.connections;
    collections = explorer.collections;
    allCollections = explorer.allCollections;
    collection = explorer.collection;
    physicalCollection = explorer.physicalCollection;
  },
}));

const { default: DatabaseExplorerPage } =
  await import('../client/pages/database-explorer-page.js');
const { default: FieldsPane } =
  await import('../client/pages/collection-fields.js');
const { default: ColumnsPane } =
  await import('../client/pages/collection-columns.js');

function renderAt(entry: string): ReactElement {
  return (
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path='/database-explorer' element={<DatabaseExplorerPage />}>
          <Route path='fields' element={<FieldsPane />} />
          <Route path='columns' element={<ColumnsPane />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe('DatabaseExplorerPage', () => {
  beforeEach(() => {
    explorer.connections.mockReset().mockResolvedValue({
      default: 'main',
      items: [
        {
          name: 'main',
          isDefault: true,
          dialect: 'sqlite',
          schemaManagement: 'managed',
        },
        {
          name: 'crm',
          isDefault: false,
          dialect: 'postgres',
          schemaManagement: 'external',
        },
      ],
    });
    explorer.allCollections.mockReset().mockResolvedValue({
      items: [
        { name: 'orders', tableName: 'orders', schema: 'main', kind: 'table' },
      ],
      truncated: false,
    });
    explorer.collection.mockReset().mockResolvedValue({
      collection: {
        formatVersion: 1,
        name: 'orders',
        collection: {
          name: 'orders',
          fields: [
            {
              name: 'id',
              type: 'integer',
              autoIncrement: true,
              nullable: false,
            },
            { name: 'orderNo', type: 'string', nullable: false },
          ],
          constraints: [{ type: 'primary', fields: ['id'] }],
        },
        warnings: [],
      },
      metadata: null,
    });
    explorer.physicalCollection.mockReset().mockResolvedValue({
      schema: {
        formatVersion: 1,
        name: 'orders',
        physical: {
          tableName: 'orders',
          columns: [
            {
              columnName: 'order_no',
              ordinalPosition: 2,
              nativeType: 'VARCHAR(255)',
              nullable: false,
            },
          ],
        },
      },
    });
  });

  it('opens on the default connection and lists its collections', async () => {
    render(renderAt('/database-explorer'));

    expect(
      await screen.findByRole('button', { name: /orders/ }),
    ).toBeInTheDocument();
    // Every page is read, so a search can match a collection past the first.
    expect(explorer.allCollections).toHaveBeenCalledWith('main');
    expect(explorer.collections).not.toHaveBeenCalled();
  });

  it('restores a collection named in the URL without a click', async () => {
    render(
      renderAt('/database-explorer/fields?connection=main&collection=orders'),
    );

    expect(await screen.findByText('orderNo')).toBeInTheDocument();
    expect(explorer.collection).toHaveBeenCalledWith('main', 'orders');
  });

  it('marks the key from the constraint rather than from the field', async () => {
    render(
      renderAt('/database-explorer/fields?connection=main&collection=orders'),
    );

    await screen.findByText('orderNo');
    expect(screen.getByText('id').closest('tr')).toHaveTextContent(
      'labels.primaryKey',
    );
  });

  it('reads the physical schema only on the pane that shows it', async () => {
    render(
      renderAt('/database-explorer/fields?connection=main&collection=orders'),
    );
    await screen.findByText('orderNo');
    expect(explorer.physicalCollection).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('link', { name: 'tabs.columns' }));

    expect(await screen.findByText('order_no')).toBeInTheDocument();
    expect(explorer.physicalCollection).toHaveBeenCalledWith('main', 'orders');
  });

  it('puts the selected pane in the URL so it can be linked to', async () => {
    render(
      renderAt('/database-explorer/columns?connection=main&collection=orders'),
    );

    expect(await screen.findByText('order_no')).toBeInTheDocument();
    expect(explorer.physicalCollection).toHaveBeenCalledWith('main', 'orders');
  });

  it('says so when a connection has more collections than it loaded', async () => {
    explorer.allCollections.mockResolvedValue({
      items: [
        { name: 'orders', tableName: 'orders', schema: 'main', kind: 'table' },
      ],
      truncated: true,
    });

    render(renderAt('/database-explorer'));

    expect(await screen.findByText('states.truncated')).toBeInTheDocument();
  });

  it('keeps the page usable when one connection cannot be read', async () => {
    explorer.allCollections.mockRejectedValueOnce(
      Object.assign(new Error('boom'), {
        body: { code: 'CONNECTION_UNREACHABLE' },
      }),
    );

    render(renderAt('/database-explorer'));

    // Translated from the code, not echoed from the server's English message.
    expect(
      await screen.findByText('errors.connectionUnreachable'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /crm/ })).toBeInTheDocument();
  });

  it('reports a failure to list connections at the top of the page', async () => {
    explorer.connections.mockRejectedValue(new Error('unavailable'));

    render(renderAt('/database-explorer'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('unavailable');
    });
  });
});
