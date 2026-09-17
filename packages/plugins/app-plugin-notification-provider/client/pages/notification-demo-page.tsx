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
          {translateDemo('Client route example', {
            defaultValue: 'Client route example',
          })}
        </p>
        <h1 className='text-2xl font-semibold'>
          {translateDemo('Notification provider', {
            defaultValue: 'Notification provider',
          })}
        </h1>
        <p className='text-sm text-muted-foreground'>
          {translateDemo(
            "These actions use Refine's notification API and the enabled Sonner-backed notification provider plugin.",
            {
              defaultValue:
                "These actions use Refine's notification API and the enabled Sonner-backed notification provider plugin.",
            },
          )}
        </p>
      </header>

      <section className='flex flex-1 flex-col justify-center gap-6 py-10'>
        <div className='flex flex-wrap gap-3'>
          <Button
            onClick={() =>
              open?.({
                description: translateDemo(
                  'The operation completed successfully.',
                  { defaultValue: 'The operation completed successfully.' },
                ),
                message: translateDemo('Success notification', {
                  defaultValue: 'Success notification',
                }),
                type: 'success',
              })
            }
          >
            {translateDemo('Show success', { defaultValue: 'Show success' })}
          </Button>
          <Button
            onClick={() =>
              open?.({
                description: translateDemo(
                  'The operation could not be completed.',
                  { defaultValue: 'The operation could not be completed.' },
                ),
                message: translateDemo('Error notification', {
                  defaultValue: 'Error notification',
                }),
                type: 'error',
              })
            }
            variant='outline'
          >
            {translateDemo('Show error', { defaultValue: 'Show error' })}
          </Button>
          <Button
            onClick={() => {
              setUndoStatus('Waiting for an undo request.');
              open?.({
                cancelMutation: () => setUndoStatus('Undo requested.'),
                description: translateDemo(
                  'Use Undo before the notification closes.',
                  { defaultValue: 'Use Undo before the notification closes.' },
                ),
                message: translateDemo('Undoable notification', {
                  defaultValue: 'Undoable notification',
                }),
                type: 'progress',
                undoableTimeout: 8,
              });
            }}
            variant='outline'
          >
            {translateDemo('Show undoable', { defaultValue: 'Show undoable' })}
          </Button>
        </div>

        <div className='rounded-xl border p-5'>
          <p className='text-sm text-muted-foreground'>
            {translateDemo('Undo callback status', {
              defaultValue: 'Undo callback status',
            })}
          </p>
          <p className='mt-1 font-medium' role='status'>
            {translateDemo(undoStatus, { defaultValue: undoStatus })}
          </p>
        </div>
      </section>
    </section>
  );
}
