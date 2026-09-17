import { messageKey } from '../lib/message-key.js';
import { useTranslation as useDemoTranslation } from '@nocobase/i18n/client';
import { useNotification } from '@refinedev/core';
import { useState, type ReactElement } from 'react';

import { Button } from '../components/ui/button.js';

export default function NotificationDemoPage(): ReactElement {
  const { t: translateDemo } = useDemoTranslation(
    '@nocobase/app-plugin-notification-provider',
  );

  const { open } = useNotification();
  const [undoStatus, setUndoStatus] = useState('No undo requested.');

  return (
    <section className='mx-auto flex w-full max-w-3xl flex-col px-6 py-10'>
      <header className='space-y-2 border-b pb-6'>
        <p className='text-sm text-muted-foreground'>
          {translateDemo('clientRouteExample', {
            defaultValue: 'Client route example',
          })}
        </p>
        <h1 className='text-2xl font-semibold'>
          {translateDemo('notificationProvider', {
            defaultValue: 'Notification provider',
          })}
        </h1>
        <p className='text-sm text-muted-foreground'>
          {translateDemo('description', {
            defaultValue:
              "These actions use Refine's notification API and the enabled Sonner-backed notification provider plugin.",
          })}
        </p>
      </header>

      <section className='flex flex-1 flex-col justify-center gap-6 py-10'>
        <div className='flex flex-wrap gap-3'>
          <Button
            onClick={() =>
              open?.({
                description: translateDemo('successDescription', {
                  defaultValue: 'The operation completed successfully.',
                }),
                message: translateDemo('successNotification', {
                  defaultValue: 'Success notification',
                }),
                type: 'success',
              })
            }
          >
            {translateDemo('showSuccess', { defaultValue: 'Show success' })}
          </Button>
          <Button
            onClick={() =>
              open?.({
                description: translateDemo('errorDescription', {
                  defaultValue: 'The operation could not be completed.',
                }),
                message: translateDemo('errorNotification', {
                  defaultValue: 'Error notification',
                }),
                type: 'error',
              })
            }
            variant='outline'
          >
            {translateDemo('showError', { defaultValue: 'Show error' })}
          </Button>
          <Button
            onClick={() => {
              setUndoStatus('Waiting for an undo request.');
              open?.({
                cancelMutation: () => setUndoStatus('Undo requested.'),
                description: translateDemo('undoHint', {
                  defaultValue: 'Use Undo before the notification closes.',
                }),
                message: translateDemo('undoableNotification', {
                  defaultValue: 'Undoable notification',
                }),
                type: 'progress',
                undoableTimeout: 8,
              });
            }}
            variant='outline'
          >
            {translateDemo('showUndoable', { defaultValue: 'Show undoable' })}
          </Button>
        </div>

        <div className='rounded-xl border p-5'>
          <p className='text-sm text-muted-foreground'>
            {translateDemo('undoCallbackStatus', {
              defaultValue: 'Undo callback status',
            })}
          </p>
          <p className='mt-1 font-medium' role='status'>
            {translateDemo(messageKey(undoStatus), {
              defaultValue: undoStatus,
            })}
          </p>
        </div>
      </section>
    </section>
  );
}
