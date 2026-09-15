import type { AppClientRouteDefinition } from '@nocobase/app-client/plugins';
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
});
