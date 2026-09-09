/** @vitest-environment jsdom */
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';

const service = vi.hoisted(() => ({
  listVectorDatabases: vi.fn(),
  listVectorDatabaseProviders: vi.fn(),
  getVectorDatabase: vi.fn(),
  createVectorDatabase: vi.fn(),
  updateVectorDatabase: vi.fn(),
  deleteVectorDatabase: vi.fn(),
  testVectorDatabaseConnection: vi.fn(),
  findRelatedKnowledgeBases: vi.fn(),
}));

vi.mock('../client/providers/context.js', () => ({
  useKnowledgeBaseService: () => service,
}));

vi.mock('../client/locales/index.js', () => ({
  useT:
    () =>
    (key: string, options: Record<string, unknown> = {}): string =>
      Object.entries(options).reduce(
        (label, [name, value]) =>
          label.replaceAll(`{{${name}}}`, String(value)),
        key,
      ),
}));

vi.mock('../client/components/common.js', () => ({
  PagePagination: () => null,
}));

import VectorDatabasesPage from '../client/page/vector-databases-page.tsx';

const configured = {
  id: 1,
  key: 'configured',
  name: 'Configured',
  databaseSpec: 'PGVector',
  provider: 'NocobaseDefaultPGVectorProvider',
  connectProps: { host: 'localhost', port: 5432 },
  enabled: true,
  managedBy: 'config' as const,
};

const manual = {
  ...configured,
  id: 2,
  key: 'manual',
  name: 'Manual',
  managedBy: null,
};

const provider = {
  name: configured.provider,
  spec: configured.databaseSpec,
  fields: [{ key: 'host', required: true }],
};

function result(rows: readonly (typeof configured | typeof manual)[]) {
  return { rows, count: rows.length, page: 1, pageSize: 20 };
}

beforeEach(() => {
  vi.clearAllMocks();
  service.listVectorDatabaseProviders.mockResolvedValue([provider]);
  service.listVectorDatabases.mockResolvedValue(result([configured, manual]));
  service.findRelatedKnowledgeBases.mockResolvedValue([]);
  service.deleteVectorDatabase.mockResolvedValue(undefined);
});

test('renders config-managed rows as read-only and keeps manual row actions', async () => {
  render(<VectorDatabasesPage />);

  const configuredRow = (await screen.findByText('Configured')).closest('tr');
  const manualRow = screen.getByText('Manual').closest('tr');
  expect(configuredRow).not.toBeNull();
  expect(manualRow).not.toBeNull();

  expect(
    within(configuredRow!).getByText('Config managed').getAttribute('title'),
  ).toBe('This vector database is managed through application config.');
  expect(
    within(configuredRow!).getByText('Change in application config'),
  ).toBeDefined();
  expect(
    within(configuredRow!).queryByRole('button', { name: 'Edit' }),
  ).toBeNull();
  expect(
    within(configuredRow!).queryByRole('button', { name: 'Delete' }),
  ).toBeNull();

  expect(
    (
      within(manualRow!).getByRole('button', {
        name: 'Edit',
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(false);
  expect(
    (
      within(manualRow!).getByRole('button', {
        name: 'Delete',
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(false);
  expect(screen.queryByRole('checkbox')).toBeNull();
  expect(screen.getAllByRole('button', { name: 'Delete' })).toHaveLength(1);
});

test('opens the add-provider menu when the pointer enters the add button', async () => {
  render(<VectorDatabasesPage />);

  const addButton = await screen.findByRole('button', { name: 'Add new' });
  fireEvent.mouseEnter(addButton);

  await waitFor(() => {
    expect(screen.getByRole('menuitem', { name: 'PGVector' })).toBeDefined();
  });
});
