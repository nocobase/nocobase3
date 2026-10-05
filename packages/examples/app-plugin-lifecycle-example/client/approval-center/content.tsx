import type { ReactElement } from 'react';
import type { JsonObject } from '@nocobase/lifecycle';

import { cn } from '../lib/utils.js';
import { formatValue } from './describe.js';
import { getPath } from './field-values.js';
import type { FieldSpec } from './fields.js';
import { stateTone, TONE_CLASSES, useCenterText } from './format.js';

export function StatusBadge({
  lifecycle,
  state,
  className,
}: {
  readonly lifecycle: string;
  readonly state: string;
  readonly className?: string;
}): ReactElement {
  const text = useCenterText();
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

/** The business fields of a record, label above value. */
export function DisplayGrid({
  specs,
  record,
}: {
  readonly specs: readonly FieldSpec[];
  readonly record: JsonObject;
}): ReactElement | null {
  const text = useCenterText();
  const rows = specs
    .map((spec) => ({
      spec,
      value: formatValue(text, spec, getPath(record, spec.name)),
    }))
    .filter((row) => row.value !== null);
  if (!rows.length) return null;
  return (
    <dl className='grid gap-x-6 gap-y-4 sm:grid-cols-2'>
      {rows.map(({ spec, value }) => (
        <div
          key={spec.name}
          className={cn('min-w-0', spec.kind === 'textarea' && 'sm:col-span-2')}
        >
          <dt className='text-xs text-muted-foreground'>
            {text.t(
              spec.label ??
                `center.fields.${spec.name.split('.').at(-1) ?? ''}`,
            )}
          </dt>
          <dd className='mt-1 text-sm break-words whitespace-pre-wrap'>
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
