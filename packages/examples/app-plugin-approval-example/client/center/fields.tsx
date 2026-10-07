import { text as str } from '../../shared/text.js';
import { useState, type ReactElement } from 'react';
import type { JsonObject, JsonValue } from '@nocobase/lifecycle';
import { Plus, Trash2 } from 'lucide-react';

import { Choice } from '../components/choice.js';
import { Textarea } from '../components/textarea.js';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { cn } from '../lib/utils.js';
import { useText } from '../lib/text.js';
import { getPath, setPath } from './field-values.js';
import { Avatar, PersonSelect } from './persona.js';

let counter = 0;

/** A key for a row while it is edited; it never reaches the values. */
function randomId(): string {
  counter += 1;
  return `row${counter}`;
}

/**
 * A form field, named by its path in the values: `content.days`,
 * `requested.limitCents`. The label is `fields.<last segment>` unless
 * `label` names another key.
 */
export type FieldSpec = {
  readonly name: string;
  readonly label?: string;
  readonly required?: boolean;
  readonly hint?: string;
  readonly wide?: boolean;
} & (
  | { readonly kind: 'text' | 'textarea' }
  | { readonly kind: 'number'; readonly min?: number }
  /** An amount in yuan, stored as is. */
  | { readonly kind: 'money' }
  /** An amount in cents, edited in yuan. */
  | { readonly kind: 'cents' }
  | { readonly kind: 'date' | 'datetime' }
  | {
      readonly kind: 'select';
      readonly group: string;
      readonly options: readonly string[];
      /** Labels by option, for options that are data rather than words. */
      readonly labels?: Readonly<Record<string, string>>;
    }
  | { readonly kind: 'person'; readonly people?: readonly string[] }
  | { readonly kind: 'people'; readonly people?: readonly string[] }
  | { readonly kind: 'checkbox' }
  | {
      readonly kind: 'items';
      readonly columns: readonly FieldSpec[];
      readonly create: () => JsonObject;
    }
);

function labelKey(spec: FieldSpec): string {
  return spec.label ?? `fields.${spec.name.split('.').at(-1) ?? ''}`;
}

function toInputDate(value: JsonValue, withTime: boolean): string {
  if (typeof value !== 'string' || !value) return '';
  if (!withTime) return value.slice(0, 10);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function FieldControl({
  spec,
  value,
  onChange,
  invalid,
}: {
  readonly spec: FieldSpec;
  readonly value: JsonValue;
  readonly onChange: (value: JsonValue) => void;
  readonly invalid: boolean;
}): ReactElement {
  const text = useText();
  const label = text.t(labelKey(spec));
  switch (spec.kind) {
    case 'textarea':
      return (
        <Textarea
          aria-label={label}
          aria-invalid={invalid || undefined}
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    case 'number':
    case 'money':
    case 'cents': {
      const shown =
        typeof value === 'number'
          ? spec.kind === 'cents'
            ? value / 100
            : value
          : '';
      return (
        <div className='relative'>
          {spec.kind !== 'number' ? (
            <span className='pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-muted-foreground'>
              ¥
            </span>
          ) : null}
          <Input
            aria-label={label}
            aria-invalid={invalid || undefined}
            type='number'
            min={spec.kind === 'number' ? (spec.min ?? 0) : 0}
            step={spec.kind === 'number' ? 1 : 0.01}
            className={spec.kind !== 'number' ? 'pl-6' : undefined}
            value={shown}
            onChange={(event) => {
              const parsed = Number(event.target.value);
              if (event.target.value === '' || !Number.isFinite(parsed))
                onChange(0);
              else
                onChange(
                  spec.kind === 'cents' ? Math.round(parsed * 100) : parsed,
                );
            }}
          />
        </div>
      );
    }
    case 'date':
    case 'datetime':
      return (
        <Input
          aria-label={label}
          aria-invalid={invalid || undefined}
          type={spec.kind === 'date' ? 'date' : 'datetime-local'}
          value={toInputDate(value, spec.kind === 'datetime')}
          onChange={(event) =>
            onChange(
              spec.kind === 'date'
                ? event.target.value
                : event.target.value
                  ? new Date(event.target.value).toISOString()
                  : '',
            )
          }
        />
      );
    case 'select':
      return (
        <Choice
          label={label}
          value={str(value)}
          options={spec.options.map((option) => ({
            value: option,
            label: spec.labels?.[option] ?? text.option(spec.group, option),
          }))}
          onChange={onChange}
        />
      );
    case 'person':
      return (
        <PersonSelect
          label={label}
          value={typeof value === 'string' ? value : ''}
          onChange={onChange}
          people={spec.people}
          placeholder={text.t('form.choosePerson')}
          className='w-full'
        />
      );
    case 'people': {
      const chosen = Array.isArray(value)
        ? value.filter((item): item is string => typeof item === 'string')
        : [];
      return (
        <div className='space-y-2'>
          <div className='flex flex-wrap gap-1.5'>
            {chosen.map((id) => (
              <span
                key={id}
                className='inline-flex items-center gap-1 rounded-full border py-0.5 pr-1 pl-0.5 text-xs'
              >
                <Avatar id={id} size='sm' />
                {text.name(id)}
                <button
                  type='button'
                  aria-label={text.t('form.remove')}
                  className='rounded-full px-1 text-muted-foreground hover:bg-muted'
                  onClick={() => onChange(chosen.filter((item) => item !== id))}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <PersonSelect
            label={label}
            value=''
            people={(spec.people ?? undefined)?.filter(
              (id) => !chosen.includes(id),
            )}
            placeholder={text.t('form.addPerson')}
            onChange={(id) => {
              if (id && !chosen.includes(id)) onChange([...chosen, id]);
            }}
            className='w-full'
          />
        </div>
      );
    }
    case 'checkbox':
      return (
        <label className='flex h-8 items-center gap-2 text-sm'>
          <input
            type='checkbox'
            aria-label={label}
            className='size-4 accent-primary'
            checked={value === true}
            onChange={(event) => onChange(event.target.checked)}
          />
          {spec.hint ? text.t(spec.hint) : label}
        </label>
      );
    case 'items':
      return <ItemsControl spec={spec} value={value} onChange={onChange} />;
    default:
      return (
        <Input
          aria-label={label}
          aria-invalid={invalid || undefined}
          value={str(value)}
          onChange={(event) => onChange(event.target.value)}
        />
      );
  }
}

/**
 * Editable rows. Each row keeps a key of its own while it is edited, so
 * typing in one row never remounts another; the keys stay on the page and
 * never reach the values.
 */
function ItemsControl({
  spec,
  value,
  onChange,
}: {
  readonly spec: Extract<FieldSpec, { readonly kind: 'items' }>;
  readonly value: JsonValue;
  readonly onChange: (value: JsonValue) => void;
}): ReactElement {
  const text = useText();
  const rows = Array.isArray(value)
    ? value.filter(
        (row): row is JsonObject =>
          row !== null && typeof row === 'object' && !Array.isArray(row),
      )
    : [];
  const [keys, setKeys] = useState<string[]>(() => rows.map(() => randomId()));
  const rowKeys =
    keys.length === rows.length
      ? keys
      : rows.map((_, at) => keys[at] ?? randomId());
  return (
    <div className='space-y-2'>
      {rows.map((row, index) => (
        <div
          key={rowKeys[index]}
          className='grid items-start gap-2 rounded-lg border p-2 sm:grid-cols-[repeat(3,minmax(0,1fr))_auto]'
        >
          {spec.columns.map((column) => (
            <FieldControl
              key={column.name}
              spec={column}
              value={getPath(row, column.name)}
              invalid={false}
              onChange={(next) =>
                onChange(
                  rows.map((each, at) =>
                    at === index ? setPath(each, column.name, next) : each,
                  ),
                )
              }
            />
          ))}
          <Button
            type='button'
            variant='ghost'
            size='sm'
            aria-label={text.t('form.removeLine')}
            disabled={rows.length <= 1}
            onClick={() => {
              setKeys(rowKeys.filter((_, at) => at !== index));
              onChange(rows.filter((_, at) => at !== index));
            }}
          >
            <Trash2 />
          </Button>
        </div>
      ))}
      <Button
        type='button'
        variant='outline'
        size='sm'
        onClick={() => {
          setKeys([...rowKeys, randomId()]);
          onChange([...rows, spec.create()]);
        }}
      >
        <Plus />
        {text.t('form.addLine')}
      </Button>
    </div>
  );
}

/** Lays the fields out two to a row, wide ones across. */
export function FieldGrid({
  specs,
  values,
  onChange,
  invalid = [],
}: {
  readonly specs: readonly FieldSpec[];
  readonly values: JsonObject;
  readonly onChange: (values: JsonObject) => void;
  readonly invalid?: readonly string[];
}): ReactElement {
  const text = useText();
  return (
    <div className='grid gap-4 sm:grid-cols-2'>
      {specs.map((spec) => (
        <div
          key={spec.name}
          className={cn(
            'block min-w-0 space-y-1.5',
            (spec.wide ||
              spec.kind === 'textarea' ||
              spec.kind === 'items' ||
              spec.kind === 'people') &&
              'sm:col-span-2',
          )}
        >
          {spec.kind !== 'checkbox' || spec.hint ? (
            <span className='block text-sm font-medium'>
              {text.t(labelKey(spec))}
              {spec.required ? (
                <span className='ml-0.5 text-destructive'>*</span>
              ) : null}
            </span>
          ) : null}
          <FieldControl
            spec={spec}
            value={getPath(values, spec.name)}
            invalid={invalid.includes(spec.name)}
            onChange={(next) => onChange(setPath(values, spec.name, next))}
          />
          {spec.hint && spec.kind !== 'checkbox' ? (
            <span className='block text-xs text-muted-foreground'>
              {text.t(spec.hint)}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}
