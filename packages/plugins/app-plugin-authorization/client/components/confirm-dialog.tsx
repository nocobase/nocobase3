import { useRef, type ReactElement, type ReactNode } from 'react';

import { useAuthorizationTranslation } from '../i18n.js';
import { Button } from './ui/button.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog.js';

/**
 * The one confirmation every destructive action in this module goes through.
 * The body names what is about to happen and to what; cancel holds the focus
 * when it opens, and Escape or the backdrop leaves without doing anything.
 */
export function ConfirmDialog({
  open,
  title,
  confirmLabel,
  cancelLabel,
  busy = false,
  children,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  /** What the confirm button does, named as the action rather than as "OK". */
  confirmLabel: string;
  cancelLabel?: string;
  busy?: boolean;
  /** The body: what is about to happen, and to what. */
  children: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}): ReactElement {
  const t = useAuthorizationTranslation();
  const cancelRef = useRef<HTMLButtonElement>(null);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <DialogContent className='max-w-sm' initialFocus={cancelRef}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{children}</DialogDescription>
        </DialogHeader>
        <div className='flex justify-end gap-2'>
          <Button ref={cancelRef} variant='outline' onClick={onCancel}>
            {cancelLabel ?? t('common.cancel')}
          </Button>
          <Button disabled={busy} variant='destructive' onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
