import { Toast as ToastPrimitive } from '@base-ui/react/toast';
import type { ReactElement } from 'react';

import { toast } from '../toast-manager.js';
import { Button } from './ui/button.js';

export type ToasterProps = ToastPrimitive.Provider.Props;

function ToastList(): ReactElement {
  const { toasts } = ToastPrimitive.useToastManager();

  return (
    <>
      {toasts.map((toastItem) => (
        <ToastPrimitive.Root
          key={toastItem.id}
          className='pointer-events-auto relative flex w-full items-start gap-3 rounded-lg border border-border border-l-4 bg-card p-4 text-card-foreground shadow-lg outline-none transition data-[type=success]:border-l-primary data-[type=error]:border-l-destructive data-limited:hidden data-starting-style:translate-x-2 data-starting-style:opacity-0 data-ending-style:translate-x-2 data-ending-style:opacity-0'
          data-slot='toast'
          toast={toastItem}
        >
          <ToastPrimitive.Content
            className='flex min-w-0 flex-1 items-start gap-3'
            data-slot='toast-content'
          >
            <div className='min-w-0 flex-1 space-y-1'>
              <ToastPrimitive.Title
                className='text-sm font-medium'
                data-slot='toast-title'
              />
              <ToastPrimitive.Description
                className='text-sm text-muted-foreground'
                data-slot='toast-description'
              />
            </div>
            <ToastPrimitive.Action
              className='shrink-0'
              data-slot='toast-action'
              render={<Button size='sm' variant='outline' />}
            />
            <ToastPrimitive.Close
              aria-label='Dismiss notification'
              className='shrink-0'
              data-slot='toast-close'
              render={
                <Button size='icon-xs' variant='ghost'>
                  <span aria-hidden='true'>×</span>
                </Button>
              }
            />
          </ToastPrimitive.Content>
        </ToastPrimitive.Root>
      ))}
    </>
  );
}

export function Toaster({
  children,
  toastManager = toast,
  ...props
}: ToasterProps = {}): ReactElement {
  return (
    <ToastPrimitive.Provider toastManager={toastManager} {...props}>
      {children}
      <ToastPrimitive.Portal>
        <ToastPrimitive.Viewport
          className='pointer-events-none fixed top-4 right-4 z-[1000] flex max-h-[calc(100vh-2rem)] w-[min(24rem,calc(100vw-2rem))] flex-col gap-2 outline-none sm:top-6 sm:right-6'
          data-slot='toast-viewport'
        >
          <ToastList />
        </ToastPrimitive.Viewport>
      </ToastPrimitive.Portal>
    </ToastPrimitive.Provider>
  );
}
