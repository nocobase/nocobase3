import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import {
  apiRoutes,
  registerSkillsExampleRoutes,
} from '../server/routes/index.js';

describe('@nocobase/app-plugin-skills-example routes', () => {
  it('returns the default notice for an authenticated request', async () => {
    const router = new Hono();
    registerSkillsExampleRoutes(
      router,
      { required: () => async (_context, next) => next() },
      {
        getDefaultNotice: () => ({
          title: 'Hello',
          description: 'World',
          tone: 'info',
        }),
      },
    );

    const response = await router.request('/skills-example/notice');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      title: 'Hello',
      description: 'World',
      tone: 'info',
    });
  });

  it('rejects anonymous requests before reading the notice service', async () => {
    const router = new Hono();
    registerSkillsExampleRoutes(
      router,
      {
        required: () => (context) =>
          context.json({ code: 'UNAUTHORIZED' }, 401),
      },
      {
        getDefaultNotice: () => {
          throw new Error('Anonymous requests must not read the service.');
        },
      },
    );

    const response = await router.request('/skills-example/notice');

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ code: 'UNAUTHORIZED' });
  });

  it('declares one API Route contribution', () => {
    expect(apiRoutes).toMatchObject({ scope: 'api' });
  });
});
