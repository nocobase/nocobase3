import type { ReactElement } from 'react';
import type { JsonObject } from '@nocobase/lifecycle';

import type { RecordDetail } from '../../shared/types.js';
import { useText, type Text } from '../lib/text.js';
import { cn } from '../lib/utils.js';
import { Avatar } from './persona.js';

interface Moment {
  readonly key: string;
  readonly at: string;
  readonly actorId: string;
  readonly kind: 'record' | 'run' | 'log';
  readonly label: string;
  readonly note: string | null;
}

function noteOf(input: JsonObject): string | null {
  for (const field of ['reason', 'comment', 'note', 'evidence'])
    if (typeof input[field] === 'string' && input[field]) return input[field];
  return null;
}

/** Every moment of a request, oldest first: its own moves, its runs' moves, and the approval log. */
function moments(text: Text, detail: RecordDetail): Moment[] {
  const lifecycle = detail.summary.lifecycle;
  const items: Moment[] = detail.history.map((entry) => ({
    key: `record:${entry.id}`,
    at: entry.at,
    actorId: entry.actorId,
    kind: 'record',
    label:
      entry.transition === '$create'
        ? text.t('timeline.created')
        : text.t('timeline.moved', {
            action: text.transition(lifecycle, entry.transition),
            state: text.status(lifecycle, entry.to),
          }),
    note: noteOf(entry.input),
  }));
  for (const view of detail.runs) {
    for (const entry of view.history)
      if (entry.transition !== '$create')
        items.push({
          key: `run:${entry.id}`,
          at: entry.at,
          actorId: entry.actorId,
          kind: 'run',
          label: text.t('timeline.stage', {
            stage: text.stage(entry.to),
            from: entry.from ? text.stage(entry.from) : '',
          }),
          note: noteOf(entry.input),
        });
    for (const event of view.events)
      items.push({
        key: `log:${event.id}`,
        at: event.at,
        actorId: event.actorId,
        kind: 'log',
        label: text.lookup([`events.${event.kind}`], event.kind),
        note: event.message,
      });
  }
  return items.sort((a, b) =>
    a.at === b.at ? a.key.localeCompare(b.key) : a.at.localeCompare(b.at),
  );
}

export function Timeline({
  detail,
}: {
  readonly detail: RecordDetail;
}): ReactElement {
  const text = useText();
  const items = moments(text, detail);
  return (
    <ol className='space-y-3'>
      {items.map((item) => (
        <li key={item.key} className='flex gap-3'>
          <Avatar id={item.actorId} size='sm' />
          <div className='min-w-0 flex-1'>
            <div className='flex flex-wrap items-baseline gap-x-2 text-sm'>
              <span className='font-medium'>{text.name(item.actorId)}</span>
              <span
                className={cn(
                  item.kind === 'log' && 'text-muted-foreground',
                  item.kind === 'run' && 'text-primary',
                )}
              >
                {item.label}
              </span>
              <span className='text-xs text-muted-foreground'>
                {text.dateTime(item.at)}
              </span>
            </div>
            {item.note ? (
              <div className='mt-0.5 text-xs text-muted-foreground'>
                “{item.note}”
              </div>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
