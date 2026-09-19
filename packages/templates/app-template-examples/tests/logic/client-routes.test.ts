import {
  resolveAppClientContributions,
  type AppClientRegisteredRoute,
  type AppClientRouteDefinition,
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
    expect(applicationRoutes[0]).toMatchObject({
      parent: 'app',
      routes: [
        {
          auth: 'required',
          name: 'home',
          path: '/',
        },
        {
          auth: 'required',
          name: 'notifications',
          path: '/notifications',
        },
        {
          auth: 'required',
          name: 'routeOverlays',
          path: '/route-overlays',
          children: [
            {
              name: 'routeDialogExample',
              path: 'dialog',
              children: [{ name: 'routeDialogDrawerExample', path: 'drawer' }],
            },
            {
              name: 'routeDrawerExample',
              path: 'drawer',
              children: [{ name: 'routeDrawerDialogExample', path: 'dialog' }],
            },
            {
              name: 'routeChildPages',
              path: 'pages',
              breadcrumb: { title: 'routeOverlays.childPagesTitle' },
              children: [
                {
                  name: 'routeChildPageQuotation',
                  path: 'quotation',
                  breadcrumb: { title: 'routeOverlays.topicQuotation' },
                  children: [{ name: 'routeChildPageDialog', path: 'dialog' }],
                },
                {
                  name: 'routeChildPageOnboarding',
                  path: 'onboarding',
                  breadcrumb: { title: 'routeOverlays.topicOnboarding' },
                },
                {
                  name: 'routeChildPageRenewal',
                  path: 'renewal',
                  breadcrumb: { title: 'routeOverlays.topicRenewal' },
                },
              ],
            },
          ],
        },
        { auth: 'required', name: 'articles', path: '/articles' },
        {
          auth: 'required',
          name: 'numeric-examples',
          path: '/numeric-examples',
        },
        { auth: 'required', name: 'external-crm', path: '/external-crm' },
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
    expect(applicationRoutes[1]).toEqual({
      parent: 'settings',
      routes: [],
    });
    expect(Object.isFrozen(applicationRoutes[0])).toBe(true);
    expect(Object.isFrozen(applicationRoutes[1])).toBe(true);
    const routes = applicationRoutes[0].routes;
    const overlays = routes.find((route) => route.name === 'routeOverlays');
    expect(overlays).toBeDefined();
    const dialogs = overlays?.children ?? [];
    // Two overlays and the nested page chain.
    expect(dialogs).toHaveLength(3);
    const collect = (
      nodes: readonly AppClientRouteDefinition[],
    ): AppClientRouteDefinition[] =>
      nodes.flatMap((node) => [node, ...collect(node.children ?? [])]);
    for (const route of collect(routes)) {
      if (!route.componentLoader) continue;
      await expect(route.componentLoader()).resolves.toMatchObject({
        default: expect.any(Function),
      });
    }
  });

  it('pins the route names page grants are stored against', () => {
    // A route's `name` is the identifier a stored page grant records. Renaming one is a data change that has to
    // migrate the grants that name it, not a refactor — so changing this list deliberately is the point.
    const resolved = resolveAppClientContributions([
      {
        packageName: '@nocobase/app-template-examples',
        routes: applicationRoutes,
        source: 'application',
      },
    ]);

    expect(pageAuthorizations(resolved.routes)).toEqual([
      // The landing page opted out of page authorization, so it is reachable by every signed-in user.
      { name: 'home', authorizedAs: null },
      { name: 'notifications', authorizedAs: 'notifications' },
      { name: 'routeOverlays', authorizedAs: 'routeOverlays' },
      // Overlay children are nested under a page, so the parent's check is the only one.
      { name: 'routeDialogExample', authorizedAs: null },
      { name: 'routeDialogDrawerExample', authorizedAs: null },
      { name: 'routeDrawerExample', authorizedAs: null },
      { name: 'routeDrawerDialogExample', authorizedAs: null },
      { name: 'routeChildPages', authorizedAs: null },
      { name: 'routeChildPageQuotation', authorizedAs: null },
      { name: 'routeChildPageDialog', authorizedAs: null },
      { name: 'routeChildPageOnboarding', authorizedAs: null },
      { name: 'routeChildPageRenewal', authorizedAs: null },
      { name: 'articles', authorizedAs: null },
      { name: 'numeric-examples', authorizedAs: 'numeric-examples' },
      { name: 'external-crm', authorizedAs: 'external-crm' },
    ]);
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
                  : `${route.authz.resource.type}:${route.authz.resource.id}`,
          },
        ]
      : []),
    ...pageAuthorizations(route.children ?? []),
  ]);
}
