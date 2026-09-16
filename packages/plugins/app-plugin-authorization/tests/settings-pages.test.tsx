vi.mock('../../app-plugin-authz-restriction-rules/client/api.js', () => ({
  authz: mocks.authz,
}));
vi.mock('../../app-plugin-authz-sharing-rules/client/api.js', () => ({
  authz: mocks.authz,
}));
vi.mock('../../app-plugin-authz-default-access/client/api.js', () => ({
  authz: mocks.authz,
}));
// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthorizationOptions } from '../client/authorization-client.js';

const mocks = vi.hoisted(() => ({
  authz: {
    loadOptions: vi.fn(),
    listUsers: vi.fn(),
    listPermissionSets: vi.fn(),
    listDefaultAccess: vi.fn(),
    listSharingRules: vi.fn(),
    listRestrictionRules: vi.fn(),
  },
}));

vi.mock('../client/runtime.js', () => ({
  getAuthorizationClient: () => mocks.authz,
}));
vi.mock('@nocobase/app-client', () => ({
  useClientApplication: () => ({ runtime: { routes: [] } }),
}));
vi.mock('@nocobase/i18n/client', async () => {
  const { translate } = await import('./locale-harness.js');
  return { useTranslation: () => ({ t: translate }) };
});

import enUS from './rule-locales.js';
import DefaultAccessPage from '../../app-plugin-authz-default-access/client/pages/default-access-page.js';
import PermissionSetsPage from '../client/pages/permission-sets-page.js';
import RestrictionRulesPage from '../../app-plugin-authz-restriction-rules/client/pages/restriction-rules-page.js';
import SharingRulesPage from '../../app-plugin-authz-sharing-rules/client/pages/sharing-rules-page.js';

const options: AuthorizationOptions = {
  plugins: [],
  resourceTypes: [],
  subjectTypes: [],
  collections: [],
  recordAccessPolicies: [],
};

const pages = [
  { name: enUS.permissionSets.page.title, Page: PermissionSetsPage },
  { name: enUS.defaultAccess.page.title, Page: DefaultAccessPage },
  { name: enUS.sharingRules.page.title, Page: SharingRulesPage },
  { name: enUS.restrictionRules.page.title, Page: RestrictionRulesPage },
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authz.loadOptions.mockResolvedValue(options);
  mocks.authz.listUsers.mockResolvedValue([]);
  mocks.authz.listPermissionSets.mockResolvedValue([]);
  mocks.authz.listDefaultAccess.mockResolvedValue([]);
  mocks.authz.listSharingRules.mockResolvedValue([]);
  mocks.authz.listRestrictionRules.mockResolvedValue([]);
});

describe('authorization settings pages', () => {
  it.each(pages)('renders the $name shell heading', async ({ name, Page }) => {
    render(
      <MemoryRouter>
        <Page />
      </MemoryRouter>,
    );
    const heading = await screen.findByRole('heading', { level: 1, name });
    // Each page says in one sentence what its layer does.
    if (Page === PermissionSetsPage) return;
    expect(heading.parentElement?.querySelector('p')?.textContent).toMatch(
      /grant|widen|narrow/,
    );
  });

  it('shows the shared loading state while the options are in flight', () => {
    mocks.authz.loadOptions.mockReturnValue(new Promise(() => undefined));
    render(<SharingRulesPage />);
    expect(screen.getByText(enUS.common.loading)).toBeInTheDocument();
  });

  it('shows the shared error state with a retry when loading fails', async () => {
    mocks.authz.loadOptions.mockRejectedValue(new Error('Options failed.'));
    render(<SharingRulesPage />);
    expect(await screen.findByText('Options failed.')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: enUS.common.retry }),
    ).toBeInTheDocument();
  });

  it('shows the refusal without a retry when the options are forbidden', async () => {
    mocks.authz.loadOptions.mockRejectedValue(
      Object.assign(new Error('Forbidden.'), { status: 403 }),
    );
    render(<RestrictionRulesPage />);
    expect(await screen.findByText('Forbidden.')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: enUS.common.retry }),
    ).toBeNull();
  });
});
