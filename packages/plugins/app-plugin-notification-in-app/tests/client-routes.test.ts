import { describe, expect, it } from 'vitest';
import { Bell } from 'lucide-react';

import routes from '../client/routes.js';

describe('in-app notification Client routes', () => {
  it('declares a lazy inbox page under the development surface', async () => {
    const [route] = routes.routes;

    expect(routes.parent).toBe('dev');
    expect(route).toMatchObject({
      name: 'notification-in-app',
      path: '/notification-in-app',
      navigation: { title: 'nav.devInbox', icon: Bell },
      componentLoader: expect.any(Function),
    });
    await expect(route?.componentLoader()).resolves.toMatchObject({
      default: expect.any(Function),
    });
  });
});
