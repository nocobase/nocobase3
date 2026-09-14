import type { AppClientRegisteredRoute } from '@nocobase/app-client/plugins';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { PageHeader } from '../../client/components/page-header.js';
import { RouteTrailProvider } from '../../client/routing/route-context.js';

vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue ?? key,
  }),
}));

const page = (
  name: string,
  path: string,
  title: string,
): { route: AppClientRegisteredRoute; pathname: string; title: string } => ({
  pathname: path,
  route: {
    auth: 'required',
    children: [],
    componentLoader: async () => ({ default: () => null }),
    id: name,
    name,
    packageName: 'test',
    path,
    source: 'application',
    title,
  },
  title,
});

describe('PageHeader', () => {
  it('renders the title, description, and right-aligned actions', () => {
    render(
      <PageHeader
        title='Route dialogs and drawers'
        description='Explore URL-addressable overlays.'
        actions={<button type='button'>Create example</button>}
      />,
    );

    expect(
      screen.getByRole('heading', {
        name: 'Route dialogs and drawers',
        level: 1,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Explore URL-addressable overlays.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Create example' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button').parentElement).toHaveClass(
      'flex',
      'items-center',
      'gap-2',
    );
  });

  it('omits an empty description and actions area', () => {
    render(<PageHeader title='Only a title' />);

    expect(screen.getByRole('heading', { name: 'Only a title' })).toBeVisible();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('carries the trail above the title', () => {
    render(
      <MemoryRouter initialEntries={['/orders/archived']}>
        <RouteTrailProvider
          trail={[
            page('orders', '/orders', 'Orders'),
            page('archived', '/orders/archived', 'Archived'),
          ]}
        >
          <PageHeader title='Archived orders' />
        </RouteTrailProvider>
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Orders' })).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'Archived orders', level: 1 }),
    ).toBeVisible();
  });

  it('leaves the trail out when the page places it itself', () => {
    render(
      <MemoryRouter initialEntries={['/orders/archived']}>
        <RouteTrailProvider
          trail={[
            page('orders', '/orders', 'Orders'),
            page('archived', '/orders/archived', 'Archived'),
          ]}
        >
          <PageHeader breadcrumbs={false} title='Archived orders' />
        </RouteTrailProvider>
      </MemoryRouter>,
    );

    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });
});
