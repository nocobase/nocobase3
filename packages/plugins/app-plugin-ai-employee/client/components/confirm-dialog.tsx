import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { CircleAlert } from 'lucide-react';
import type { ReactElement } from 'react';

export interface ConfirmDialogProps {
  readonly cancelLabel: string;
  readonly confirmLabel: string;
  readonly description: string;
  readonly onConfirm: () => void;
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
  readonly title: string;
}

export function ConfirmDialog({
  cancelLabel,
  confirmLabel,
  description,
  onConfirm,
  onOpenChange,
  open,
  title,
}: ConfirmDialogProps): ReactElement {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className='fixed inset-0 z-50 bg-black/35 backdrop-blur-[2px]' />
        <DialogPrimitive.Popup className='fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border border-border/80 bg-background text-foreground shadow-2xl outline-none'>
          <div className='p-6'>
            <div className='flex gap-4'>
              <div className='flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-amber-700 ring-1 ring-amber-500/20 dark:text-amber-400'>
                <CircleAlert className='h-5 w-5' aria-hidden='true' />
              </div>
              <div className='min-w-0'>
                <DialogPrimitive.Title className='text-base font-semibold leading-6'>
                  {title}
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className='mt-2 text-sm leading-6 text-muted-foreground'>
                  {description}
                </DialogPrimitive.Description>
              </div>
            </div>
          </div>
          <div className='flex justify-end gap-2 border-t bg-muted/20 px-6 py-4'>
            <button
              type='button'
              className='inline-flex items-center justify-center rounded-md border border-border bg-background px-3.5 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
              onClick={onConfirm}
            >
              {confirmLabel}
            </button>
            <DialogPrimitive.Close
              render={
                <button
                  type='button'
                  className='inline-flex items-center justify-center rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
                />
              }
            >
              {cancelLabel}
            </DialogPrimitive.Close>
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
