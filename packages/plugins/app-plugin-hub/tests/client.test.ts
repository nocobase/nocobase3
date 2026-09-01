import { describe, expect, it } from 'vitest';

import hubPlugin from '../client/plugin.js';
import reactProviders from '../client/react-providers.js';
import routes from '../client/routes.js';

describe('@nocobase/app-plugin-hub client', () => {
  it('declares the six approved authenticated Hub routes', () => {
    expect(routes).toMatchObject({
      parent: 'app',
      routes: [
        { name: 'hub.applications', path: '/apps', auth: 'required' },
        {
          name: 'hub.application-detail',
          path: '/apps/:appId',
          auth: 'required',
        },
        { name: 'hub.deployments', path: '/deployments', auth: 'required' },
        {
          name: 'hub.deployment-detail',
          path: '/deployments/:deploymentId',
          auth: 'required',
        },
        { name: 'hub.audit', path: '/audit', auth: 'required' },
        { name: 'hub.members', path: '/members', auth: 'required' },
      ],
    });
  });

  it('contributes only Client routes, resources, and locale loaders', () => {
    const registration = hubPlugin();

    expect(registration.packageName).toBe('@nocobase/app-plugin-hub');
    expect(registration.routes).toEqual([routes]);
    expect(registration.serviceProviders).toHaveLength(1);
    expect(registration.reactProviders).toEqual(reactProviders);
    expect(reactProviders).toMatchObject([
      { name: 'hub-applications', component: expect.any(Function) },
    ]);
    expect(registration.locales).toMatchObject({
      'en-US': expect.any(Function),
      'zh-CN': expect.any(Function),
    });
  });
});
