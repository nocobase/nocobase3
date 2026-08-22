import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import registerRoutes from '../server/routes/index.js';

describe('example plugin routes', () => {
  it('registers the install route with app dependencies and services', async () => {
    const app = new Hono();
    const info = vi.fn();
    const all = vi.fn().mockResolvedValue([
      {
        key: 'locale',
        value: 'en-US',
      },
    ]);

    registerRoutes({
      app,
      deps: {
        logging: {
          getLogger: () => ({ info }),
        },
      },
      services: {
        appSettingsStore: { all },
      },
    });

    const response = await app.request('/install');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      installed: false,
      settings: [
        {
          key: 'locale',
          value: 'en-US',
        },
      ],
    });
    expect(all).toHaveBeenCalledOnce();
    expect(info).toHaveBeenCalledWith(
      { route: '/install' },
      'Install page requested',
    );
  });
});
