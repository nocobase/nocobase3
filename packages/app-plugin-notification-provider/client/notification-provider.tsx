import type {
  NotificationProvider,
  OpenNotificationParams,
} from '@refinedev/core';
import { toast } from 'sonner';

import { UndoableNotification } from './components/undoable-notification.js';

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
          toast.success(params.message, {
            id: params.key,
            description: params.description,
            richColors: true,
          });
          return;
        case 'error':
          toast.error(params.message, {
            id: params.key,
            description: params.description,
            richColors: true,
          });
          return;
        case 'progress':
          toast.custom(
            (toastId) => (
              <UndoableNotification
                cancelMutation={params.cancelMutation}
                description={params.description}
                message={params.message}
                onClose={() => toast.dismiss(toastId)}
                toastId={toastId}
                undoLabel={undoLabel}
              />
            ),
            {
              duration: (params.undoableTimeout ?? 5) * 1000,
              id: params.key,
              unstyled: true,
            },
          );
          return;
        default:
          return;
      }
    },
    close(key: string): void {
      toast.dismiss(key);
    },
  };
}
