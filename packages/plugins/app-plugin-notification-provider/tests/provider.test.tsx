import { fireEvent, render, screen } from '@testing-library/react';
import { toast } from 'sonner';
import { describe, expect, it, vi } from 'vitest';

import { createNotificationProvider } from '../client/notification-provider.js';

vi.mock('sonner', () => ({
  toast: {
    custom: vi.fn(() => 'toast-id'),
    dismiss: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  },
}));

describe('notification provider', () => {
  it('maps Refine success and error notifications to Sonner', () => {
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

    expect(toast.success).toHaveBeenCalledWith('Saved', {
      description: 'Created',
      id: 'success-key',
      richColors: true,
    });
    expect(toast.error).toHaveBeenCalledWith('Failed', {
      description: 'Try again',
      id: 'error-key',
      richColors: true,
    });
  });

  it('renders progress notifications with an undo action', () => {
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

    expect(toast.custom).toHaveBeenCalledWith(expect.any(Function), {
      duration: 8000,
      id: 'progress-key',
      unstyled: true,
    });

    const renderer = vi.mocked(toast.custom).mock.calls[0][0];
    render(renderer('generated-toast-id'));
    fireEvent.click(screen.getByRole('button', { name: '撤销' }));

    expect(cancelMutation).toHaveBeenCalledOnce();
    expect(toast.dismiss).toHaveBeenCalledWith('generated-toast-id');
  });

  it('closes notifications by key', () => {
    const provider = createNotificationProvider();

    provider.close('notification-key');

    expect(toast.dismiss).toHaveBeenCalledWith('notification-key');
  });
});
