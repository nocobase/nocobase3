import { describe, expect, it } from 'vitest';

import routes from '../../client/routes.js';

describe('client routes', () => {
  it('defines App, Settings, and Dev Routes through one Client entry', async () => {
    const [appContribution, settingsContribution] = routes;
    if (
      appContribution?.parent !== 'app' ||
      settingsContribution?.parent !== 'settings'
    ) {
      throw new Error('Missing Routes example Client contributions.');
    }

    const [appRoute] = appContribution.routes;
    const [settingsRoute] = settingsContribution.routes;

    expect(appRoute).toMatchObject({
      name: 'index',
      path: '/routes-example',
      auth: 'required',
      componentLoader: expect.any(Function),
    });
    expect(settingsRoute).toMatchObject({
      name: 'routes-example',
      path: '/routes-example',
      navigation: { title: 'Routes example' },
      access: { resource: 'routes-example.settings', action: 'read' },
      componentLoader: expect.any(Function),
    });
    await expect(appRoute?.componentLoader()).resolves.toHaveProperty(
      'default',
    );
    await expect(settingsRoute?.componentLoader()).resolves.toHaveProperty(
      'default',
    );
  });

  it('declares a dev page that a production build would drop', async () => {
    // Tests run under Node, where `import.meta.env` is undefined. That is a development context, so the routes are
    // present here; the production behaviour is covered by the template build test.
    const devContribution = routes.find(
      (contribution) => contribution.parent === 'dev',
    );
    if (devContribution?.parent !== 'dev') {
      throw new Error('Missing Routes example Dev Route contribution.');
    }

    const [devRoute] = devContribution.routes;

    expect(devRoute).toMatchObject({
      name: 'routes-example',
      path: '/routes-example',
      navigation: { title: 'Routes example' },
      componentLoader: expect.any(Function),
    });
    await expect(devRoute?.componentLoader()).resolves.toHaveProperty(
      'default',
    );
  });
});
