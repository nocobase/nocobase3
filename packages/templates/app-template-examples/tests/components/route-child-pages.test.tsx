import {
  resolveAppClientContributions,
  type AppClientRegisteredRoute,
} from '@nocobase/app-client/plugins';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { Breadcrumbs } from '../../client/components/breadcrumbs.js';
import RouteChildPageDetailPage from '../../client/pages/route-child-page-detail.js';
import RouteOverlaysPage from '../../client/pages/route-overlays.js';
import applicationRoutes from '../../client/routes.js';
import {
  CurrentRouteProvider,
  RouteMetadataBoundary,
} from '../../client/routing/route-context.js';

vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue ?? key,
  }),
}));

// The real registrations, so the trail is exercised against the paths and titles the application actually declares.
const registered = resolveAppClientContributions([
  {
    packageName: '@nocobase/app-template-examples',
    source: 'application',
    routes: applicationRoutes,
  },
]).routes;

const flatten = (
  nodes: readonly AppClientRegisteredRoute[],
): AppClientRegisteredRoute[] =>
  nodes.flatMap((node) => [node, ...flatten(node.children ?? [])]);

const routeNamed = (name: string): AppClientRegisteredRoute => {
  const route = flatten(registered).find((entry) => entry.name === name);
  if (!route) throw new Error(`No route named "${name}"`);
  return route;
};

const trailAt = (pathname: string) => (
  <MemoryRouter initialEntries={[pathname]}>
    <RouteMetadataBoundary routes={registered}>
      <Breadcrumbs />
    </RouteMetadataBoundary>
  </MemoryRouter>
);

describe('nested example pages', () => {
  it('adds a level for each page in the chain', () => {
    render(trailAt('/route-overlays/pages/quotation'));

    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute(
      'href',
      '/',
    );
    expect(
      screen.getByRole('link', { name: 'navigation.routeOverlays' }),
    ).toHaveAttribute('href', '/route-overlays');
    expect(
      screen.getByRole('link', { name: 'routeOverlays.childPagesTitle' }),
    ).toHaveAttribute('href', '/route-overlays/pages');
    // The parameterised level links to the record the user opened, not to `:recordId`.
    expect(
      screen.getByText('routeOverlays.childPageDetailTitle'),
    ).toHaveAttribute('aria-current', 'page');
  });

  it('leaves the trail alone when an overlay opens over a page', () => {
    render(trailAt('/route-overlays/pages/quotation/dialog'));

    expect(
      screen.getByText('routeOverlays.childPageDetailTitle'),
    ).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByText('dialog')).not.toBeInTheDocument();
  });

  it('shows no trail while only overlays are open', () => {
    render(trailAt('/route-overlays/dialog/drawer'));

    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('hands the surface to a child page but keeps it under an overlay', () => {
    const overlays = routeNamed('routeOverlays');
    const page = (pathname: string) => (
      <MemoryRouter initialEntries={[pathname]}>
        <RouteMetadataBoundary routes={registered}>
          <CurrentRouteProvider route={overlays}>
            <RouteOverlaysPage />
          </CurrentRouteProvider>
        </RouteMetadataBoundary>
      </MemoryRouter>
    );

    const { unmount } = render(page('/route-overlays/dialog'));
    expect(
      screen.getByRole('heading', { name: 'routeOverlays.title', level: 1 }),
    ).toBeVisible();
    unmount();

    render(page('/route-overlays/pages'));
    expect(
      screen.queryByRole('heading', { name: 'routeOverlays.title' }),
    ).not.toBeInTheDocument();
  });

  it('names the detail page after the record it loaded', () => {
    render(
      <MemoryRouter initialEntries={['/route-overlays/pages/quotation']}>
        <RouteMetadataBoundary routes={registered}>
          <CurrentRouteProvider route={routeNamed('routeChildPageDetail')}>
            <Routes>
              <Route
                element={<RouteChildPageDetailPage />}
                path='/route-overlays/pages/:recordId/*'
              />
            </Routes>
          </CurrentRouteProvider>
        </RouteMetadataBoundary>
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'routeOverlays.recordQuotation',
      }),
    ).toBeVisible();
    // The reported title replaces the route's declared one in the trail.
    expect(
      screen.getByText('routeOverlays.recordQuotation', { selector: 'span' }),
    ).toHaveAttribute('aria-current', 'page');
  });
});
