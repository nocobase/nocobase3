import { resolveAppClientContributions } from '@nocobase/app-client/plugins';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { Breadcrumbs } from '../../client/components/breadcrumbs.js';
import RouteChildPageQuotationPage from '../../client/pages/route-overlays/pages/quotation/index.js';
import RouteOverlaysPage from '../../client/pages/route-overlays/index.js';
import applicationRoutes from '../../client/routes.js';
import { RouteTreeProvider } from '../../client/routing/route-context.js';

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

const trailAt = (pathname: string) => (
  <MemoryRouter initialEntries={[pathname]}>
    <RouteTreeProvider routes={registered}>
      <Breadcrumbs />
    </RouteTreeProvider>
  </MemoryRouter>
);

describe('nested example pages', () => {
  it('adds a level for each page in the chain', () => {
    render(trailAt('/route-overlays/pages/quotation'));

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

  it('keeps the page beneath rendered when a child page is open', () => {
    render(
      <MemoryRouter initialEntries={['/route-overlays/pages']}>
        <RouteTreeProvider routes={registered}>
          <RouteOverlaysPage />
        </RouteTreeProvider>
      </MemoryRouter>,
    );

    // The child page lays itself over this one rather than replacing it, so a draft typed here would survive.
    expect(
      screen.getByRole('heading', { name: 'routeOverlays.title', level: 1 }),
    ).toBeVisible();
  });

  it('heads a child page with the same title its route declares', () => {
    render(
      <MemoryRouter initialEntries={['/route-overlays/pages/quotation']}>
        <RouteTreeProvider routes={registered}>
          <RouteChildPageQuotationPage />
        </RouteTreeProvider>
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
