import { describe, expect, it, vi } from 'vitest';

import { createEmailTestRouter } from '../server/email/test-router.js';

describe('email notification test router', () => {
  it('normalizes addresses and sends a test email', async () => {
    const send = vi.fn(async () => ({
      notificationId: 'notification-1',
      status: 'pending' as const,
      deliveries: [],
    }));
    const router = createEmailTestRouter({ send });

    const response = await router.request('/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        addresses: [' alice@example.com ', 'alice@example.com'],
        subject: 'Test',
        text: 'Hello',
      }),
    });

    expect(response.status).toBe(202);
    expect(send).toHaveBeenCalledWith({
      source: { type: 'notification-test' },
      to: [{ type: 'email', address: 'alice@example.com' }],
      channels: ['email'],
      content: { title: 'Test', body: 'Hello' },
    });
  });

  it('rejects invalid test email input', async () => {
    const send = vi.fn();
    const router = createEmailTestRouter({ send });

    const response = await router.request('/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ addresses: [], subject: '', text: '' }),
    });

    expect(response.status).toBe(400);
    expect(send).not.toHaveBeenCalled();
  });
});
