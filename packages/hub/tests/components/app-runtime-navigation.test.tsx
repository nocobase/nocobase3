import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import LegacyAppSettingsRedirect from '../../client/pages/apps/settings';
import LegacyAppStorageSettingsRedirect from '../../client/pages/apps/settings-storage-redirect';

vi.mock('@refinedev/core', () => ({
  useLink:
    () =>
    ({
      to,
      children,
      ...props
    }: React.ComponentProps<'a'> & { to: string }) => (
      <a href={to} {...props}>
        {children}
      </a>
    ),
}));

describe('App runtime navigation', () => {
  it.each([
    ['/apps/crm/settings', LegacyAppSettingsRedirect],
    ['/apps/crm/settings/storage', LegacyAppStorageSettingsRedirect],
  ])(
    'redirects legacy settings route %s to runtime resources',
    (path, Page) => {
      render(
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path='/apps/:appId/settings' element={<Page />} />
            <Route path='/apps/:appId/settings/storage' element={<Page />} />
            <Route
              path='/apps/:appId/resources'
              element={<div>CRM runtime resources</div>}
            />
          </Routes>
        </MemoryRouter>,
      );

      expect(screen.getByText('CRM runtime resources')).toBeVisible();
    },
  );
});
