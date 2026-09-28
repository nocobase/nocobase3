import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

// Keys stand in for the wording, so the assertions show which key names the link.
vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { BackButton } from '@/components/back-button';

function renderAt(url: string, child: ReactElement) {
  const router = createMemoryRouter(
    [
      {
        path: '/projects',
        element: (
          <>
            <h1>List</h1>
            <Outlet />
          </>
        ),
        // A child page with a two-segment path, like a second route to the same overlay: `..` is still the list.
        children: [
          { path: ':projectId', element: child },
          { path: 'import/:batchId', element: child },
        ],
      },
      { path: '/overview', element: <h1>Overview</h1> },
    ],
    { initialEntries: [url] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe('BackButton', () => {
  it('leads to the parent route and keeps the query string', async () => {
    const router = renderAt('/projects/12?q=alpha&page=2', <BackButton />);

    const link = screen.getByRole('link', { name: 'navigation.back' });
    expect(link).toHaveAttribute('href', '/projects?q=alpha&page=2');

    await userEvent.click(link);
    expect(router.state.location.pathname).toBe('/projects');
    expect(router.state.location.search).toBe('?q=alpha&page=2');
    // Leaving the child page replaces its entry, as closing an overlay does.
    expect(router.state.historyAction).toBe('REPLACE');
  });

  it('resolves the parent by route, not by path segment', () => {
    renderAt('/projects/import/7', <BackButton />);

    expect(
      screen.getByRole('link', { name: 'navigation.back' }),
    ).toHaveAttribute('href', '/projects');
  });

  it('takes a destination and a label of its own', () => {
    renderAt(
      '/projects/12',
      <BackButton to='/overview'>Back to the overview</BackButton>,
    );

    expect(
      screen.getByRole('link', { name: 'Back to the overview' }),
    ).toHaveAttribute('href', '/overview');
  });
});
