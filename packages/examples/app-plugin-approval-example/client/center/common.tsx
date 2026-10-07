import type { ReactElement, ReactNode } from 'react';

import type { RecordSummary } from '../../shared/types.js';
import { stateTone, TONE_CLASSES, useText, type Tone } from '../lib/text.js';
import { cn } from '../lib/utils.js';
import { displayTitle, factsLine } from './describe.js';
import { Avatar } from './persona.js';

export function StatusBadge({
  lifecycle,
  state,
  className,
}: {
  readonly lifecycle: string;
  readonly state: string;
  readonly className?: string;
}): ReactElement {
  const text = useText();
  return (
    <span
      className={cn(
        'inline-flex h-5 shrink-0 items-center rounded-full px-2 text-xs font-medium whitespace-nowrap',
        TONE_CLASSES[stateTone(lifecycle, state)],
        className,
      )}
    >
      {text.status(lifecycle, state)}
    </span>
  );
}

export function Pill({
  tone = 'neutral',
  children,
}: {
  readonly tone?: Tone;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <span
      className={cn(
        'inline-flex h-5 shrink-0 items-center rounded-full px-2 text-xs whitespace-nowrap',
        TONE_CLASSES[tone],
      )}
    >
      {children}
    </span>
  );
}

export function Banner({
  tone,
  children,
}: {
  readonly tone: Tone;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn('rounded-lg px-3 py-2 text-sm', TONE_CLASSES[tone])}
    >
      {children}
    </div>
  );
}

export function Section({
  title,
  children,
  className,
  aside,
}: {
  readonly title: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
  readonly aside?: ReactNode;
}): ReactElement {
  return (
    <section className={cn('rounded-xl border bg-card p-4 sm:p-5', className)}>
      <div className='mb-4 flex items-center justify-between gap-2'>
        <h3 className='text-sm font-semibold'>{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Tabs<T extends string>({
  value,
  onChange,
  tabs,
}: {
  readonly value: T;
  readonly onChange: (value: T) => void;
  readonly tabs: readonly {
    readonly value: T;
    readonly label: string;
    readonly count?: number;
  }[];
}): ReactElement {
  return (
    <div
      role='tablist'
      className='inline-flex flex-wrap gap-1 rounded-lg bg-muted p-1'
    >
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type='button'
          role='tab'
          aria-selected={tab.value === value}
          onClick={() => onChange(tab.value)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-sm transition-colors',
            tab.value === value
              ? 'bg-background font-medium shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {tab.label}
          {tab.count ? (
            <span
              className={cn(
                'rounded-full px-1.5 text-[11px] leading-4',
                tab.value === value
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background',
              )}
            >
              {tab.count}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

export function Empty({
  children,
}: {
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div className='rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground'>
      {children}
    </div>
  );
}

/** One request in a list: who asked for what, where it stands, and who it waits for. */
export function RequestRow({
  record,
  selected,
  onSelect,
  task,
  showBusiness = false,
  since,
}: {
  readonly record: RecordSummary;
  readonly selected: boolean;
  readonly onSelect: () => void;
  readonly task?: ReactNode;
  readonly showBusiness?: boolean;
  readonly since?: string | null;
}): ReactElement {
  const text = useText();
  const facts = factsLine(text, record);
  return (
    <button
      type='button'
      onClick={onSelect}
      className={cn(
        'flex w-full gap-3 rounded-xl border bg-card p-3 text-left transition-colors hover:border-primary/40 hover:bg-muted/30',
        selected && 'border-primary bg-primary/5 hover:bg-primary/5',
      )}
    >
      <Avatar id={record.applicantId ?? 'system'} size='md' />
      <div className='min-w-0 flex-1 space-y-1'>
        <div className='flex items-start justify-between gap-2'>
          <div className='min-w-0'>
            <div className='truncate text-sm font-medium'>
              {displayTitle(text, record)}
            </div>
            <div className='truncate text-xs text-muted-foreground'>
              {showBusiness ? `${text.business(record.business)} · ` : ''}
              {text.demo(record.demo)}
              {facts ? ` · ${facts}` : ''}
            </div>
          </div>
          <StatusBadge lifecycle={record.lifecycle} state={record.status} />
        </div>
        {task ? (
          <div className='text-xs font-medium text-amber-700 dark:text-amber-400'>
            {task}
          </div>
        ) : record.handlers.length ? (
          <div className='truncate text-xs text-muted-foreground'>
            {record.stage ? `${text.stage(record.stage)} · ` : ''}
            {text.t('flow.waitingFor', { names: text.names(record.handlers) })}
          </div>
        ) : null}
        <div className='text-[11px] text-muted-foreground'>
          {text.name(record.applicantId)} ·{' '}
          {text.ago(since ?? record.changedAt ?? record.createdAt)}
        </div>
      </div>
    </button>
  );
}
