import { ClientApplication, createAppClientConfig } from '@nocobase/app-client';
import {
  defineAppRuntime,
  resolveAppRuntime,
} from '@nocobase/app-client/runtime';
import { describe, expect, it } from 'vitest';

import serviceProviders from '../client/providers/index.js';

describe('@nocobase/app-plugin-hub Client ServiceProvider', () => {
  it('registers four translated navigation resources in display order', async () => {
    const runtime = await resolveAppRuntime(
      defineAppRuntime({
        packageName: '@example/hub-test-app',
        config: createAppClientConfig,
        serviceProviders,
        plugins: [],
      }),
    );
    const app = new ClientApplication({
      runtime,
      createRenderConfig: () => ({ routes: null }),
    });

    await app.start();

    expect(app.refineConfig.resources).toMatchObject([
      {
        name: 'hub.applications',
        list: '/apps',
        meta: {
          label: 'navigation.applications',
          i18nNs: '@nocobase/app-plugin-hub',
          priority: 10,
        },
      },
      {
        name: 'hub.deployments',
        list: '/deployments',
        meta: {
          label: 'navigation.deployments',
          i18nNs: '@nocobase/app-plugin-hub',
          priority: 20,
        },
      },
      {
        name: 'hub.audit',
        list: '/audit',
        meta: {
          label: 'navigation.audit',
          i18nNs: '@nocobase/app-plugin-hub',
          priority: 30,
        },
      },
      {
        name: 'hub.members',
        list: '/members',
        meta: {
          label: 'navigation.members',
          i18nNs: '@nocobase/app-plugin-hub',
          priority: 40,
        },
      },
    ]);

    await app.shutdown();
  });
});
