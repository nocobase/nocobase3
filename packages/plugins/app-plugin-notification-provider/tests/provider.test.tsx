import { beforeEach, describe, expect, it, vi } from 'vitest';

const { add, close } = vi.hoisted(() => ({
  add: vi.fn(() => 'generated-toast-id'),
  close: vi.fn(),
}));

vi.mock('../client/toast-manager.js', () => ({ toast: { add, close } }));

import { createNotificationProvider } from '../client/notification-provider.js';
import { toast } from '../client/toast-manager.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('notification provider', () => {
  it('maps Refine success and error notifications to Base UI toasts', () => {
    const provider = createNotificationProvider();

    provider.open({
      description: 'Created',
      key: 'success-key',
      message: 'Saved',
      type: 'success',
    });
    provider.open({
      description: 'Try again',
      key: 'error-key',
      message: 'Failed',
      type: 'error',
    });

    expect(toast.add).toHaveBeenNthCalledWith(1, {
      description: 'Created',
      id: 'success-key',
      title: 'Saved',
      type: 'success',
    });
    expect(toast.add).toHaveBeenNthCalledWith(2, {
      description: 'Try again',
      id: 'error-key',
      priority: 'high',
      title: 'Failed',
      type: 'error',
    });
  });

  it('adds progress notifications with an undo action and timeout', () => {
    const cancelMutation = vi.fn();
    const provider = createNotificationProvider({ undoLabel: '撤销' });

    provider.open({
      cancelMutation,
      description: 'Will be committed shortly',
      key: 'progress-key',
      message: 'Saving',
      type: 'progress',
      undoableTimeout: 8,
    });

    expect(toast.add).toHaveBeenCalledWith({
      actionProps: expect.objectContaining({ children: '撤销' }),
      description: 'Will be committed shortly',
      id: 'progress-key',
      timeout: 8000,
      title: 'Saving',
      type: 'progress',
    });

    const options = vi.mocked(toast.add).mock.calls[0][0];
    options.actionProps?.onClick?.({} as never);

    expect(cancelMutation).toHaveBeenCalledOnce();
    expect(toast.close).toHaveBeenCalledWith('generated-toast-id');
  });

  it('closes notifications by key', () => {
    const provider = createNotificationProvider();

    provider.close('notification-key');

    expect(toast.close).toHaveBeenCalledWith('notification-key');
  });
});
