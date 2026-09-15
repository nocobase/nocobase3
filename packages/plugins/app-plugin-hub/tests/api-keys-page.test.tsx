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
  'read-release': true,
  deploy: true,
};
const key = {
  id: 'key-id',
  appId: 'crm',
  name: 'CI',
  prefix: 'hub_app_abcd',
  scopes: ['read-release'],
  status: 'active',
  createdBy: 'admin',
  creatorName: 'Administrator',
  createdAt: '2026-09-15T00:00:00Z',
  lastUsedAt: null,
  expiresAt: null,
};
beforeEach(() => {
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
    const view = render(
      <ApiKeys appId='crm' appName='CRM' capabilities={capabilities} />,
    );
    await screen.findByText('No API keys yet');
    fireEvent.click(screen.getByRole('button', { name: 'Create API key' }));
    const dialog = screen.getByRole('dialog');
    expect(
      within(dialog).queryByLabelText('Upload releases'),
    ).not.toBeInTheDocument();
    const submit = within(dialog).getByRole('button', {
      name: 'Create API key',
    });
    expect(submit).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText('Name'), {
      target: { value: 'CI' },
    });
    fireEvent.click(within(dialog).getByLabelText('Read releases'));
    fireEvent.click(submit);
    await screen.findByText('hub_app_test_secret');
    expect(mocks.request).toHaveBeenCalledWith({
      path: 'hub/apps/crm/api-keys',
      method: 'POST',
      json: { name: 'CI', scopes: ['read-release'], expiresAt: null },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByText('hub_app_test_secret')).not.toBeInTheDocument();
    await screen.findByText('hub_app_abcd…');
    view.unmount();
    render(<ApiKeys appId='crm' appName='CRM' capabilities={capabilities} />);
    await screen.findByText('hub_app_abcd…');
    expect(screen.queryByText('hub_app_test_secret')).not.toBeInTheDocument();
  });
  it('requires confirmation before disabling or deleting and handles failure', async () => {
    mocks.request.mockResolvedValue({ data: [key] });
    render(<ApiKeys appId='crm' appName='CRM' capabilities={capabilities} />);
    await screen.findByText('CI');
    fireEvent.click(
      screen.getByRole('button', { name: 'Disable', exact: true }),
    );
    expect(mocks.request).toHaveBeenCalledTimes(1);
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Cancel',
      }),
    );
    expect(mocks.request).toHaveBeenCalledTimes(1);
    fireEvent.click(
      screen.getByRole('button', { name: 'Disable', exact: true }),
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
      path: 'hub/apps/crm/api-keys/key-id/disable',
      method: 'POST',
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Delete', exact: true }),
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
        within(screen.getByRole('dialog')).getByText(
          'The action could not be completed. Check your permissions and try again.',
        ),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText('CI')).toBeInTheDocument();
  });
  it('does not fetch keys for users without management access', () => {
    render(
      <ApiKeys
        appId='crm'
        appName='CRM'
        capabilities={emptyHubCapabilities()}
      />,
    );
    expect(
      screen.getByText(
        'You do not have permission to manage this application’s API keys.',
      ),
    ).toBeInTheDocument();
    expect(mocks.request).not.toHaveBeenCalled();
  });
});
