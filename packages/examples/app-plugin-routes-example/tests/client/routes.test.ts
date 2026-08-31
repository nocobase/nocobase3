import { describe, expect, it } from 'vitest';

import routes from '../../client/routes.js';

describe('client routes', () => {
  it('defines App and Settings Routes through one Client entry', async () => {
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
});
