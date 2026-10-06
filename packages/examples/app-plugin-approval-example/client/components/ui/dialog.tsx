import type { ReactElement, ReactNode } from 'react';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { XIcon } from 'lucide-react';

import { cn } from '../../lib/utils.js';

/**
 * A modal over the page, scrolling on its own when its content is taller
 * than the window. `title` names it for assistive technology; pass
 * `hideTitle` when the content shows its own heading.
 */
export function Modal({
  open,
  onOpenChange,
  title,
  hideTitle = false,
  closeLabel,
  className,
  children,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: ReactNode;
  readonly hideTitle?: boolean;
  readonly closeLabel: string;
  readonly className?: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => onOpenChange(next)}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className='fixed inset-0 isolate z-50 bg-black/30 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0' />
        <DialogPrimitive.Popup
          className={cn(
            'fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl bg-background text-sm text-foreground shadow-xl ring-1 ring-foreground/10 duration-100 outline-none sm:max-w-3xl data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
            className,
          )}
        >
          <div
            className={cn(
              'flex shrink-0 items-center justify-between gap-2 border-b px-5 py-3',
              hideTitle && 'border-none pb-0',
            )}
          >
            <DialogPrimitive.Title
              className={cn('text-base font-semibold', hideTitle && 'sr-only')}
            >
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              aria-label={closeLabel}
              className='ml-auto inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground'
            >
              <XIcon className='size-4' />
            </DialogPrimitive.Close>
          </div>
          <div className='min-h-0 flex-1 overflow-y-auto px-5 pt-3 pb-5'>
            {children}
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
