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
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
  render(<VectorDatabasesPage />);

  const configuredRow = (await screen.findByText('Configured')).closest('tr');
  const manualRow = screen.getByText('Manual').closest('tr');
  expect(configuredRow).not.toBeNull();
  expect(manualRow).not.toBeNull();

  expect(
    within(configuredRow!).getByText('Config managed').getAttribute('title'),
  ).toBe('This vector database is managed through application config.');
  expect(
    (
      within(configuredRow!).getByRole('checkbox', {
        name: 'Select Configured',
      }) as HTMLInputElement
    ).disabled,
  ).toBe(true);
  expect(
    within(configuredRow!).getByText('Change in application config'),
  ).toBeDefined();
  expect(
    within(configuredRow!).queryByRole('button', { name: 'Edit' }),
  ).toBeNull();
  expect(
    within(configuredRow!).queryByRole('button', { name: 'Delete' }),
  ).toBeNull();

  const manualCheckbox = within(manualRow!).getByRole('checkbox', {
    name: 'Select Manual',
  });
  expect((manualCheckbox as HTMLInputElement).disabled).toBe(false);
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

  fireEvent.click(manualCheckbox);
  const bulkDelete = screen
    .getAllByRole('button', { name: 'Delete' })
    .find((button) => !manualRow!.contains(button));
  expect(bulkDelete).toBeDefined();
  fireEvent.click(bulkDelete!);

  await waitFor(() =>
    expect(service.deleteVectorDatabase).toHaveBeenCalledWith(2),
  );
  expect(service.findRelatedKnowledgeBases).toHaveBeenCalledTimes(1);
  expect(service.findRelatedKnowledgeBases).toHaveBeenCalledWith('manual');
  expect(service.deleteVectorDatabase).not.toHaveBeenCalledWith(1);
  expect(confirm).toHaveBeenCalledWith('Delete 1 selected vector database(s)?');
});

test('excludes a stale selection when a refreshed row becomes config-managed', async () => {
  service.listVectorDatabases
    .mockResolvedValueOnce(result([{ ...configured, managedBy: null }]))
    .mockResolvedValue(result([configured]));
  render(<VectorDatabasesPage />);

  const selectedCheckbox = await screen.findByRole('checkbox', {
    name: 'Select Configured',
  });
  const selectedRow = selectedCheckbox.closest('tr');
  fireEvent.click(selectedCheckbox);
  const bulkDelete = screen
    .getAllByRole('button', { name: 'Delete' })
    .find((button) => !selectedRow!.contains(button));
  expect(bulkDelete).toBeDefined();
  expect((bulkDelete as HTMLButtonElement).disabled).toBe(false);

  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

  await screen.findByText('Config managed');
  expect(
    (
      screen.getByRole('checkbox', {
        name: 'Select Configured',
      }) as HTMLInputElement
    ).disabled,
  ).toBe(true);
  expect((bulkDelete as HTMLButtonElement).disabled).toBe(true);
  expect(service.findRelatedKnowledgeBases).not.toHaveBeenCalled();
  expect(service.deleteVectorDatabase).not.toHaveBeenCalled();
});
