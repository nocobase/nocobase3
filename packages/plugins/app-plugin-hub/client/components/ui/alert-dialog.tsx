import * as React from 'react';
import { createPortal } from 'react-dom';

import { cn } from '../../lib/utils.js';
import { Button, type ButtonProps } from './button.js';
import { useModalBehavior } from './modal-behavior.js';

interface AlertDialogContextValue {
  readonly open: boolean;
  readonly setOpen: (open: boolean) => void;
  readonly titleId: string;
  readonly descriptionId: string;
}

const AlertDialogContext = React.createContext<AlertDialogContextValue | null>(
  null,
);

interface AlertDialogProps {
  readonly open?: boolean;
  readonly defaultOpen?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly children?: React.ReactNode;
}

function AlertDialog({
  open,
  defaultOpen = false,
  onOpenChange,
  children,
}: AlertDialogProps): React.ReactElement {
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
  const context = React.useMemo<AlertDialogContextValue>(
    () => ({
      open: resolvedOpen,
      setOpen,
      titleId,
      descriptionId,
    }),
    [descriptionId, resolvedOpen, setOpen, titleId],
  );

  return (
    <AlertDialogContext.Provider value={context}>
      {children}
    </AlertDialogContext.Provider>
  );
}

function AlertDialogTrigger({
  onClick,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>): React.ReactElement {
  const context = useAlertDialogContext();
  return (
    <button
      type='button'
      data-slot='alert-dialog-trigger'
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) context.setOpen(true);
      }}
      {...props}
    />
  );
}

function AlertDialogPortal({
  children,
}: React.PropsWithChildren): React.ReactElement | null {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}

function AlertDialogOverlay({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.ReactElement {
  return (
    <div
      data-slot='alert-dialog-overlay'
      data-open=''
      className={cn(
        'fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0',
        className,
      )}
      {...props}
    />
  );
}

function AlertDialogContent({
  className,
  size = 'default',
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  readonly size?: 'default' | 'sm';
}): React.ReactElement | null {
  const context = useAlertDialogContext();
  const { open, setOpen } = context;
  const contentRef = React.useRef<HTMLDivElement>(null);

  const close = React.useCallback((): void => setOpen(false), [setOpen]);
  useModalBehavior(open, contentRef, close);

  if (!open) return null;
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <div
        ref={contentRef}
        role='alertdialog'
        aria-modal='true'
        aria-labelledby={context.titleId}
        aria-describedby={context.descriptionId}
        tabIndex={-1}
        data-slot='alert-dialog-content'
        data-size={size}
        data-open=''
        className={cn(
          'group/alert-dialog-content fixed top-1/2 left-1/2 z-50 grid w-full -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-popover p-4 text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none data-[size=default]:max-w-xs data-[size=sm]:max-w-xs data-[size=default]:sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95',
          className,
        )}
        {...props}
      >
        {children}
      </div>
    </AlertDialogPortal>
  );
}

function AlertDialogHeader({
  className,
  ...props
}: React.ComponentProps<'div'>): React.ReactElement {
  return (
    <div
      data-slot='alert-dialog-header'
      className={cn(
        'grid grid-rows-[auto_1fr] place-items-center gap-1.5 text-center has-data-[slot=alert-dialog-media]:grid-rows-[auto_auto_1fr] has-data-[slot=alert-dialog-media]:gap-x-4 sm:group-data-[size=default]/alert-dialog-content:place-items-start sm:group-data-[size=default]/alert-dialog-content:text-left sm:group-data-[size=default]/alert-dialog-content:has-data-[slot=alert-dialog-media]:grid-rows-[auto_1fr]',
        className,
      )}
      {...props}
    />
  );
}

function AlertDialogFooter({
  className,
  ...props
}: React.ComponentProps<'div'>): React.ReactElement {
  return (
    <div
      data-slot='alert-dialog-footer'
      className={cn(
        '-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 group-data-[size=sm]/alert-dialog-content:grid group-data-[size=sm]/alert-dialog-content:grid-cols-2 sm:flex-row sm:justify-end',
        className,
      )}
      {...props}
    />
  );
}

function AlertDialogMedia({
  className,
  ...props
}: React.ComponentProps<'div'>): React.ReactElement {
  return (
    <div
      data-slot='alert-dialog-media'
      className={cn(
        "mb-2 inline-flex size-10 items-center justify-center rounded-md bg-muted sm:group-data-[size=default]/alert-dialog-content:row-span-2 *:[svg:not([class*='size-'])]:size-6",
        className,
      )}
      {...props}
    />
  );
}

function AlertDialogTitle({
  className,
  ...props
}: React.ComponentProps<'h2'>): React.ReactElement {
  const { titleId } = useAlertDialogContext();
  return (
    <h2
      id={titleId}
      data-slot='alert-dialog-title'
      className={cn(
        'font-heading text-base font-medium sm:group-data-[size=default]/alert-dialog-content:group-has-data-[slot=alert-dialog-media]/alert-dialog-content:col-start-2',
        className,
      )}
      {...props}
    />
  );
}

function AlertDialogDescription({
  className,
  ...props
}: React.ComponentProps<'p'>): React.ReactElement {
  const { descriptionId } = useAlertDialogContext();
  return (
    <p
      id={descriptionId}
      data-slot='alert-dialog-description'
      className={cn(
        'text-sm text-balance text-muted-foreground md:text-pretty *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground',
        className,
      )}
      {...props}
    />
  );
}

function AlertDialogAction({
  className,
  onClick,
  ...props
}: ButtonProps): React.ReactElement {
  const context = useAlertDialogContext();
  return (
    <Button
      data-slot='alert-dialog-action'
      className={cn(className)}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) context.setOpen(false);
      }}
      {...props}
    />
  );
}

function AlertDialogCancel({
  className,
  variant = 'outline',
  size = 'default',
  onClick,
  ...props
}: ButtonProps): React.ReactElement {
  const context = useAlertDialogContext();
  return (
    <Button
      data-slot='alert-dialog-cancel'
      className={cn(className)}
      variant={variant}
      size={size}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) context.setOpen(false);
      }}
      {...props}
    />
  );
}

function useAlertDialogContext(): AlertDialogContextValue {
  const context = React.useContext(AlertDialogContext);
  if (!context) {
    throw new Error(
      'AlertDialog components must be rendered inside AlertDialog.',
    );
  }
  return context;
}

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
};
