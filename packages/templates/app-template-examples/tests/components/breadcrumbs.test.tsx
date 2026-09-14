import type { AppClientRegisteredRoute } from '@nocobase/app-client/plugins';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { Breadcrumbs } from '../../client/components/breadcrumbs.js';
import {
  RouteMetadataBoundary,
  RouteMetadataProvider,
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
  title?: string,
): AppClientRegisteredRoute => ({
  auth: 'required',
  children: [],
  componentLoader: async () => ({ default: () => null }),
  id: name,
  name,
  navigation: title ? { title } : undefined,
  packageName: 'test',
  path,
  source: 'application',
});

describe('Breadcrumbs', () => {
  it('derives the trail from matched route metadata without props', () => {
    const matches = [
      route('routeOverlays', '/route-overlays', 'Route dialogs and drawers'),
      route('dialog', '/route-overlays/dialog', 'Dialog example'),
    ];

    render(
      <MemoryRouter initialEntries={['/route-overlays/dialog']}>
        <RouteMetadataProvider routes={matches}>
          <Breadcrumbs />
        </RouteMetadataProvider>
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('navigation', { name: 'Breadcrumb' }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute(
      'href',
      '/',
    );
    expect(
      screen.getByRole('link', { name: 'Route dialogs and drawers' }),
    ).toHaveAttribute('href', '/route-overlays');
    expect(screen.getByText('Dialog example')).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getAllByRole('presentation', { hidden: true })).toHaveLength(
      2,
    );
  });

  it('renders the home entry as the current page at the root route', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <RouteMetadataProvider routes={[route('home', '/', 'Home')]}>
          <Breadcrumbs />
        </RouteMetadataProvider>
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Home' }).tagName).toBe('SPAN');
  });

  it('resolves the current trail from the route tree', () => {
    const parent = route(
      'routeOverlays',
      '/route-overlays',
      'Route dialogs and drawers',
    );
    const child = route('dialog', '/route-overlays/dialog', 'Dialog example');
    const tree = [{ ...parent, children: [child] }];

    render(
      <MemoryRouter initialEntries={['/route-overlays/dialog']}>
        <RouteMetadataBoundary routes={tree}>
          <Routes>
            <Route path='/route-overlays/*' element={<Breadcrumbs />} />
          </Routes>
        </RouteMetadataBoundary>
      </MemoryRouter>,
    );

    expect(screen.getByText('Dialog example')).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('includes component routes without navigation metadata in deep trails', () => {
    const parent = route(
      'routeOverlays',
      '/route-overlays',
      'Route dialogs and drawers',
    );
    const dialog = route('routeDialogExample', 'dialog');
    const drawer = route('routeDialogDrawerExample', 'drawer');
    const tree = [{ ...parent, children: [{ ...dialog, children: [drawer] }] }];

    render(
      <MemoryRouter initialEntries={['/route-overlays/dialog/drawer']}>
        <RouteMetadataBoundary routes={tree}>
          <Routes>
            <Route path='/route-overlays/*' element={<Breadcrumbs />} />
          </Routes>
        </RouteMetadataBoundary>
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('link', { name: 'Route dialogs and drawers' }),
    ).toHaveAttribute('href', '/route-overlays');
    expect(screen.getByText('Dialog')).toBeInTheDocument();
    expect(screen.getByText('Drawer')).toHaveAttribute('aria-current', 'page');
  });
});
