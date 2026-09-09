import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const notification = vi.hoisted(() => ({
  listLogs: vi.fn(),
  listTestTargets: vi.fn(),
  sendTest: vi.fn(),
}));

vi.mock('../client/runtime.js', () => ({
  getNotificationClient: () => notification,
}));

import NotificationLogsPage from '../client/pages/notification-logs-page.js';

describe('NotificationLogsPage', () => {
  beforeEach(() => {
    notification.listLogs.mockReset();
    notification.listTestTargets.mockReset();
    notification.listTestTargets.mockResolvedValue([]);
    notification.sendTest.mockReset();
  });

  it('shows the empty notification delivery state', async () => {
    notification.listLogs.mockResolvedValue([]);

    render(<NotificationLogsPage />);

    expect(await screen.findByText('No deliveries yet')).toBeInTheDocument();
    expect(screen.getByText('Notification logs')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Send test notification' }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Send test notification' }),
    );
    expect(
      await screen.findByText('No enabled Providers are configured.'),
    ).toBeInTheDocument();
  });

  it('keeps the send button visible when test targets cannot be loaded', async () => {
    notification.listLogs.mockResolvedValue([]);
    notification.listTestTargets.mockRejectedValue(
      new Error('Notification test send permission is required.'),
    );

    render(<NotificationLogsPage />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Send test notification' }),
    );

    expect(
      await screen.findByText('Notification test send permission is required.'),
    ).toBeInTheDocument();
  });

  it('presents a single Provider as a user-facing delivery method', async () => {
    notification.listLogs.mockResolvedValue([]);
    notification.listTestTargets.mockResolvedValue([
      {
        channel: { type: 'in-app', label: 'In-app' },
        provider: {
          name: 'primary',
          type: 'database',
          label: 'Built-in',
        },
        fields: [],
      },
    ]);

    render(<NotificationLogsPage />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Send test notification' }),
    );
    const methodSelect = await screen.findByRole('combobox', {
      name: 'Delivery method',
    });
    fireEvent.change(methodSelect, {
      target: { value: 'in-app:primary:database' },
    });

    expect(methodSelect).toHaveDisplayValue('In-app (Built-in)');
    expect(screen.queryByText(/primary/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Database/)).not.toBeInTheDocument();
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

  it('sends a test notification through a selected Provider and refreshes logs', async () => {
    notification.listLogs.mockResolvedValue([]);
    notification.listTestTargets.mockResolvedValue([
      {
        channel: { type: 'email', label: 'Email' },
        provider: { name: 'smtp', type: 'smtp', label: 'SMTP' },
        fields: [
          {
            name: 'recipient',
            label: 'Recipient',
            type: 'email',
            required: true,
          },
          {
            name: 'title',
            label: 'Title',
            type: 'text',
            required: true,
            defaultValue: 'NocoBase notification test',
          },
          {
            name: 'body',
            label: 'Message',
            type: 'textarea',
            required: true,
            defaultValue: 'This is a test notification from NocoBase.',
          },
        ],
      },
    ]);
    notification.sendTest.mockResolvedValue({
      notificationId: 'notification-test-1',
      status: 'pending',
      deliveries: [],
    });

    render(<NotificationLogsPage />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Send test notification' }),
    );
    const providerSelect = await screen.findByRole('combobox', {
      name: 'Delivery method',
    });
    expect(providerSelect).toHaveDisplayValue('Select a delivery method');
    expect(screen.getByRole('group', { name: 'Email' })).toBeInTheDocument();
    fireEvent.change(providerSelect, { target: { value: 'email:smtp:smtp' } });
    expect(
      providerSelect.compareDocumentPosition(screen.getByLabelText('Title')),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(providerSelect).toHaveDisplayValue('Email (SMTP)');
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox', { name: 'Recipient' }), {
      target: { value: 'recipient@example.com' },
    });
    expect(notification.sendTest).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Send' }));

    expect(notification.sendTest).toHaveBeenCalledWith({
      channel: 'email',
      provider: { name: 'smtp', type: 'smtp' },
      values: {
        recipient: 'recipient@example.com',
        title: 'NocoBase notification test',
        body: 'This is a test notification from NocoBase.',
      },
    });
    expect(
      await screen.findByText(
        'Test notification notification-test-1 accepted.',
      ),
    ).toBeInTheDocument();
    await waitFor(() => expect(notification.listLogs).toHaveBeenCalledTimes(2));
  });
});
