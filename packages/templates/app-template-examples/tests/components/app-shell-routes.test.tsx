import type { AppClientRegisteredRoute } from '@nocobase/app-client/plugins';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { expect, it, vi } from 'vitest';

import { AppShell } from '../../client/shell/app-shell.js';
import { Breadcrumbs } from '../../client/components/breadcrumbs.js';

vi.mock('@nocobase/app-plugin-i18n/client', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@nocobase/app-plugin-i18n/client')
  >()),
  useSyncServerLocale: () => {},
}));
vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue ?? key,
  }),
}));
vi.mock('../../client/shell/app-header.js', () => ({ AppHeader: () => null }));
vi.mock('../../client/shell/app-sidebar.js', () => ({
  AppSidebar: () => null,
}));

it('provides business route breadcrumbs to its outlet without an outer provider', () => {
  const child: AppClientRegisteredRoute = {
    id: 'detail',
    name: 'detail',
    packageName: 'test',
    source: 'application',
    auth: 'required',
    path: '/orders/:id',
    breadcrumb: { title: 'Detail' },
    componentLoader: async () => ({ default: () => null }),
  };
  const routes = [
    {
      ...child,
      id: 'orders',
      name: 'orders',
      path: '/orders',
      breadcrumb: { title: 'Orders' },
      children: [child],
    },
  ];
  render(
    <MemoryRouter initialEntries={['/orders/42']}>
      <Routes>
        <Route element={<AppShell routes={routes} />}>
          <Route path='/orders/:id' element={<Breadcrumbs />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
  expect(screen.getByRole('link', { name: 'Orders' })).toHaveAttribute(
    'href',
    '/orders',
  );
  expect(screen.getByText('Detail')).toHaveAttribute('aria-current', 'page');
});
