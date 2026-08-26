import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NotificationLogsPage } from '../../registry/nocobase-notification/logs/page.js';

afterEach(() => vi.unstubAllGlobals());

describe('notification logs', () => {
  it('renders delivery attempts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        json({
          data: [
            {
              log: {
                id: 'notification-1',
                sourceType: 'workflow',
                status: 'partial',
                createdAt: '2026-08-25T00:00:00.000Z',
                updatedAt: '2026-08-25T00:00:01.000Z',
              },
              deliveries: [
                {
                  delivery: {
                    id: 'delivery-1',
                    channel: 'email',
                    providerName: 'primary',
                    providerType: 'fake',
                    attemptCount: 1,
                    status: 'failed',
                    createdAt: '2026-08-25T00:00:00.000Z',
                    updatedAt: '2026-08-25T00:00:01.000Z',
                  },
                  attempts: [
                    {
                      id: 'attempt-1',
                      sequence: 1,
                      providerName: 'primary',
                      providerType: 'smtp',
                      status: 'failed',
                      startedAt: '2026-08-25T00:00:00.000Z',
                      error: { message: 'SMTP unavailable' },
                    },
                  ],
                },
              ],
            },
          ],
        }),
      ),
    );

    render(<NotificationLogsPage />);
    fireEvent.click(await screen.findByText('workflow'));

    expect(screen.getByText('primary')).toBeInTheDocument();
    expect(screen.getByText('SMTP unavailable')).toBeInTheDocument();
  });
});

function json(value: object): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
