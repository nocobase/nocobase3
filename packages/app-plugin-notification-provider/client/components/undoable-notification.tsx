import type { ReactElement } from 'react';

import { Button } from './ui/button.js';

export interface UndoableNotificationProps {
  readonly cancelMutation?: () => void;
  readonly description?: string;
  readonly message: string;
  readonly onClose?: () => void;
  readonly toastId: number | string;
  readonly undoLabel: string;
}

export function UndoableNotification({
  cancelMutation,
  description,
  message,
  onClose,
  toastId,
  undoLabel,
}: UndoableNotificationProps): ReactElement {
  return (
    <div
      className='min-w-[320px] max-w-md rounded-lg border border-border bg-card p-4 text-card-foreground shadow-xl'
      data-toast-id={toastId}
    >
      <div className='flex items-center justify-between'>
        <div className='mr-4 flex-1'>
          <div className='text-sm font-medium text-foreground'>{message}</div>
          {description ? (
            <div className='mt-1 text-sm text-muted-foreground'>
              {description}
            </div>
          ) : null}
        </div>
        <Button
          className='px-4 py-2'
          onClick={() => {
            cancelMutation?.();
            onClose?.();
          }}
          size='sm'
          variant='outline'
        >
          {undoLabel}
        </Button>
      </div>
    </div>
  );
}
