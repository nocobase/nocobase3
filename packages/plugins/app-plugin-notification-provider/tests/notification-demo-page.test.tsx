import { Refine, type NotificationProvider } from '@refinedev/core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import NotificationDemoPage from '../client/pages/notification-demo-page.js';

describe('notification demo page', () => {
  it('opens success, error, and undoable notifications through Refine', () => {
    const notificationProvider: NotificationProvider = {
      close: vi.fn(),
      open: vi.fn(),
    };

    render(
      <Refine notificationProvider={notificationProvider}>
        <NotificationDemoPage />
      </Refine>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Show success' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show error' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show undoable' }));

    expect(notificationProvider.open).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        message: 'Success notification',
        type: 'success',
      }),
    );
    expect(notificationProvider.open).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        message: 'Error notification',
        type: 'error',
      }),
    );
    expect(notificationProvider.open).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        cancelMutation: expect.any(Function),
        message: 'Undoable notification',
        type: 'progress',
        undoableTimeout: 8,
      }),
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'Waiting for an undo request.',
    );

    const progressNotification = vi.mocked(notificationProvider.open).mock
      .calls[2][0];
    act(() => progressNotification.cancelMutation?.());

    expect(screen.getByRole('status')).toHaveTextContent('Undo requested.');
  });
});
