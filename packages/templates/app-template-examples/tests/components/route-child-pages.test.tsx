import {
  resolveAppClientContributions,
  type AppClientRegisteredRoute,
} from '@nocobase/app-client/plugins';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { Breadcrumbs } from '../../client/components/breadcrumbs.js';
import RouteChildPageQuotationPage from '../../client/pages/route-child-page-quotation.js';
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
    expect(screen.getByText('routeOverlays.topicQuotation')).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('names each sibling page separately', () => {
    render(trailAt('/route-overlays/pages/renewal'));

    expect(screen.getByText('routeOverlays.topicRenewal')).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(
      screen.queryByText('routeOverlays.topicQuotation'),
    ).not.toBeInTheDocument();
  });

  it('leaves the trail alone when an overlay opens over a page', () => {
    render(trailAt('/route-overlays/pages/quotation/dialog'));

    // The deepest level is still the page, because the dialog below it names no destination.
    expect(screen.getByText('routeOverlays.topicQuotation')).toHaveAttribute(
      'aria-current',
      'page',
    );
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

  it('heads a child page with the same title its route declares', () => {
    render(
      <MemoryRouter initialEntries={['/route-overlays/pages/quotation']}>
        <RouteMetadataBoundary routes={registered}>
          <CurrentRouteProvider route={routeNamed('routeChildPageQuotation')}>
            <RouteChildPageQuotationPage />
          </CurrentRouteProvider>
        </RouteMetadataBoundary>
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'routeOverlays.topicQuotation',
      }),
    ).toBeVisible();
    expect(
      screen.getByText('routeOverlays.topicQuotation', { selector: 'span' }),
    ).toHaveAttribute('aria-current', 'page');
  });
});
