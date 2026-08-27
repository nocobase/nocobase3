import type { DatabaseManager } from '@nocobase/app-database';
import type { NotificationService } from '@nocobase/app-plugin-notification';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import bootstrapInAppNotificationPlugin from '../server/bootstrap.js';
import registerInAppNotificationRoutes from '../server/routes/index.js';

describe('@nocobase/app-plugin-notification-in-app routes', () => {
  it('authenticates through the router user resolver', async () => {
    const notification = {
      registry: {
        registerChannel() {
          return this;
        },
        registerProvider() {
          return this;
        },
      },
    } as unknown as NotificationService;
    bootstrapInAppNotificationPlugin({
      config: undefined,
      deps: { database: {} as DatabaseManager },
      services: { notification },
      lifecycle: { registerDisposer() {} },
    });
    const app = new Hono();
    const getSession = vi.fn(async () => null);

    registerInAppNotificationRoutes({
      app,
      config: undefined,
      deps: { auth: { getSession } },
      services: { notification },
      paths: {} as never,
    });

    const response = await app.request('/api/notifications/in-app');
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: 'Authentication required.',
    });
    expect(getSession).toHaveBeenCalledOnce();
  });
});
