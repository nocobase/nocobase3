import { XIcon } from 'lucide-react';
import * as React from 'react';
import { createPortal } from 'react-dom';

import { cn } from '../../lib/utils.js';
import { Button } from './button.js';
import { useModalBehavior } from './modal-behavior.js';

interface DialogContextValue {
  readonly open: boolean;
  readonly setOpen: (open: boolean) => void;
  readonly titleId: string;
  readonly descriptionId: string;
}

const DialogContext = React.createContext<DialogContextValue | null>(null);

interface DialogProps {
  readonly open?: boolean;
  readonly defaultOpen?: boolean;
  readonly modal?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly children?: React.ReactNode;
}

function Dialog({
  open,
  defaultOpen = false,
  onOpenChange,
  children,
}: DialogProps): React.ReactElement {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const titleId = React.useId();
  const descriptionId = React.useId();
  const resolvedOpen = open ?? uncontrolledOpen;
  const controlled = open !== undefined;
  const onOpenChangeRef = React.useRef(onOpenChange);
  React.useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  }, [onOpenChange]);
  const setOpen = React.useCallback(
    (nextOpen: boolean): void => {
      if (!controlled) setUncontrolledOpen(nextOpen);
      onOpenChangeRef.current?.(nextOpen);
    },
    [controlled],
  );
  const context = React.useMemo<DialogContextValue>(
    () => ({
      open: resolvedOpen,
      setOpen,
      titleId,
      descriptionId,
    }),
    [descriptionId, resolvedOpen, setOpen, titleId],
  );

  return (
    <DialogContext.Provider value={context}>{children}</DialogContext.Provider>
  );
}

function DialogTrigger({
  onClick,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>): React.ReactElement {
  const context = useDialogContext();
  return (
    <button
      type='button'
      data-slot='dialog-trigger'
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) context.setOpen(true);
      }}
      {...props}
    />
  );
}

function DialogPortal({
  children,
}: React.PropsWithChildren): React.ReactElement | null {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}

function DialogClose({
  onClick,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>): React.ReactElement {
  const context = useDialogContext();
  return (
    <button
      type='button'
      data-slot='dialog-close'
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) context.setOpen(false);
      }}
      {...props}
    />
  );
}

function DialogOverlay({
  className,
  onClick,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.ReactElement {
  const context = useDialogContext();
  return (
    <div
      data-slot='dialog-overlay'
      data-open=''
      className={cn(
        'fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0',
        className,
      )}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) context.setOpen(false);
      }}
      {...props}
    />
  );
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  readonly showCloseButton?: boolean;
}): React.ReactElement | null {
  const context = useDialogContext();
  const { open, setOpen } = context;
  const contentRef = React.useRef<HTMLDivElement>(null);

  const close = React.useCallback((): void => setOpen(false), [setOpen]);
  useModalBehavior(open, contentRef, close);

  if (!open) return null;
  return (
    <DialogPortal>
      <DialogOverlay />
      <div
        ref={contentRef}
        role='dialog'
        aria-modal='true'
        aria-labelledby={context.titleId}
        aria-describedby={context.descriptionId}
        tabIndex={-1}
        data-slot='dialog-content'
        data-open=''
        className={cn(
          'fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95',
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton ? (
          <Button
            type='button'
            variant='ghost'
            className='absolute top-2 right-2'
            size='icon-sm'
            onClick={() => context.setOpen(false)}
          >
            <XIcon />
            <span className='sr-only'>Close</span>
          </Button>
        ) : null}
      </div>
    </DialogPortal>
  );
}

function DialogHeader({
  className,
  ...props
}: React.ComponentProps<'div'>): React.ReactElement {
  return (
    <div
      data-slot='dialog-header'
      className={cn('flex flex-col gap-2', className)}
      {...props}
    />
  );
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<'div'> & {
  readonly showCloseButton?: boolean;
}): React.ReactElement {
  const context = useDialogContext();
  return (
    <div
      data-slot='dialog-footer'
      className={cn(
        '-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end',
        className,
      )}
      {...props}
    >
      {children}
      {showCloseButton ? (
        <Button
          type='button'
          variant='outline'
          onClick={() => context.setOpen(false)}
        >
          Close
        </Button>
      ) : null}
    </div>
  );
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<'h2'>): React.ReactElement {
  const { titleId } = useDialogContext();
  return (
    <h2
      id={titleId}
      data-slot='dialog-title'
      className={cn(
        'font-heading text-base leading-none font-medium',
        className,
      )}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<'p'>): React.ReactElement {
  const { descriptionId } = useDialogContext();
  return (
    <p
      id={descriptionId}
      data-slot='dialog-description'
      className={cn(
        'text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground',
        className,
      )}
      {...props}
    />
  );
}

function useDialogContext(): DialogContextValue {
  const context = React.useContext(DialogContext);
  if (!context)
    throw new Error('Dialog components must be rendered inside Dialog.');
  return context;
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
