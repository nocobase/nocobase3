import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { X } from 'lucide-react';
import type { ReactElement, ReactNode, RefObject } from 'react';
import { Button } from '../../registry/nocobase-ai/shared/ui/button.js';
import {
  Dialog,
  DialogPortal,
  DialogTitle,
} from '../../registry/nocobase-ai/shared/ui/dialog.js';
import { useT } from '../locales/index.js';

export function CatalogDetailsDrawer({
  open,
  title,
  onClose,
  returnFocusRef,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
  children: ReactNode;
}): ReactElement {
  const t = useT();
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      {open ? (
        <DialogPortal>
          <DialogPrimitive.Backdrop className='fixed inset-0 z-50 bg-black/40 transition-opacity duration-200 data-starting-style:opacity-0 data-ending-style:opacity-0 motion-reduce:transition-none' />
          <DialogPrimitive.Popup
            finalFocus={returnFocusRef}
            className='fixed inset-y-0 right-0 z-50 flex h-dvh w-full min-w-0 max-w-2xl flex-col overflow-hidden border-l bg-background text-foreground shadow-xl outline-none transition-transform duration-200 data-starting-style:translate-x-full data-ending-style:translate-x-full motion-reduce:transition-none'
          >
            <header className='flex shrink-0 items-center justify-between gap-4 border-b px-6 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-8'>
              <DialogTitle>{title}</DialogTitle>
              <DialogPrimitive.Close
                render={
                  <Button variant='ghost' size='icon' className='size-11' />
                }
                aria-label={t('Close')}
              >
                <X aria-hidden='true' />
              </DialogPrimitive.Close>
            </header>
            {children}
          </DialogPrimitive.Popup>
        </DialogPortal>
      ) : null}
    </Dialog>
  );
}
