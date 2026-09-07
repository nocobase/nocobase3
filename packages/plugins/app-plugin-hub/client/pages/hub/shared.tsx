import { AlertCircle, X } from 'lucide-react';
import { Badge } from '../../components/ui/badge.js';
import { Alert, AlertDescription } from '../../components/ui/alert.js';
import { Avatar, AvatarFallback } from '../../components/ui/avatar.js';
import { Button } from '../../components/ui/button.js';
import {
  Dialog as UiDialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog.js';
import {
  Empty as ShadcnEmpty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '../../components/ui/empty.js';
import { type ReactElement, type ReactNode } from 'react';
import { initials, stateLabel } from './utils.js';

export function AppDialog({
  title,
  description,
  onClose,
  children,
  wide = false,
}: {
  readonly title: string;
  readonly description: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly wide?: boolean;
}): ReactElement {
  return (
    <UiDialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent
        className={wide ? 'max-w-none p-8' : 'max-w-xl p-8'}
        style={wide ? { width: 'min(72rem, calc(100vw - 2rem))' } : undefined}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </UiDialog>
  );
}

export function ErrorBanner({
  message,
  onClose,
}: {
  readonly message: string;
  readonly onClose?: () => void;
}): ReactElement {
  return (
    <Alert className='mb-5 border-destructive/30 bg-destructive/5 text-destructive'>
      <AlertCircle className='size-4 shrink-0' />
      <AlertDescription className='text-destructive'>
        {message}
      </AlertDescription>
      {onClose ? (
        <Button
          aria-label='Dismiss error'
          className='absolute top-1 right-1'
          onClick={onClose}
          size='icon'
          variant='ghost'
        >
          <X className='size-4' />
        </Button>
      ) : null}
    </Alert>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  readonly label: string;
  readonly hint?: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <label className='mb-4 block text-sm font-medium'>
      {label}
      <span className='mt-2 block'>{children}</span>
      {hint ? (
        <span className='mt-1.5 block text-xs font-normal text-muted-foreground'>
          {hint}
        </span>
      ) : null}
    </label>
  );
}

export function Empty({
  icon,
  title,
  description,
  action,
}: {
  readonly icon: ReactNode;
  readonly title: string;
  readonly description?: string;
  readonly action?: ReactNode;
}): ReactElement {
  return (
    <ShadcnEmpty className='bg-card'>
      <EmptyMedia>{icon}</EmptyMedia>
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        {description ? (
          <EmptyDescription>{description}</EmptyDescription>
        ) : null}
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </ShadcnEmpty>
  );
}

export function ViewButton({
  active,
  label,
  onClick,
  icon,
}: {
  readonly active: boolean;
  readonly label: string;
  readonly onClick: () => void;
  readonly icon: ReactNode;
}): ReactElement {
  return (
    <Button
      aria-label={label}
      onClick={onClick}
      className={active ? 'size-8 bg-muted' : 'size-8 text-muted-foreground'}
      size='icon'
      variant='ghost'
    >
      {icon}
    </Button>
  );
}

export function AppMark({
  name,
  small = false,
}: {
  readonly name: string;
  readonly small?: boolean;
}): ReactElement {
  return (
    <Avatar className={small ? 'size-9' : 'size-12'}>
      <AvatarFallback className='bg-primary/10 font-semibold text-primary'>
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}

export function StatusBadge({
  state,
}: {
  readonly state: string;
}): ReactElement {
  const style =
    state === 'running'
      ? 'bg-emerald-500/10 text-emerald-700'
      : state === 'failed'
        ? 'bg-destructive/10 text-destructive'
        : state === 'pending' || state === 'queued' || state === 'deploying'
          ? 'bg-amber-500/10 text-amber-700'
          : state === 'succeeded'
            ? 'bg-emerald-500/10 text-emerald-700'
            : state === 'stopped'
              ? 'bg-sky-500/10 text-sky-700'
              : 'bg-muted text-muted-foreground';
  return (
    <Badge className={`self-center gap-1.5 whitespace-nowrap ${style}`}>
      <span
        className={`size-1.5 rounded-full ${state === 'running' || state === 'succeeded' ? 'bg-emerald-500' : state === 'failed' ? 'bg-destructive' : state === 'pending' || state === 'queued' || state === 'deploying' ? 'bg-amber-500' : state === 'stopped' ? 'bg-sky-500' : 'bg-neutral-400'}`}
      />
      {stateLabel(state)}
    </Badge>
  );
}
