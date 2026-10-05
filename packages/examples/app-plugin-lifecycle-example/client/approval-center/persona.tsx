import type { ReactElement } from 'react';

import {
  CENTER_PEOPLE,
  type CenterCastMember,
  type CenterDepartment,
} from '../../shared/approval-center.js';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select.js';
import { cn } from '../lib/utils.js';
import { useCenterText } from './format.js';

const AVATAR_COLORS = [
  'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  'bg-violet-500/15 text-violet-700 dark:text-violet-300',
  'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  'bg-rose-500/15 text-rose-700 dark:text-rose-300',
  'bg-teal-500/15 text-teal-700 dark:text-teal-300',
];

function colorOf(id: string): string {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function Avatar({
  id,
  size = 'md',
}: {
  readonly id: string;
  readonly size?: 'sm' | 'md' | 'lg';
}): ReactElement {
  const text = useCenterText();
  const name = text.name(id);
  // A Chinese name shows its first character only, as two would crowd the
  // circle; a Latin name shows its initials.
  const initial = /[\u3400-\u9fff]/.test(name)
    ? (Array.from(name)[0] ?? '')
    : name
        .split(' ')
        .map((part) => part[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();
  return (
    <span
      aria-hidden='true'
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-medium',
        id === 'system' ? 'bg-muted text-muted-foreground' : colorOf(id),
        size === 'sm' && 'size-6 text-[10px]',
        size === 'md' && 'size-8 text-xs',
        size === 'lg' && 'size-10 text-sm',
      )}
    >
      {id === 'system' ? '⚙' : initial}
    </span>
  );
}

/** A person with avatar, name and, optionally, job title. */
export function Person({
  id,
  withTitle = false,
  size = 'sm',
}: {
  readonly id: string;
  readonly withTitle?: boolean;
  readonly size?: 'sm' | 'md' | 'lg';
}): ReactElement {
  const text = useCenterText();
  return (
    <span className='inline-flex min-w-0 items-center gap-2'>
      <Avatar id={id} size={size} />
      <span className='min-w-0 truncate'>
        <span className='text-sm'>{text.name(id)}</span>
        {withTitle && text.title(id) ? (
          <span className='ml-1.5 text-xs text-muted-foreground'>
            {text.title(id)}
          </span>
        ) : null}
      </span>
    </span>
  );
}

const DEPARTMENTS: readonly CenterDepartment[] = [
  'marketing',
  'management',
  'hr',
  'finance',
  'legal',
  'committee',
  'it',
  'operations',
  'risk',
  'external',
  'system',
];

/** A person select grouped by department, for the persona and for form fields. */
export function PersonSelect({
  value,
  onChange,
  label,
  people,
  className,
  placeholder,
}: {
  readonly value: string;
  readonly onChange: (id: string) => void;
  readonly label: string;
  /** Limits the choice; every active person otherwise. */
  readonly people?: readonly string[];
  readonly className?: string;
  readonly placeholder?: string;
}): ReactElement {
  const text = useCenterText();
  const allowed = CENTER_PEOPLE.filter(
    (person) => !people || people.includes(person.id),
  );
  const items = [
    ...(placeholder ? [{ value: '', label: placeholder }] : []),
    ...allowed.map((person) => ({
      value: person.id,
      label: `${text.name(person.id)} · ${text.title(person.id)}`,
    })),
  ];
  return (
    <Select
      items={items}
      value={value}
      onValueChange={(next) => {
        if (typeof next === 'string') onChange(next);
      }}
    >
      <SelectTrigger aria-label={label} className={cn('min-w-48', className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {placeholder ? <SelectItem value=''>{placeholder}</SelectItem> : null}
        {DEPARTMENTS.map((department) => {
          const members = allowed.filter(
            (person) => person.department === department,
          );
          return members.length ? (
            <SelectGroup key={department}>
              <SelectLabel>
                {text.t(`center.departments.${department}`)}
              </SelectLabel>
              {members.map((person) => (
                <SelectItem key={person.id} value={person.id}>
                  {text.name(person.id)} · {text.title(person.id)}
                </SelectItem>
              ))}
            </SelectGroup>
          ) : null;
        })}
      </SelectContent>
    </Select>
  );
}

/**
 * The demo's identity switcher: who you are now, and the people a business
 * involves, one click away.
 */
export function PersonaBar({
  persona,
  onChange,
  cast = [],
  counts = {},
}: {
  readonly persona: string;
  readonly onChange: (id: string) => void;
  readonly cast?: readonly CenterCastMember[];
  /** Open to-dos by person, shown on the cast chips. */
  readonly counts?: Readonly<Record<string, number>>;
}): ReactElement {
  const text = useCenterText();
  return (
    <div className='flex flex-col gap-3 rounded-xl border bg-muted/30 p-3 lg:flex-row lg:items-center'>
      <div className='flex shrink-0 items-center gap-2'>
        <Avatar id={persona} size='lg' />
        <div className='min-w-0'>
          <div className='text-xs text-muted-foreground'>
            {text.t('center.persona.label')}
          </div>
          <PersonSelect
            value={persona}
            onChange={onChange}
            label={text.t('center.persona.label')}
            className='h-7 border-none bg-transparent px-0 text-sm font-medium shadow-none'
          />
        </div>
      </div>
      {cast.length ? (
        <div className='flex min-w-0 flex-1 flex-wrap items-center gap-1.5 lg:justify-end'>
          <span className='mr-1 text-xs text-muted-foreground'>
            {text.t('center.persona.switchTo')}
          </span>
          {cast.map((member) => (
            <button
              key={`${member.id}:${member.role}`}
              type='button'
              onClick={() => onChange(member.id)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border bg-background py-0.5 pr-2.5 pl-0.5 text-xs transition-colors hover:bg-muted',
                member.id === persona &&
                  'border-primary bg-primary/10 text-primary hover:bg-primary/15',
              )}
            >
              <Avatar id={member.id} size='sm' />
              <span>{text.t(`center.cast.${member.role}`)}</span>
              <span className='text-muted-foreground'>
                {text.name(member.id)}
              </span>
              {counts[member.id] ? (
                <span className='rounded-full bg-destructive px-1.5 text-[10px] leading-4 text-white'>
                  {counts[member.id]}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ) : (
        <p className='flex-1 text-xs text-muted-foreground lg:text-right'>
          {text.t('center.persona.hint')}
        </p>
      )}
    </div>
  );
}
