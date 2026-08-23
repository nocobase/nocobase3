import { Button } from '@nocobase/app-client/ui';
import { useNotification } from '@refinedev/core';
import { useState, type ReactElement } from 'react';

export default function NotificationDemoPage(): ReactElement {
  const { open } = useNotification();
  const [undoStatus, setUndoStatus] = useState('No undo requested.');

  return (
    <main className='mx-auto flex min-h-svh w-full max-w-3xl flex-col px-6 py-10'>
      <header className='space-y-2 border-b pb-6'>
        <p className='text-sm text-muted-foreground'>Client route example</p>
        <h1 className='text-2xl font-semibold'>Notification provider</h1>
        <p className='text-sm text-muted-foreground'>
          These actions use Refine&apos;s notification API and the enabled
          Sonner-backed notification provider plugin.
        </p>
      </header>

      <section className='flex flex-1 flex-col justify-center gap-6 py-10'>
        <div className='flex flex-wrap gap-3'>
          <Button
            onClick={() =>
              open?.({
                description: 'The operation completed successfully.',
                message: 'Success notification',
                type: 'success',
              })
            }
          >
            Show success
          </Button>
          <Button
            onClick={() =>
              open?.({
                description: 'The operation could not be completed.',
                message: 'Error notification',
                type: 'error',
              })
            }
            variant='outline'
          >
            Show error
          </Button>
          <Button
            onClick={() => {
              setUndoStatus('Waiting for an undo request.');
              open?.({
                cancelMutation: () => setUndoStatus('Undo requested.'),
                description: 'Use Undo before the notification closes.',
                message: 'Undoable notification',
                type: 'progress',
                undoableTimeout: 8,
              });
            }}
            variant='outline'
          >
            Show undoable
          </Button>
        </div>

        <div className='rounded-xl border p-5'>
          <p className='text-sm text-muted-foreground'>Undo callback status</p>
          <p className='mt-1 font-medium' role='status'>
            {undoStatus}
          </p>
        </div>
      </section>
    </main>
  );
}
