import { text as str } from '../../shared/text.js';
import { useState, type ReactElement, type ReactNode } from 'react';
import { useApiClient } from '@nocobase/app-client';
import type { JsonObject, LifecycleRecord } from '@nocobase/lifecycle';
import { ArrowLeft, BellRing, ChevronRight } from 'lucide-react';

import type {
  CenterInboxItem,
  CenterRecord,
} from '../../shared/approval-center.js';
import { Banner } from '../components/record-ui.js';
import { Button } from '../components/ui/button.js';
import { errorMessage, type Translate } from '../lib/api.js';
import { useLoader } from '../lib/use-loader.js';
import { cn } from '../lib/utils.js';
import { visibleActions, type ActionContext } from './action-specs.js';
import { ActionPanel } from './actions.js';
import { centerApi, useCenterLifecycle } from './api.js';
import { DisplayGrid, StatusBadge } from './content.js';
import { displayTitle } from './describe.js';
import { RequestFlow } from './flow.js';
import { useCenterText } from './format.js';
import { Person } from './persona.js';
import { Timeline } from './timeline.js';
import { DISPLAY } from './types.js';

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

const DISPLAY_BY_LIFECYCLE: Readonly<Record<string, string>> = {
  leaveRequests: 'leave',
  paymentRequests: 'payment',
  authorizationRequests: 'authorization',
  budgetGrants: 'grant',
  supplierOnboardings: 'supplier',
  notices: 'notice',
  reimbursements: 'reimbursement',
};

function ItemsTable({
  items,
}: {
  readonly items: readonly JsonObject[];
}): ReactElement {
  const text = useCenterText();
  const total = items.reduce(
    (sum, item) => sum + (typeof item.amount === 'number' ? item.amount : 0),
    0,
  );
  return (
    <div className='overflow-hidden rounded-lg border'>
      <table className='w-full text-sm'>
        <thead className='bg-muted/50 text-xs text-muted-foreground'>
          <tr>
            <th className='px-3 py-1.5 text-left font-normal'>
              {text.t('center.fields.itemName')}
            </th>
            <th className='px-3 py-1.5 text-left font-normal'>
              {text.t('center.fields.category')}
            </th>
            <th className='px-3 py-1.5 text-right font-normal'>
              {text.t('center.fields.amount')}
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr
              key={`${str(item.name)}:${str(item.category)}:${str(item.amount)}`}
              className='border-t'
            >
              <td className='px-3 py-1.5'>{str(item.name) || '—'}</td>
              <td className='px-3 py-1.5'>
                {text.option('purchaseCategory', item.category)}
              </td>
              <td className='px-3 py-1.5 text-right tabular-nums'>
                {text.money(item.amount)}
              </td>
            </tr>
          ))}
          <tr className='border-t bg-muted/30 font-medium'>
            <td className='px-3 py-1.5' colSpan={2}>
              {text.t('center.common.total')}
            </td>
            <td className='px-3 py-1.5 text-right tabular-nums'>
              {text.money(total)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** One request as the person acting sees it: what it is, where it is, what they can do, and what happened. */
export function RequestDetail({
  lifecycle,
  id,
  actor,
  records,
  inbox,
  onOpen,
  onBack,
  backLabel,
  onChanged,
}: {
  readonly lifecycle: string;
  readonly id: string;
  readonly actor: string;
  readonly records: readonly CenterRecord[];
  readonly inbox: readonly CenterInboxItem[];
  readonly onOpen: (lifecycle: string, id: string) => void;
  readonly onBack?: () => void;
  readonly backLabel?: string;
  readonly onChanged: () => Promise<void>;
}): ReactElement {
  const text = useCenterText();
  const client = useApiClient();
  const current = useCenterLifecycle(lifecycle, id, { actAs: actor });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{
    tone: 'success' | 'danger';
    text: string;
  } | null>(null);
  const view = current.view;
  const forms = useLoader(
    view ? () => centerApi(client).forms(lifecycle, id, actor) : undefined,
    `center-forms:${lifecycle}:${id}:${actor}:${view?.version ?? 'none'}`,
  );
  // A staged approval keeps its stages, to-dos and handling log in rows of
  // their own; read them at the version the page shows.
  const trail = useLoader(
    view && lifecycle === 'approvalRequests'
      ? () => centerApi(client).trail(id, actor)
      : undefined,
    `center-trail:${id}:${actor}:${view?.version ?? 'none'}`,
  );
  const summary = records.find(
    (item) => item.lifecycle === lifecycle && item.id === id,
  );
  const translate: Translate = (key, fallback) =>
    text.t(`center.${key}`, {
      defaultValue: text.t(key, { defaultValue: fallback }),
    });
  const run = async (
    work: () => Promise<unknown>,
    done: string,
  ): Promise<boolean> => {
    setBusy(true);
    setNote(null);
    try {
      await work();
      await Promise.all([current.reload(), onChanged()]);
      setNote({ tone: 'success', text: done });
      return true;
    } catch (cause) {
      setNote({ tone: 'danger', text: errorMessage(cause, translate) });
      return false;
    } finally {
      setBusy(false);
    }
  };
  if (!view)
    return (
      <div className='rounded-xl border p-8 text-sm text-muted-foreground'>
        {current.error
          ? errorMessage(current.error, translate)
          : text.t('center.common.loading')}
      </div>
    );
  const record: LifecycleRecord = view.record;
  const kind =
    summary?.kind ?? (typeof record.kind === 'string' ? record.kind : null);
  const applicant = summary?.applicantId ?? str(record.applicantId);
  const title = displayTitle(text, {
    title: summary?.title ?? str(record.title),
    kind,
    applicantId: applicant,
  });
  const display =
    DISPLAY[
      (lifecycle === 'approvalRequests' || lifecycle === 'coordinations'
        ? kind
        : DISPLAY_BY_LIFECYCLE[lifecycle]) ?? ''
    ] ?? [];
  const context: ActionContext = {
    lifecycle,
    record,
    actor,
    defaults: forms.data ?? {},
    trail: trail.data ?? null,
    text,
  };
  const ready =
    forms.data !== undefined &&
    (lifecycle !== 'approvalRequests' || trail.data !== undefined);
  const actions = ready ? visibleActions(context, view.available) : [];
  const waitingForMe = inbox.some(
    (item) =>
      item.box === 'toDo' &&
      item.lifecycle === lifecycle &&
      item.recordId === id,
  );
  const parent = summary?.parent
    ? records.find(
        (item) =>
          item.lifecycle === summary.parent?.lifecycle &&
          item.id === summary.parent.id,
      )
    : undefined;
  const copies = records.filter(
    (item) =>
      item.lifecycle === 'acknowledgements' &&
      item.parent?.lifecycle === lifecycle &&
      item.parent.id === id &&
      lifecycle !== 'notices',
  );
  const content = (record.content ?? {}) as JsonObject;
  const items = Array.isArray(content.items)
    ? (content.items as JsonObject[])
    : null;
  return (
    <div className='space-y-4'>
      {onBack ? (
        <Button variant='ghost' size='sm' onClick={onBack} className='-ml-2'>
          <ArrowLeft />
          {backLabel ?? text.t('center.common.back')}
        </Button>
      ) : null}
      <header className='space-y-3 rounded-xl border bg-card p-4 sm:p-5'>
        <div className='flex flex-wrap items-start justify-between gap-3'>
          <div className='min-w-0 space-y-1'>
            <div className='text-xs text-muted-foreground'>
              {text.business(summary?.business ?? null)} · {text.type(kind)}
            </div>
            <h2 className='text-xl font-semibold tracking-tight'>{title}</h2>
          </div>
          <StatusBadge
            lifecycle={lifecycle}
            state={view.state}
            className='h-6 px-2.5 text-sm'
          />
        </div>
        <div className='flex flex-wrap items-center gap-x-6 gap-y-2 text-sm'>
          {applicant ? (
            <span className='flex items-center gap-2'>
              <span className='text-xs text-muted-foreground'>
                {text.t(
                  lifecycle === 'notices'
                    ? 'center.detail.publisher'
                    : lifecycle === 'acknowledgements'
                      ? 'center.detail.recipient'
                      : 'center.detail.applicant',
                )}
              </span>
              <Person id={applicant} withTitle />
            </span>
          ) : null}
          {summary?.createdAt ? (
            <span className='text-xs text-muted-foreground'>
              {text.t('center.detail.createdAt', {
                at: text.dateTime(summary.createdAt),
              })}
            </span>
          ) : null}
          <span className='text-xs text-muted-foreground'>
            {text.t('center.detail.number', {
              id: id.slice(0, 8).toUpperCase(),
            })}
          </span>
        </div>
        {summary?.handlers.length ? (
          <div className='flex flex-wrap items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300'>
            <BellRing className='size-4' />
            {summary.step ? `${text.stage(summary.step)} · ` : ''}
            {text.t('center.flow.waitingFor', {
              names: text.names(summary.handlers),
            })}
          </div>
        ) : null}
        {parent ? (
          <button
            type='button'
            onClick={() => onOpen(parent.lifecycle, parent.id)}
            className='inline-flex items-center gap-1 text-xs text-primary hover:underline'
          >
            {text.t('center.detail.partOf', {
              title: displayTitle(text, parent),
            })}
            <ChevronRight className='size-3' />
          </button>
        ) : null}
      </header>
      {note ? <Banner tone={note.tone}>{note.text}</Banner> : null}
      {actions.length || (actor === 'admin' && forms.data) ? (
        <Section
          title={text.t(
            waitingForMe ? 'center.detail.yourTurn' : 'center.detail.actions',
          )}
          className={cn(waitingForMe && 'border-primary/40 bg-primary/5')}
        >
          <ActionPanel
            context={context}
            available={view.available}
            version={view.version}
            busy={busy || current.busy}
            onFire={(transition, input) =>
              run(
                () => current.fire(transition, input),
                text.t('center.detail.done'),
              )
            }
            onSimulate={(transition, input, version) =>
              run(
                () =>
                  centerApi(client).simulate(
                    lifecycle,
                    id,
                    transition,
                    input,
                    version,
                    actor,
                  ),
                text.t('center.detail.done'),
              )
            }
          />
        </Section>
      ) : null}
      {display.length || items ? (
        <Section title={text.t('center.detail.content')}>
          <div className='space-y-4'>
            <DisplayGrid specs={display} record={record as JsonObject} />
            {items ? <ItemsTable items={items} /> : null}
          </div>
        </Section>
      ) : null}
      <Section title={text.t('center.detail.flow')}>
        <RequestFlow
          lifecycle={lifecycle}
          record={record}
          state={view.state}
          records={records}
          trail={trail.data ?? null}
          onOpen={onOpen}
        />
      </Section>
      {copies.length ? (
        <Section title={text.t('center.detail.copies')}>
          <div className='flex flex-wrap gap-2'>
            {copies.map((copy) => (
              <button
                key={copy.id}
                type='button'
                onClick={() => onOpen(copy.lifecycle, copy.id)}
                className='flex items-center gap-2 rounded-lg border px-2.5 py-1.5 hover:bg-muted'
              >
                <Person id={copy.applicantId} />
                <StatusBadge lifecycle='acknowledgements' state={copy.status} />
              </button>
            ))}
          </div>
        </Section>
      ) : null}
      <Section title={text.t('center.detail.timeline')}>
        <Timeline
          lifecycle={lifecycle}
          entries={view.history.transitions}
          logs={trail.data?.logs ?? []}
          stages={[
            ...(trail.data?.stages ?? []),
            ...(trail.data?.history ?? []),
          ]}
        />
      </Section>
    </div>
  );
}
