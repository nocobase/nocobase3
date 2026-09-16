import { Toaster, toast } from 'sonner';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import enUS from '../client/locales/en-US.js';
import { emptyHubCapabilities } from '../client/permissions.js';

const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@nocobase/app-client', () => ({
  apiClientToken: Symbol('api'),
  useService: () => mocks,
}));
vi.mock('@nocobase/i18n/client', () => {
  const t = (key: string, values?: Record<string, string>) => {
    let result: unknown = enUS;
    for (const part of key.split('.'))
      result = (result as Record<string, unknown>)[part];
    return typeof result === 'string'
      ? result.replace(
          /{{(\w+)}}/g,
          (_, name: string) => values?.[name] ?? name,
        )
      : key;
  };
  return { useTranslation: () => ({ t, i18n: { language: 'en-US' } }) };
});
import { ApiKeys } from '../client/pages/hub/api-keys.js';
const capabilities = {
  ...emptyHubCapabilities(),
  'manage-api-keys': true,
  'upload-release': true,
  deploy: true,
};
const apps = [
  {
    id: 'crm',
    name: 'CRM',
    permissions: ['upload-release', 'deploy'] as const,
  },
  {
    id: 'erp',
    name: 'ERP',
    permissions: ['upload-release', 'deploy'] as const,
  },
];
const key = {
  id: 'key-id',
  canCopy: true,
  apps: [
    { id: 'crm', name: 'CRM' },
    { id: 'erp', name: 'ERP' },
  ],
  name: 'CI',
  prefix: 'hub_app_abcd',
  scopes: ['upload-release'],
  status: 'active',
  createdBy: 'admin',
  creatorName: 'Administrator',
  createdAt: '2026-09-15T00:00:00Z',
  lastUsedAt: null,
  expiresAt: null,
};
beforeEach(() => {
  toast.dismiss();
  render(<Toaster position='top-right' />);
  mocks.request.mockReset();
});

describe('App API Keys management', () => {
  it('creates a scoped key, shows the secret once and clears it after closing', async () => {
    let hasKey = false;
    mocks.request.mockImplementation(async (input: { method?: string }) => {
      if (input.method === 'POST') {
        hasKey = true;
        return { data: { key, secret: 'hub_app_test_secret' } };
      }
      return { data: hasKey ? [key] : [] };
    });
    const view = render(<ApiKeys apps={apps} capabilities={capabilities} />);
    await screen.findByText('No API Keys yet');
    fireEvent.click(screen.getByRole('button', { name: 'Create API Key' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByLabelText('Upload release')).toBeDisabled();
    expect(
      within(dialog).queryByLabelText('Read releases'),
    ).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText('Deploy release')).toBeInTheDocument();
    const submit = within(dialog).getByRole('button', {
      name: 'Create API Key',
    });
    expect(submit).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText('Name'), {
      target: { value: 'CI' },
    });
    fireEvent.click(within(dialog).getByLabelText('CRM (crm)'));
    const search = within(dialog).getByRole('searchbox', {
      name: 'Search applications…',
    });
    fireEvent.change(search, { target: { value: 'ERP' } });
    expect(
      within(dialog).queryByLabelText('CRM (crm)'),
    ).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByLabelText('ERP (erp)'));
    expect(within(dialog).getByRole('status')).toHaveTextContent('2 selected');
    fireEvent.change(search, { target: { value: 'no-such-app' } });
    expect(
      within(dialog).getByText('No matching applications.'),
    ).toBeInTheDocument();
    fireEvent.change(search, { target: { value: '' } });
    expect(within(dialog).getByLabelText('CRM (crm)')).toBeChecked();
    fireEvent.click(within(dialog).getByLabelText('Upload release'));
    fireEvent.click(submit);
    await screen.findByText('hub_app_test_secret');
    expect(mocks.request).toHaveBeenCalledWith({
      path: 'hub/api-keys',
      method: 'POST',
      json: {
        name: 'CI',
        appIds: ['crm', 'erp'],
        allApps: false,
        scopes: ['upload-release'],
        expiresAt: null,
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByText('hub_app_test_secret')).not.toBeInTheDocument();
    await screen.findByText('hub_app_abcd…');
    view.unmount();
    render(<ApiKeys apps={apps} capabilities={capabilities} />);
    await screen.findByText('hub_app_abcd…');
    expect(screen.queryByText('hub_app_test_secret')).not.toBeInTheDocument();
  });
  it('requires a custom expiration and clears it when switching to no expiration', async () => {
    mocks.request.mockResolvedValue({ data: [] });
    render(<ApiKeys apps={apps} capabilities={capabilities} />);
    await screen.findByText('No API Keys yet');
    fireEvent.click(screen.getByRole('button', { name: 'Create API Key' }));
    const dialog = within(screen.getByRole('dialog'));
    fireEvent.change(dialog.getByLabelText('Name'), {
      target: { value: 'CI' },
    });
    fireEvent.click(dialog.getByLabelText('CRM (crm)'));
    fireEvent.click(dialog.getByLabelText('Upload release'));
    const submit = dialog.getByRole('button', { name: 'Create API Key' });
    expect(submit).toBeEnabled();
    const expiration = dialog.getByRole('combobox', { name: 'Expiration' });
    fireEvent.change(expiration, { target: { value: 'custom' } });
    expect(submit).toBeDisabled();
    fireEvent.change(dialog.getByLabelText('Expires'), {
      target: { value: '2099-01-01T12:00' },
    });
    expect(submit).toBeEnabled();
    fireEvent.change(expiration, { target: { value: 'never' } });
    expect(dialog.queryByLabelText('Expires')).not.toBeInTheDocument();
    fireEvent.change(expiration, { target: { value: 'custom' } });
    expect(dialog.getByLabelText('Expires')).toHaveValue('');
    expect(submit).toBeDisabled();
  });
  it('submits a dynamic all-App grant without copying the current App list', async () => {
    mocks.request.mockImplementation(async (input: { method?: string }) =>
      input.method === 'POST'
        ? {
            data: {
              key: { ...key, allApps: true, apps: [] },
              secret: 'test-only-secret',
            },
          }
        : { data: [] },
    );
    render(<ApiKeys apps={apps} capabilities={capabilities} />);
    await screen.findByText('No API Keys yet');
    fireEvent.click(screen.getByRole('button', { name: 'Create API Key' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Name'), {
      target: { value: 'Global CI' },
    });
    fireEvent.click(
      within(dialog).getByLabelText('All applications (including future apps)'),
    );
    expect(
      within(dialog).queryByLabelText('CRM (crm)'),
    ).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByLabelText('Deploy release'));
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Create API Key' }),
    );
    await screen.findByText('test-only-secret');
    expect(mocks.request).toHaveBeenCalledWith({
      path: 'hub/api-keys',
      method: 'POST',
      json: {
        name: 'Global CI',
        allApps: true,
        appIds: [],
        scopes: ['deploy'],
        expiresAt: null,
      },
    });
  });
  it('requires confirmation before disabling or deleting and handles failure', async () => {
    mocks.request.mockResolvedValue({ data: [key] });
    render(<ApiKeys apps={apps} capabilities={capabilities} />);
    await screen.findByText('CI');
    fireEvent.click(screen.getByRole('button', { name: 'Actions for CI' }));
    fireEvent.click(
      await screen.findByRole('menuitem', { name: 'Disable', exact: true }),
    );
    expect(mocks.request).toHaveBeenCalledTimes(1);
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Cancel',
      }),
    );
    expect(mocks.request).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Actions for CI' }));
    fireEvent.click(
      await screen.findByRole('menuitem', { name: 'Disable', exact: true }),
    );
    mocks.request
      .mockResolvedValueOnce({ data: { success: true } })
      .mockResolvedValue({ data: [{ ...key, status: 'disabled' }] });
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Disable',
        exact: true,
      }),
    );
    await screen.findByText('Disabled');
    expect(mocks.request).toHaveBeenCalledWith({
      path: 'hub/api-keys/key-id/disable',
      method: 'POST',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Actions for CI' }));
    fireEvent.click(
      await screen.findByRole('menuitem', { name: 'Delete', exact: true }),
    );
    mocks.request.mockRejectedValueOnce(new Error('failed'));
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Delete',
        exact: true,
      }),
    );
    await waitFor(() =>
      expect(
        screen.getByText(
          'The action could not be completed. Check your permissions and try again.',
        ),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText('CI')).toBeInTheDocument();
  });
  it('retrieves a saved key only on request and clears it when the dialog closes', async () => {
    mocks.request.mockImplementation(async (input: { path: string }) =>
      input.path.endsWith('/reveal')
        ? { data: { secret: 'saved-test-secret' } }
        : { data: [key] },
    );
    render(<ApiKeys apps={apps} capabilities={capabilities} />);
    await screen.findByText('CI');
    expect(screen.queryByText('saved-test-secret')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Copy API Key CI' }));
    await screen.findByText('saved-test-secret');
    expect(mocks.request).toHaveBeenCalledWith({
      path: 'hub/api-keys/key-id/reveal',
      method: 'POST',
    });
    expect(screen.getByRole('button', { name: 'Copy key' })).toBeEnabled();
    const clipboardDescriptor = Object.getOwnPropertyDescriptor(
      navigator,
      'clipboard',
    );
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Copy key' }));
      await screen.findByRole('button', { name: 'Copied' });
      expect(writeText).toHaveBeenCalledWith('saved-test-secret');
    } finally {
      if (clipboardDescriptor)
        Object.defineProperty(navigator, 'clipboard', clipboardDescriptor);
      else Reflect.deleteProperty(navigator, 'clipboard');
    }

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByText('saved-test-secret')).not.toBeInTheDocument();
  });
  it('does not fetch keys for users without management access', async () => {
    render(<ApiKeys apps={apps} capabilities={emptyHubCapabilities()} />);
    expect(
      await screen.findByText(
        'You do not have permission to manage Hub API Keys.',
      ),
    ).toBeInTheDocument();
    expect(mocks.request).not.toHaveBeenCalled();
  });
});
