import { useState, type ReactElement, type ReactNode } from 'react';
import { useApiClient } from '@nocobase/app-client';
import type { JsonObject, JsonValue } from '@nocobase/lifecycle';
import { ArrowLeft, BellRing, ChevronRight } from 'lucide-react';

import type { RecordDetail, RecordSummary } from '../../shared/types.js';
import { text as str } from '../../shared/text.js';
import { Button } from '../components/ui/button.js';
import { errorMessage, exampleApi } from '../lib/api.js';
import { useText, type Text } from '../lib/text.js';
import { useLoader } from '../lib/use-loader.js';
import { cn } from '../lib/utils.js';
import { actionsOf, simulatedOf, type Action } from './action-list.js';
import { ActionPanel } from './actions.js';
import { Banner, Pill, Section, StatusBadge } from './common.js';
import { displayTitle } from './describe.js';
import { getPath } from './field-values.js';
import type { FieldSpec } from './fields.js';
import { RequestFlow } from './flow.js';
import { displayFields } from './forms.js';
import { Person } from './persona.js';
import { Timeline } from './timeline.js';

/** One field's value as the detail shows it, or null when there is none. */
function formatValue(text: Text, spec: FieldSpec, value: JsonValue): ReactNode {
  if (value === null || value === '' || (Array.isArray(value) && !value.length))
    return null;
  switch (spec.kind) {
    case 'money':
      return text.money(value);
    case 'cents':
      return text.cents(value);
    case 'date':
      return text.date(value);
    case 'datetime':
      return text.dateTime(value);
    case 'select':
      return text.option(spec.group, value);
    case 'checkbox':
      return value === true ? text.t(spec.hint ?? 'common.yes') : null;
    case 'person':
      return typeof value === 'string' ? <Person id={value} /> : null;
    case 'people':
      return Array.isArray(value) ? text.names(value.map(String)) : null;
    case 'number':
      return spec.name.endsWith('days')
        ? text.t('common.days', { count: Number(value) })
        : str(value);
    default:
      return typeof value === 'string' || typeof value === 'number'
        ? String(value)
        : JSON.stringify(value);
  }
}

function DisplayGrid({
  specs,
  values,
}: {
  readonly specs: readonly FieldSpec[];
  readonly values: JsonObject;
}): ReactElement | null {
  const text = useText();
  const rows = specs
    .map((spec) => ({
      spec,
      value: formatValue(text, spec, getPath(values, spec.name)),
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
            {text.t(`fields.${spec.name.split('.').at(-1) ?? ''}`)}
          </dt>
          <dd className='mt-1 text-sm break-words whitespace-pre-wrap'>
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function objects(value: unknown): JsonObject[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is JsonObject =>
          typeof item === 'object' && item !== null && !Array.isArray(item),
      )
    : [];
}

/** Lines or items with their amounts and, for a claim, each line's decision. */
function LinesTable({
  rows,
  amount,
  decisions,
}: {
  readonly rows: readonly JsonObject[];
  readonly amount: 'amount' | 'amountCents';
  readonly decisions: JsonObject | null;
}): ReactElement {
  const text = useText();
  const money = (value: unknown): string =>
    amount === 'amount' ? text.money(value) : text.cents(value);
  return (
    <div className='overflow-hidden rounded-lg border'>
      <table className='w-full text-sm'>
        <tbody>
          {rows.map((row) => {
            const decision = decisions?.[str(row.id)];
            const outcome =
              typeof decision === 'object' &&
              decision !== null &&
              !Array.isArray(decision)
                ? decision
                : null;
            return (
              <tr
                key={
                  str(row.id) ||
                  `${str(row.name)}:${str(row.category)}:${str(row[amount])}`
                }
                className='border-t first:border-0'
              >
                <td className='px-3 py-1.5'>
                  {str(row.description) || str(row.name) || '—'}
                </td>
                <td className='px-3 py-1.5 text-muted-foreground'>
                  {text.option(
                    amount === 'amount' ? 'purchaseCategory' : 'lineCategory',
                    row.category,
                  )}
                </td>
                <td className='px-3 py-1.5 text-right tabular-nums'>
                  {money(row[amount])}
                </td>
                {decisions ? (
                  <td className='px-3 py-1.5 text-right'>
                    {outcome ? (
                      <Pill
                        tone={
                          outcome.outcome === 'approve'
                            ? 'success'
                            : outcome.outcome === 'reject'
                              ? 'danger'
                              : 'warning'
                        }
                      >
                        {text.lookup(
                          [`answers.${str(outcome.outcome)}`],
                          str(outcome.outcome),
                        )}
                        {outcome.outcome === 'approve'
                          ? ` ${text.cents(outcome.approvedCents)}`
                          : ''}
                      </Pill>
                    ) : null}
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** What a few businesses keep beside the record. */
function Extras({
  detail,
  onOpen,
}: {
  readonly detail: RecordDetail;
  readonly onOpen: (lifecycle: string, id: string) => void;
}): ReactElement | null {
  const text = useText();
  const { extras } = detail;
  const items: ReactNode[] = [];
  const balance = extras.balance;
  if (
    typeof balance === 'object' &&
    balance !== null &&
    !Array.isArray(balance)
  )
    items.push(
      <div key='balance' className='text-sm'>
        {text.t('extras.balance', {
          used: text.cents(balance.usedCents),
          uses: str(balance.uses),
        })}
      </div>,
    );
  for (const grant of objects(extras.grants))
    items.push(
      <button
        key={`grant:${str(grant.id)}`}
        type='button'
        onClick={() => onOpen('scenarioGrants', str(grant.id))}
        className='inline-flex items-center gap-1 text-sm text-primary hover:underline'
      >
        {text.t('extras.grant', { id: str(grant.id) })}
        <StatusBadge lifecycle='scenarioGrants' state={str(grant.status)} />
        <ChevronRight className='size-3' />
      </button>,
    );
  for (const followUp of objects(extras.followUps))
    items.push(
      <button
        key={`follow:${str(followUp.id)}`}
        type='button'
        onClick={() => onOpen('scenarioReimbursements', str(followUp.id))}
        className='inline-flex items-center gap-1 text-sm text-primary hover:underline'
      >
        {text.t('extras.followUp', { id: str(followUp.id) })}
        <ChevronRight className='size-3' />
      </button>,
    );
  for (const [name, rows] of [
    ['payments', objects(extras.payments)],
    ['deposits', objects(extras.deposits)],
    ['usages', objects(extras.usages)],
    ['reservations', objects(extras.reservations)],
  ] as const)
    if (rows.length)
      items.push(
        <div key={name} className='space-y-1 text-xs'>
          <div className='font-medium'>{text.t(`extras.${name}`)}</div>
          {rows.map((row) => (
            <div key={str(row.id)} className='text-muted-foreground'>
              {[
                str(
                  row.paymentRef ?? row.depositRef ?? row.usageKey ?? row.kind,
                ),
                row.use ? text.t(`extras.use.${str(row.use)}`) : '',
                typeof row.amountCents === 'number'
                  ? text.cents(row.amountCents)
                  : '',
              ]
                .filter(Boolean)
                .join(' · ')}
            </div>
          ))}
        </div>,
      );
  const notes = Array.isArray(extras.notes) ? extras.notes.map(str) : [];
  if (notes.length)
    items.push(
      <ul
        key='notes'
        className='list-inside list-disc text-xs text-muted-foreground'
      >
        {notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>,
    );
  return items.length ? <div className='space-y-3'>{items}</div> : null;
}

/** One request as the person acting sees it: what it is, where it is, what they can do, and what happened. */
export function RequestDetail({
  lifecycle,
  id,
  actor,
  isAdmin,
  records,
  onOpen,
  onBack,
  backLabel,
  onChanged,
  footer,
}: {
  readonly lifecycle: string;
  readonly id: string;
  readonly actor: string;
  readonly isAdmin: boolean;
  readonly records: readonly RecordSummary[];
  readonly onOpen: (lifecycle: string, id: string) => void;
  readonly onBack?: () => void;
  readonly backLabel?: string;
  readonly onChanged: () => Promise<void>;
  /** More about the record, such as the lab's under-the-hood panel. */
  readonly footer?: (
    detail: RecordDetail,
    reload: () => Promise<void>,
  ) => ReactNode;
}): ReactElement {
  const text = useText();
  const client = useApiClient();
  const api = exampleApi(client);
  const loaded = useLoader(
    () => api.detail(lifecycle, id, actor),
    `detail:${lifecycle}:${id}:${actor}`,
  );
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{
    tone: 'success' | 'danger';
    text: string;
  } | null>(null);
  const detail = loaded.data;
  if (!detail)
    return (
      <div className='rounded-xl border p-8 text-sm text-muted-foreground'>
        {loaded.error || text.t('common.loading')}
      </div>
    );
  const { summary } = detail;
  const run = async (action: Action, form: JsonObject): Promise<boolean> => {
    setBusy(true);
    setNote(null);
    try {
      await action.run(form);
      await Promise.all([loaded.reload(), onChanged()]);
      setNote({ tone: 'success', text: text.t('detail.done') });
      return true;
    } catch (cause) {
      setNote({ tone: 'danger', text: errorMessage(cause, text.translate) });
      return false;
    } finally {
      setBusy(false);
    }
  };
  const actions = [
    ...actionsOf(text, detail, actor, api),
    ...simulatedOf(text, detail, actor, isAdmin, api),
  ];
  const parent = summary.parent
    ? records.find(
        (each) =>
          each.lifecycle === summary.parent?.lifecycle &&
          each.id === summary.parent.id,
      )
    : undefined;
  const yourTurn = detail.actions.length > 0;
  const facts = summary.facts;
  const items = objects(
    (facts.content as JsonObject | undefined)?.items ?? null,
  );
  const lines = objects(facts.lines);
  const decisions =
    typeof facts.decisions === 'object' &&
    facts.decisions !== null &&
    !Array.isArray(facts.decisions)
      ? facts.decisions
      : null;
  return (
    <div className='space-y-4'>
      {onBack ? (
        <Button variant='ghost' size='sm' onClick={onBack} className='-ml-2'>
          <ArrowLeft />
          {backLabel ?? text.t('common.back')}
        </Button>
      ) : null}
      <header className='space-y-3 rounded-xl border bg-card p-4 sm:p-5'>
        <div className='flex flex-wrap items-start justify-between gap-3'>
          <div className='min-w-0 space-y-1'>
            <div className='text-xs text-muted-foreground'>
              {text.business(summary.business)} · {text.demo(summary.demo)}
            </div>
            <h2 className='text-xl font-semibold tracking-tight'>
              {displayTitle(text, summary)}
            </h2>
          </div>
          <StatusBadge
            lifecycle={lifecycle}
            state={detail.state}
            className='h-6 px-2.5 text-sm'
          />
        </div>
        <div className='flex flex-wrap items-center gap-x-6 gap-y-2 text-sm'>
          {summary.applicantId ? (
            <span className='flex items-center gap-2'>
              <span className='text-xs text-muted-foreground'>
                {text.t('detail.applicant')}
              </span>
              <Person id={summary.applicantId} withTitle />
            </span>
          ) : null}
          {summary.createdAt ? (
            <span className='text-xs text-muted-foreground'>
              {text.t('detail.createdAt', {
                at: text.dateTime(summary.createdAt),
              })}
            </span>
          ) : null}
          <span className='text-xs text-muted-foreground'>
            {text.t('detail.number', { id: summary.id })}
          </span>
        </div>
        {summary.handlers.length ? (
          <div className='flex flex-wrap items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300'>
            <BellRing className='size-4' />
            {summary.stage ? `${text.stage(summary.stage)} · ` : ''}
            {text.t('flow.waitingFor', { names: text.names(summary.handlers) })}
          </div>
        ) : null}
        {parent ? (
          <button
            type='button'
            onClick={() => onOpen(parent.lifecycle, parent.id)}
            className='inline-flex items-center gap-1 text-xs text-primary hover:underline'
          >
            {text.t('detail.partOf', { title: displayTitle(text, parent) })}
            <ChevronRight className='size-3' />
          </button>
        ) : null}
      </header>
      {note ? <Banner tone={note.tone}>{note.text}</Banner> : null}
      {actions.length ? (
        <Section
          title={text.t(yourTurn ? 'detail.yourTurn' : 'detail.actions')}
          className={cn(yourTurn && 'border-primary/40 bg-primary/5')}
        >
          <ActionPanel actions={actions} busy={busy} onRun={run} />
        </Section>
      ) : null}
      <Section title={text.t('detail.content')}>
        <div className='space-y-4'>
          <DisplayGrid specs={displayFields(summary.demo)} values={facts} />
          {items.length ? (
            <LinesTable rows={items} amount='amount' decisions={null} />
          ) : null}
          {lines.length ? (
            <LinesTable
              rows={lines}
              amount='amountCents'
              decisions={decisions}
            />
          ) : null}
          <Extras detail={detail} onOpen={onOpen} />
        </div>
      </Section>
      <Section title={text.t('detail.flow')}>
        <RequestFlow
          runs={detail.runs}
          branches={detail.branches}
          acknowledgements={detail.acknowledgements}
          onOpen={onOpen}
        />
      </Section>
      <Section title={text.t('detail.timeline')}>
        <Timeline detail={detail} />
      </Section>
      {footer ? footer(detail, loaded.reload) : null}
    </div>
  );
}
