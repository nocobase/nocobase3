import type {
  NotificationProvider,
  OpenNotificationParams,
} from '@refinedev/core';

import { toast } from './toast-manager.js';

export interface NotificationProviderOptions {
  readonly undoLabel?: string;
}

export function createNotificationProvider(
  options: NotificationProviderOptions = {},
): NotificationProvider {
  const undoLabel = options.undoLabel ?? 'Undo';

  return {
    open(params: OpenNotificationParams): void {
      switch (params.type) {
        case 'success':
          toast.add({
            id: params.key,
            type: 'success',
            title: params.message,
            description: params.description,
          });
          return;
        case 'error':
          toast.add({
            id: params.key,
            type: 'error',
            priority: 'high',
            title: params.message,
            description: params.description,
          });
          return;
        case 'progress':
          {
            let toastId = '';
            toastId = toast.add({
              id: params.key,
              type: 'progress',
              title: params.message,
              description: params.description,
              timeout: (params.undoableTimeout ?? 5) * 1000,
              actionProps: {
                children: undoLabel,
                onClick: () => {
                  params.cancelMutation?.();
                  toast.close(toastId);
                },
              },
            });
          }
          return;
        default:
          return;
      }
    },
    close(key: string): void {
      toast.close(key);
    },
  };
}
