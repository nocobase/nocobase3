import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const explorer = vi.hoisted(() => ({
  connections: vi.fn(),
  collections: vi.fn(),
  collection: vi.fn(),
  physicalCollection: vi.fn(),
}));

// The real `useService` resolves a container singleton, so the page memoizes
// its client on a stable value. A mock that returned a fresh object per render
// would re-create the client every render and refetch forever.
const api = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock('@nocobase/app-client', () => ({
  apiClientToken: Symbol('apiClient'),
  useService: () => api,
}));

// react-i18next memoizes `t`, so the mock does too — the page must not be
// asserted against a hook that behaves more loosely than the real one.
const translation = vi.hoisted(() => ({ t: (key: string) => key }));

vi.mock('@nocobase/i18n/client', () => ({
  // The page is asserted through its own keys, so a translation table would
  // only add a second place for these strings to drift.
  useTranslation: () => translation,
}));

vi.mock('../client/database-explorer-client.js', () => ({
  DatabaseExplorerClient: class {
    connections = explorer.connections;
    collections = explorer.collections;
    collection = explorer.collection;
    physicalCollection = explorer.physicalCollection;
  },
}));

import DatabaseExplorerPage from '../client/pages/database-explorer-page.js';

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
    explorer.collections.mockReset().mockResolvedValue({
      items: [
        { name: 'orders', tableName: 'orders', schema: 'main', kind: 'table' },
      ],
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
    render(<DatabaseExplorerPage />);

    expect(
      await screen.findByRole('button', { name: /orders/ }),
    ).toBeInTheDocument();
    expect(explorer.collections).toHaveBeenCalledWith('main');
  });

  it('shows a collection its fields, marking the key from the constraint', async () => {
    render(<DatabaseExplorerPage />);

    await userEvent.click(
      await screen.findByRole('button', { name: /orders/ }),
    );

    expect(await screen.findByText('orderNo')).toBeInTheDocument();
    const keyCell = screen.getByText('id').closest('tr');
    expect(keyCell).toHaveTextContent('labels.primaryKey');
  });

  it('reads the physical schema only once the tab is opened', async () => {
    render(<DatabaseExplorerPage />);
    await userEvent.click(
      await screen.findByRole('button', { name: /orders/ }),
    );
    await screen.findByText('orderNo');

    expect(explorer.physicalCollection).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('tab', { name: 'tabs.columns' }));

    expect(await screen.findByText('order_no')).toBeInTheDocument();
    expect(explorer.physicalCollection).toHaveBeenCalledWith('main', 'orders');
  });

  it('keeps the page usable when one connection cannot be read', async () => {
    explorer.collections.mockRejectedValueOnce(
      new Error('Connection "main" could not be read.'),
    );

    render(<DatabaseExplorerPage />);

    expect(
      await screen.findByText('Connection "main" could not be read.'),
    ).toBeInTheDocument();
    // The other connection is still selectable: the failure stayed in its pane.
    expect(screen.getByRole('button', { name: /crm/ })).toBeInTheDocument();
  });

  it('reports a failure to list connections at the top of the page', async () => {
    explorer.connections.mockRejectedValue(new Error('unavailable'));

    render(<DatabaseExplorerPage />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('unavailable');
    });
  });
});
