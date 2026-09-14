import type { AppClientRegisteredRoute } from '@nocobase/app-client/plugins';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { Breadcrumbs } from '../../client/components/breadcrumbs.js';
import {
  RouteMetadataBoundary,
  RouteTrailProvider,
} from '../../client/routing/route-context.js';

vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue ?? key,
  }),
}));

const route = (
  name: string,
  path: string,
  extra: Partial<AppClientRegisteredRoute> = {},
): AppClientRegisteredRoute => ({
  auth: 'required',
  children: [],
  componentLoader: async () => ({ default: () => null }),
  id: name,
  name,
  packageName: 'test',
  path,
  source: 'application',
  ...extra,
});

const inTrail = (
  entries: readonly { route: AppClientRegisteredRoute; pathname: string }[],
) => entries.map((entry) => ({ ...entry, title: entry.route.title }));

describe('Breadcrumbs', () => {
  it('renders one level per titled destination', () => {
    render(
      <MemoryRouter initialEntries={['/orders/archived']}>
        <RouteTrailProvider
          trail={inTrail([
            {
              route: route('orders', '/orders', { title: 'Orders' }),
              pathname: '/orders',
            },
            {
              route: route('archived', '/orders/archived', {
                title: 'Archived',
              }),
              pathname: '/orders/archived',
            },
          ])}
        >
          <Breadcrumbs />
        </RouteTrailProvider>
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('navigation', { name: 'Breadcrumb' }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute(
      'href',
      '/',
    );
    expect(screen.getByRole('link', { name: 'Orders' })).toHaveAttribute(
      'href',
      '/orders',
    );
    expect(screen.getByText('Archived')).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('links a parameterised level to where the user is, not to its pattern', () => {
    const orders = route('orders', '/orders', { title: 'Orders' });
    const detail = route('orderDetail', '/orders/edit/:id', {
      title: 'Edit order',
    });
    const details = route('orderDetailInfo', '/orders/edit/:id/details', {
      title: 'Details',
    });
    const tree = [
      { ...orders, children: [{ ...detail, children: [details] }] },
    ];

    render(
      <MemoryRouter initialEntries={['/orders/edit/42/details']}>
        <RouteMetadataBoundary routes={tree}>
          <Breadcrumbs />
        </RouteMetadataBoundary>
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Edit order' })).toHaveAttribute(
      'href',
      '/orders/edit/42',
    );
    expect(screen.getByText('Details')).toHaveAttribute('aria-current', 'page');
  });

  it('skips levels that are structure rather than a destination', () => {
    const orders = route('orders', '/orders', { title: 'Orders' });
    // A tab and an overlay own a path segment but name no destination.
    const tab = route('ordersOpenTab', '/orders/open');
    const overlay = route('orderPreview', '/orders/open/preview');
    const tree = [{ ...orders, children: [{ ...tab, children: [overlay] }] }];

    render(
      <MemoryRouter initialEntries={['/orders/open/preview']}>
        <RouteMetadataBoundary routes={tree}>
          <Breadcrumbs />
        </RouteMetadataBoundary>
      </MemoryRouter>,
    );

    // Only Orders is titled, so the trail would be `Home / Orders` and is suppressed by the depth rule.
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('renders a group as plain text because no page sits behind it', () => {
    render(
      <MemoryRouter initialEntries={['/settings/automation/workflows']}>
        <RouteTrailProvider
          trail={inTrail([
            {
              route: route('automation', '/settings/automation', {
                title: 'Automation',
                componentLoader: undefined,
              }),
              pathname: '/settings/automation',
            },
            {
              route: route('workflows', '/settings/automation/workflows', {
                title: 'Workflows',
              }),
              pathname: '/settings/automation/workflows',
            },
          ])}
        >
          <Breadcrumbs />
        </RouteTrailProvider>
      </MemoryRouter>,
    );

    expect(
      screen.queryByRole('link', { name: 'Automation' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Automation')).toBeVisible();
    expect(screen.getByText('Workflows')).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('takes the root from the surface the page is rendered in', () => {
    const automation = route('automation', '/settings/automation', {
      title: 'Automation',
      componentLoader: undefined,
    });
    const workflows = route('workflows', '/settings/automation/workflows', {
      title: 'Workflows',
    });
    const tree = [{ ...automation, children: [workflows] }];

    render(
      <MemoryRouter initialEntries={['/settings/automation/workflows']}>
        {/* A surface states that it has no root crumb; the page inside it passes nothing. */}
        <RouteMetadataBoundary home={null} routes={tree}>
          <Breadcrumbs />
        </RouteMetadataBoundary>
      </MemoryRouter>,
    );

    expect(
      screen.queryByRole('link', { name: 'Home' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Automation')).toBeVisible();
    expect(screen.getByText('Workflows')).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('omits Home when the page asks for no root crumb', () => {
    render(
      <MemoryRouter initialEntries={['/settings/automation/workflows']}>
        <RouteTrailProvider
          trail={inTrail([
            {
              route: route('automation', '/settings/automation', {
                title: 'Automation',
                componentLoader: undefined,
              }),
              pathname: '/settings/automation',
            },
            {
              route: route('workflows', '/settings/automation/workflows', {
                title: 'Workflows',
              }),
              pathname: '/settings/automation/workflows',
            },
          ])}
        >
          <Breadcrumbs home={null} />
        </RouteTrailProvider>
      </MemoryRouter>,
    );

    expect(
      screen.queryByRole('link', { name: 'Home' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Automation')).toBeVisible();
    expect(screen.getByText('Workflows')).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('stays hidden on a top-level page', () => {
    render(
      <MemoryRouter initialEntries={['/articles']}>
        <RouteTrailProvider
          trail={inTrail([
            {
              route: route('articles', '/articles', { title: 'Articles' }),
              pathname: '/articles',
            },
          ])}
        >
          <Breadcrumbs />
        </RouteTrailProvider>
      </MemoryRouter>,
    );

    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });
});
