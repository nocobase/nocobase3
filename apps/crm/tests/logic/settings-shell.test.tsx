import { describe, expect, it } from 'vitest';

import { appRoutes, standaloneAppRoutes } from '../../client/routes';

describe('App settings shell', () => {
  it('keeps settings routes out of the business resource navigation', () => {
    const settingsRoute = standaloneAppRoutes.find(
      (route) => route.name === 'app-settings',
    );
    const settingsModuleRoute = standaloneAppRoutes.find(
      (route) => route.name === 'app-settings.module',
    );

    expect(settingsRoute).toMatchObject({
      path: '/settings',
      access: { roles: { anyOf: ['crm-admin'] } },
    });
    expect(settingsRoute).not.toHaveProperty('resource');
    expect(settingsModuleRoute).toMatchObject({
      path: '/settings/:moduleId',
      access: { roles: { anyOf: ['crm-admin'] } },
    });
    expect(settingsModuleRoute).not.toHaveProperty('resource');
  });

  it('keeps the shared settings workspace outside the business shell', () => {
    expect(
      appRoutes.some((route) => route.name.startsWith('app-settings')),
    ).toBe(false);
    expect(standaloneAppRoutes.map((route) => route.path)).toEqual([
      '/settings',
      '/settings/:moduleId',
    ]);
    expect(standaloneAppRoutes.every((route) => route.lazy)).toBe(true);
  });
});
