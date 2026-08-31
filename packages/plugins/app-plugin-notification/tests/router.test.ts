import { describe, expect, it, vi } from 'vitest';

import { createNotificationRouter } from '../server/router.js';

describe('notification router', () => {
  it('lists redacted notification details', async () => {
    const listDetails = vi.fn(async () => [
      {
        log: {
          id: 'notification-1',
          sourceType: 'test',
          status: 'completed' as const,
          createdAt: '2026-08-25T00:00:00.000Z',
          updatedAt: '2026-08-25T00:00:01.000Z',
        },
        deliveries: [],
      },
    ]);
    const router = createNotificationRouter({
      logs: { listDetails, get: vi.fn(async () => undefined) },
    });

    const response = await router.request('/logs');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: await listDetails() });
  });

  it('returns one log or a not-found response', async () => {
    const details = {
      log: {
        id: 'notification-1',
        sourceType: 'test',
        status: 'completed' as const,
        createdAt: '2026-08-25T00:00:00.000Z',
        updatedAt: '2026-08-25T00:00:01.000Z',
      },
      deliveries: [],
    };
    const get = vi.fn(async (id: string) =>
      id === details.log.id ? details : undefined,
    );
    const router = createNotificationRouter({
      logs: { listDetails: vi.fn(async () => []), get },
    });

    const found = await router.request('/logs/notification-1');
    const missing = await router.request('/logs/missing');

    expect(found.status).toBe(200);
    expect(await found.json()).toEqual({ data: details });
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({
      error: 'Notification log not found.',
    });
  });
});
