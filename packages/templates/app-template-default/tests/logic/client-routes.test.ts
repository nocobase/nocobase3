import {
  resolveAppClientContributions,
  type AppClientRegisteredRoute,
} from '@nocobase/app-client/plugins';
import { describe, expect, it } from 'vitest';

import applicationRoutes from '../../client/routes.ts';
import routeComponentOverrides from '../../client/route-overrides.ts';
import sourceExtensions from '../../client/source-extensions.ts';

describe('app client routes', () => {
  it('owns authentication pages instead of overriding plugin routes', () => {
    expect(sourceExtensions).toEqual([]);
    expect(routeComponentOverrides).toEqual([]);
  });

  it('declares application and settings route contributions', async () => {
    expect(applicationRoutes).toHaveLength(2);
    const [app, settings] = applicationRoutes;
    expect(app).toMatchObject({
      parent: 'app',
      routes: [
        { auth: 'required', authz: 'skip', name: 'home', path: '/' },
        {
          auth: 'required',
          name: 'examples',
          navigation: { title: 'examples.title' },
        },
        {
          auth: 'required',
          name: 'components',
          navigation: { title: 'components.title' },
        },
        { auth: 'guest', name: 'login', path: '/login' },
        { auth: 'guest', name: 'register', path: '/register' },
        {
          auth: 'guest',
          name: 'forgot-password',
          path: '/forgot-password',
        },
        { auth: 'guest', name: 'reset-password', path: '/reset-password' },
      ],
    });
    expect(settings).toEqual({ parent: 'settings', routes: [] });
    expect(Object.isFrozen(app)).toBe(true);
    expect(Object.isFrozen(settings)).toBe(true);
    for (const route of app.routes) {
      if (!route.componentLoader) continue;
      await expect(route.componentLoader()).resolves.toMatchObject({
        default: expect.any(Function),
      });
    }
  });

  it('loads a page for every reference route', async () => {
    // The reference pages are application pages under two groups; neither group carries a page of its own, and the
    // two are declared in navigation order.
    const groups = applicationRoutes[0].routes.filter(
      (route) => route.children,
    );
    expect(groups.map((group) => group.name)).toEqual([
      'examples',
      'components',
    ]);
    const pages = groups.flatMap((group) => group.children ?? []);
    // Every shadcn's ui primitive has a page and every example is a complete screen, so this covers the whole set.
    expect(pages).toHaveLength(72);
    for (const page of pages) {
      // Every reference page is reachable by any signed-in user, and none of them is a page-authorization resource:
      // they are working material for building the application, not a feature anyone grants access to.
      expect(page.auth).toBe('required');
      expect(page.authz).toBe('skip');
      expect(page.path).toMatch(/^\/(examples|components)\/[a-z-]+$/);
      if (!page.componentLoader) throw new Error(`\${page.name} has no page`);
      await expect(page.componentLoader()).resolves.toMatchObject({
        default: expect.any(Function),
      });
    }
  });

  it('pins the route names page grants are stored against', () => {
    // A route's `name` is the identifier a stored page grant records. Renaming one is a data change that has to
    // migrate the grants that name it, not a refactor — so changing this list deliberately is the point.
    const resolved = resolveAppClientContributions([
      {
        packageName: '@nocobase/app-template-default',
        routes: applicationRoutes,
        source: 'application',
      },
    ]);

    expect(pageAuthorizations(resolved.routes)).toEqual(
      // The landing page and every reference page opted out of page authorization, so they are reachable by every
      // signed-in user and no grant names them.
      [
        'home',
        'examples-dashboard',
        'examples-orders',
        'examples-customers',
        'examples-product-form',
        'examples-inbox',
        'examples-survey',
        'examples-team-settings',
        'examples-schedule',
        'components-accordion',
        'components-alert',
        'components-alert-dialog',
        'components-aspect-ratio',
        'components-attachment',
        'components-avatar',
        'components-badge',
        'components-breadcrumb',
        'components-bubble',
        'components-button',
        'components-button-group',
        'components-calendar',
        'components-card',
        'components-carousel',
        'components-chart',
        'components-checkbox',
        'components-collapsible',
        'components-combobox',
        'components-command',
        'components-context-menu',
        'components-data-table',
        'components-date-picker',
        'components-dialog',
        'components-direction',
        'components-drawer',
        'components-dropdown-menu',
        'components-empty',
        'components-field',
        'components-hover-card',
        'components-input',
        'components-input-group',
        'components-input-otp',
        'components-item',
        'components-kbd',
        'components-label',
        'components-marker',
        'components-menubar',
        'components-message',
        'components-message-scroller',
        'components-native-select',
        'components-navigation-menu',
        'components-pagination',
        'components-popover',
        'components-progress',
        'components-questionnaire',
        'components-radio-group',
        'components-resizable',
        'components-scroll-area',
        'components-select',
        'components-separator',
        'components-sheet',
        'components-sidebar',
        'components-skeleton',
        'components-slider',
        'components-spinner',
        'components-switch',
        'components-table',
        'components-tabs',
        'components-textarea',
        'components-toast',
        'components-toggle',
        'components-toggle-group',
        'components-tooltip',
        'components-typography',
      ].map((name) => ({ name, authorizedAs: null })),
    );
  });
});

/** Page authorization comes directly from the registered tree. */
function pageAuthorizations(
  routes: readonly AppClientRegisteredRoute[],
): { name: string; authorizedAs: string | null }[] {
  return routes.flatMap((route) => [
    ...(route.componentLoader && route.auth === 'required'
      ? [
          {
            name: route.name,
            authorizedAs:
              route.authz === 'skip'
                ? null
                : route.authz.resource.type === 'page'
                  ? route.authz.resource.id
                  : `\${route.authz.resource.type}:\${route.authz.resource.id}`,
          },
        ]
      : []),
    ...pageAuthorizations(route.children ?? []),
  ]);
}
