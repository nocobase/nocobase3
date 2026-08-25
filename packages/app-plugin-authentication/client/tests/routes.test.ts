import { describe, expect, it } from 'vitest';

import routes from '../routes.js';

describe('authentication client routes', () => {
  it('contributes the complete password authentication flow as guest routes', async () => {
    expect(routes).toMatchObject([
      { auth: 'guest', name: 'login', path: '/login' },
      { auth: 'guest', name: 'register', path: '/register' },
      {
        auth: 'guest',
        name: 'forgot-password',
        path: '/forgot-password',
      },
      {
        auth: 'guest',
        name: 'reset-password',
        path: '/reset-password',
      },
    ]);
    expect(Object.isFrozen(routes)).toBe(true);

    for (const route of routes) {
      await expect(route.componentLoader()).resolves.toMatchObject({
        default: expect.any(Function),
      });
    }
  });
});
