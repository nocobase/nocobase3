import { describe, expect, it, vi } from 'vitest';

import { createNotificationRoutes } from '../../server/routes/api/notifications.js';

describe('notification routes', () => {
  it('lists redacted notification details through the application API', async () => {
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
    const routes = createNotificationRoutes({
      notification: createNotificationService({ listDetails }),
    });

    const response = await routes.request('/logs');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: await listDetails() });
  });

  it('normalizes and sends a test email', async () => {
    const send = vi.fn(async () => ({
      notificationId: 'notification-1',
      status: 'pending' as const,
      deliveries: [],
    }));
    const routes = createNotificationRoutes({
      notification: createNotificationService({ send }),
    });

    const response = await routes.request('/test/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        addresses: [' alice@example.com ', 'alice@example.com'],
        subject: 'Test',
        text: 'Hello',
      }),
    });

    expect(response.status).toBe(202);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        source: { type: 'notification-test' },
        recipients: [
          {
            channels: [
              {
                channel: 'email',
                recipient: { address: 'alice@example.com' },
              },
            ],
          },
        ],
      }),
    );
  });

  it('rejects invalid test sends and disabled notifications', async () => {
    const routes = createNotificationRoutes({});
    expect((await routes.request('/logs')).status).toBe(503);

    const configured = createNotificationRoutes({
      notification: createNotificationService(),
    });
    expect(
      (
        await configured.request('/test/in-app', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ userIds: [], body: '' }),
        })
      ).status,
    ).toBe(400);
  });
});

function createNotificationService(
  overrides: {
    readonly send?: ReturnType<typeof vi.fn>;
    readonly listDetails?: ReturnType<typeof vi.fn>;
  } = {},
) {
  return {
    logs: {
      listDetails: overrides.listDetails ?? vi.fn(async () => []),
      get: vi.fn(async () => undefined),
    },
    send:
      overrides.send ??
      vi.fn(async () => ({
        notificationId: 'notification-1',
        status: 'pending' as const,
        deliveries: [],
      })),
  };
}
