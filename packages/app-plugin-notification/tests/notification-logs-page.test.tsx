import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const notification = vi.hoisted(() => ({
  listLogs: vi.fn(),
}));

vi.mock('../client/runtime.js', () => ({
  getNotificationClient: () => notification,
}));

import NotificationLogsPage from '../client/pages/notification-logs-page.js';

describe('NotificationLogsPage', () => {
  beforeEach(() => {
    notification.listLogs.mockReset();
  });

  it('shows the empty notification delivery state', async () => {
    notification.listLogs.mockResolvedValue([]);

    render(<NotificationLogsPage />);

    expect(await screen.findByText('No deliveries yet')).toBeInTheDocument();
    expect(screen.getByText('Notification logs')).toBeInTheDocument();
  });

  it('expands provider attempts for a delivery', async () => {
    notification.listLogs.mockResolvedValue([
      {
        log: {
          id: 'notification-1',
          sourceType: 'workflow',
          status: 'failed',
          createdAt: '2026-08-28T07:00:00.000Z',
          updatedAt: '2026-08-28T07:00:01.000Z',
        },
        deliveries: [
          {
            delivery: {
              id: 'delivery-1',
              channel: 'email',
              providerName: 'primary-smtp',
              providerType: 'smtp',
              attemptCount: 1,
              status: 'failed',
              createdAt: '2026-08-28T07:00:00.000Z',
              updatedAt: '2026-08-28T07:00:01.000Z',
            },
            attempts: [
              {
                id: 'attempt-1',
                sequence: 1,
                providerName: 'primary-smtp',
                providerType: 'smtp',
                status: 'failed',
                startedAt: '2026-08-28T07:00:00.000Z',
                error: { message: 'Connection refused' },
              },
            ],
          },
        ],
      },
    ]);

    render(<NotificationLogsPage />);

    const expand = await screen.findByRole('button', {
      name: 'Expand notification',
    });
    fireEvent.click(expand);

    expect(screen.getAllByText('primary-smtp')).toHaveLength(2);
    expect(screen.getByText('Connection refused')).toBeInTheDocument();
    expect(
      screen.getByText('Need attention').previousSibling,
    ).toHaveTextContent('1');
  });
});
