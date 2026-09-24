// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';

const client = vi.hoisted(() => ({
  can: vi.fn(async () => true),
  revision: () => 0,
  onInvalidated: vi.fn(() => () => {}),
  loadOptions: vi.fn(),
  listPermissionSets: vi.fn(),
}));
vi.mock('../../client/use-authorization-client.js', () => ({
  useAuthorizationClient: () => client,
}));
vi.mock('@nocobase/app-client', () => ({
  useClientApplication: () => ({ runtime: { routes: [] } }),
}));
vi.mock('@nocobase/i18n/client', async (importOriginal) =>
  (await import('../helpers/react.js')).translationMock(importOriginal),
);

import PermissionSetsPage from '../../client/pages/permission-sets-page.js';
import { translate } from '../helpers/locale-harness.js';

function mount(): void {
  render(
    <MemoryRouter>
      <PermissionSetsPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  client.listPermissionSets.mockResolvedValue([]);
});

it('shows the shared loading state while the options are in flight', () => {
  client.loadOptions.mockReturnValue(new Promise(() => undefined));
  mount();
  expect(screen.getByText(translate('common.loading'))).toBeInTheDocument();
});

it('shows the shared error state with a retry when loading fails', async () => {
  client.loadOptions.mockRejectedValue(new Error('Options failed.'));
  mount();
  expect(await screen.findByText('Options failed.')).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: translate('common.retry') }),
  ).toBeInTheDocument();
});

it('shows the refusal without a retry when the options are forbidden', async () => {
  client.loadOptions.mockRejectedValue(
    Object.assign(new Error('Forbidden.'), { status: 403 }),
  );
  mount();
  expect(await screen.findByText('Forbidden.')).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: translate('common.retry') }),
  ).toBeNull();
});
