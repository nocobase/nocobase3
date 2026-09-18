// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { expect, it, vi } from 'vitest';
import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import locales from '../client/locales/index.js';
import { PermissionSetsPanel } from '../client/pages/permission-sets/panel.js';
import DetailsPage from '../client/pages/permission-set-details-page.js';
const api = vi.hoisted(() => ({
  can: vi.fn(async () => true),
  getPermissionsRevision: () => 0,
  onPermissionsInvalidated: vi.fn(() => () => {}),
  listPermissionSets: vi.fn(),
  listAssignments: vi.fn(),
}));
vi.mock('../client/use-authorization-client.js', () => ({
  useAuthorizationClient: () => api,
}));

it('switches preset names in place without refetching or translating editable data', async () => {
  api.listPermissionSets.mockResolvedValue([
    {
      key: 'root',

      grants: [],
      title: {
        key: 'permissionSets.builtIn.root',
        ns: '@nocobase/app-plugin-authorization',
      },
    },
    { key: 'custom', title: 'My team', grants: [] },
  ]);
  api.listAssignments.mockResolvedValue([]);
  const runtime = new I18nRuntime({
    defaultLocale: 'en-US',
    locales: ['en-US', 'zh-CN'],
    applicationNamespace: 'test',
  });
  runtime.registerNamespace('@nocobase/app-plugin-authorization', locales);
  await runtime.init('en-US');
  render(
    <I18nProvider runtime={runtime}>
      <MemoryRouter initialEntries={['/sets/edit/root/details']}>
        <Routes>
          <Route
            path='/sets'
            element={
              <PermissionSetsPanel
                options={{
                  plugins: [],
                  subjectTypes: [],
                  resourceTypes: [],
                  collections: [],
                  recordAccessPolicies: [],
                }}
              />
            }
          >
            <Route
              path='edit/:permissionSetKey/details'
              element={<DetailsPage />}
            />
          </Route>
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  );
  expect(
    await screen.findByRole('button', { name: 'System administrator' }),
  ).toBeInTheDocument();
  const requests = api.listPermissionSets.mock.calls.length;
  await act(() => runtime.changeLanguage('zh-CN'));
  expect(
    screen.getByRole('button', { name: '系统管理员' }),
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'My team' })).toBeInTheDocument();
  expect(screen.getByDisplayValue('System administrator')).toBeInTheDocument();
  expect(api.listPermissionSets).toHaveBeenCalledTimes(requests);
});
