import { useState, type ReactElement, type ReactNode } from 'react';
import { useApiClient } from '@nocobase/app-client';
import { Inbox, Plus, Sparkles } from 'lucide-react';

import {
  business as businessOf,
  BUSINESSES,
  type BusinessKey,
} from '../../shared/catalog.js';
import type {
  InboxBox,
  Overview,
  RecordDetail,
  RecordSummary,
} from '../../shared/types.js';
import { PageContainer } from '../components/page-container.js';
import { Button } from '../components/ui/button.js';
import { Modal } from '../components/ui/dialog.js';
import { errorMessage, exampleApi } from '../lib/api.js';
import { useText } from '../lib/text.js';
import { cn } from '../lib/utils.js';
import { Banner, Empty, RequestRow, Tabs } from './common.js';
import { RequestDetail } from './detail.js';
import { displayTitle, inboxLabel } from './describe.js';
import { isAdminOf, useOpened, useOverview } from './state.js';
import { usePersona } from './persona-state.js';
import { PersonaBar } from './persona.js';
import { RequestForm } from './request-form.js';

type OpenedState = ReturnType<typeof useOpened>;

/** A request opened from a list, over the page; links to a child or a parent open inside it. */
export function DetailModal({
  opened,
  persona,
  overview,
  onChanged,
  footer,
}: {
  readonly opened: OpenedState;
  readonly persona: string;
  readonly overview: Overview | undefined;
  readonly onChanged: () => Promise<void>;
  readonly footer?: (
    detail: RecordDetail,
    reload: () => Promise<void>,
  ) => ReactNode;
}): ReactElement {
  const text = useText();
  const { current } = opened;
  const records = overview?.records ?? [];
  const previous = opened.previous
    ? records.find(
        (record) =>
          record.lifecycle === opened.previous?.lifecycle &&
          record.id === opened.previous.id,
      )
    : undefined;
  return (
    <Modal
      open={current !== undefined}
      onOpenChange={(open) => {
        if (!open) opened.clear();
      }}
      title={text.t('detail.dialogTitle')}
      hideTitle
      closeLabel={text.t('common.close')}
      className='sm:max-w-4xl'
    >
      {current ? (
        <RequestDetail
          key={`${current.lifecycle}:${current.id}:${persona}`}
          lifecycle={current.lifecycle}
          id={current.id}
          actor={persona}
          isAdmin={isAdminOf(overview, persona)}
          records={records}
          onOpen={opened.open}
          onBack={opened.previous ? opened.back : undefined}
          backLabel={
            previous
              ? text.t('common.backTo', { title: displayTitle(text, previous) })
              : undefined
          }
          onChanged={onChanged}
          footer={footer}
        />
      ) : null}
    </Modal>
  );
}

function Guide({ business }: { readonly business: BusinessKey }): ReactElement {
  const text = useText();
  return (
    <div className='space-y-5 rounded-xl border bg-card p-5'>
      <div>
        <h3 className='text-base font-semibold'>{text.t('guide.title')}</h3>
        <p className='mt-1 text-sm text-muted-foreground'>
          {text.t(`business.${business}.description`)}
        </p>
      </div>
      <ol className='space-y-3'>
        {['step1', 'step2', 'step3'].map((step, index) => (
          <li key={step} className='flex gap-3 text-sm'>
            <span className='inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary'>
              {index + 1}
            </span>
            <span className='pt-0.5'>
              {text.t(`business.${business}.${step}`)}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** One business application: start a request, follow yours, handle the ones waiting for you. */
export function BusinessPage({
  business,
}: {
  readonly business: BusinessKey;
}): ReactElement {
  const text = useText();
  const client = useApiClient();
  const [persona, setPersona] = usePersona();
  const overview = useOverview(persona);
  const opened = useOpened();
  const [creating, setCreating] = useState(false);
  const [chosenTab, setChosenTab] = useState<
    { persona: string; tab: 'toDo' | 'mine' | 'all' } | undefined
  >();
  const [note, setNote] = useState('');
  const definition = businessOf(business);
  const records = overview.data?.records ?? [];
  const inbox = overview.data?.inbox ?? [];
  const own = records.filter((record) => record.business === business);
  const top = own.filter((record) => record.parent === null);
  const byKey = (lifecycle: string, id: string): RecordSummary | undefined =>
    own.find((record) => record.lifecycle === lifecycle && record.id === id);
  const todo = inbox.filter(
    (item) =>
      item.box === 'toDo' && byKey(item.lifecycle, item.recordId) !== undefined,
  );
  const mine = top.filter((record) => record.applicantId === persona);
  const counts: Record<string, number> = {};
  for (const record of own)
    for (const person of record.handlers)
      counts[person] = (counts[person] ?? 0) + 1;
  // A tab chosen by one persona is not kept for the next.
  const tab =
    chosenTab?.persona === persona
      ? chosenTab.tab
      : todo.length
        ? 'toDo'
        : 'mine';
  const setTab = (value: 'toDo' | 'mine' | 'all'): void =>
    setChosenTab({ persona, tab: value });
  const rows: {
    record: RecordSummary;
    task?: string;
    since?: string | null;
    key: string;
  }[] =
    tab === 'toDo'
      ? todo.flatMap((item) => {
          const record = byKey(item.lifecycle, item.recordId);
          return record
            ? [
                {
                  record,
                  task: inboxLabel(text, item, record),
                  since: item.since,
                  key: `${item.source}:${item.taskId ?? item.action ?? ''}:${record.id}`,
                },
              ]
            : [];
        })
      : (tab === 'mine' ? mine : top).map((record) => ({
          record,
          key: `${record.lifecycle}:${record.id}`,
        }));
  if (!definition) return <PageContainer>{business}</PageContainer>;
  return (
    <PageContainer className='space-y-5'>
      <header className='flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between'>
        <div className='min-w-0'>
          <h1 className='font-heading text-3xl font-semibold tracking-[-0.035em]'>
            {text.t(`business.${business}.title`)}
          </h1>
          <p className='mt-2 max-w-2xl text-sm leading-6 text-muted-foreground'>
            {text.t(`business.${business}.description`)}
          </p>
        </div>
        <Button
          size='lg'
          onClick={() => {
            setCreating(true);
            opened.clear();
          }}
        >
          <Plus />
          {text.t(`business.${business}.new`)}
        </Button>
      </header>
      <PersonaBar
        persona={persona}
        onChange={setPersona}
        cast={definition.cast}
        counts={counts}
      />
      {overview.error || note ? (
        <Banner tone='danger'>{note || overview.error}</Banner>
      ) : null}
      <div className='grid items-start gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]'>
        <div className='space-y-3'>
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { value: 'toDo', label: text.t('list.toDo'), count: todo.length },
              { value: 'mine', label: text.t('list.mine'), count: mine.length },
              { value: 'all', label: text.t('list.all') },
            ]}
          />
          {!overview.data ? (
            <Empty>{text.t('common.loading')}</Empty>
          ) : rows.length ? (
            <div className='space-y-2'>
              {rows.map(({ record, task, since, key }) => (
                <RequestRow
                  key={key}
                  record={record}
                  task={task}
                  since={since}
                  selected={
                    opened.current?.lifecycle === record.lifecycle &&
                    opened.current.id === record.id
                  }
                  onSelect={() => opened.select(record.lifecycle, record.id)}
                />
              ))}
            </div>
          ) : (
            <Empty>
              <p>{text.t(`list.empty.${tab}`)}</p>
              {tab !== 'toDo' &&
              !top.length &&
              (persona === 'zhang' || persona === 'admin') ? (
                <Button
                  className='mt-3'
                  variant='outline'
                  onClick={() =>
                    void exampleApi(client)
                      .samples(persona)
                      .then(overview.reload, (cause: unknown) =>
                        setNote(errorMessage(cause, text.translate)),
                      )
                  }
                >
                  <Sparkles />
                  {text.t('list.samples')}
                </Button>
              ) : null}
            </Empty>
          )}
        </div>
        <div className='min-w-0'>
          <Guide business={business} />
        </div>
      </div>
      <Modal
        open={creating}
        onOpenChange={setCreating}
        title={text.t(`business.${business}.new`)}
        closeLabel={text.t('common.close')}
      >
        <RequestForm
          key={persona}
          demos={definition.demos}
          actor={persona}
          onCancel={() => setCreating(false)}
          onCreated={(created) => {
            setCreating(false);
            void overview.reload();
            opened.select(created.lifecycle, created.id);
            setTab('mine');
          }}
        />
      </Modal>
      <DetailModal
        opened={opened}
        persona={persona}
        overview={overview.data}
        onChanged={overview.reload}
      />
    </PageContainer>
  );
}

/** Every task across the businesses, for whoever is acting. */
export function InboxPage(): ReactElement {
  const text = useText();
  const [persona, setPersona] = usePersona();
  const overview = useOverview(persona);
  const opened = useOpened();
  const [box, setBox] = useState<InboxBox>('toDo');
  const [filter, setFilter] = useState<BusinessKey | 'all'>('all');
  const records = overview.data?.records ?? [];
  const inbox = overview.data?.inbox ?? [];
  const byKey = (lifecycle: string, id: string): RecordSummary | undefined =>
    records.find(
      (record) => record.lifecycle === lifecycle && record.id === id,
    );
  const entries = inbox
    .filter((item) => item.box === box)
    .map((item) => ({ item, record: byKey(item.lifecycle, item.recordId) }))
    .filter(
      (
        entry,
      ): entry is { item: (typeof inbox)[number]; record: RecordSummary } =>
        entry.record !== undefined,
    );
  const items = entries.filter(
    (entry) => filter === 'all' || entry.record.business === filter,
  );
  const count = (value: InboxBox): number =>
    inbox.filter((item) => item.box === value).length;
  const businesses = BUSINESSES.filter((business) =>
    entries.some((entry) => entry.record.business === business.key),
  );
  return (
    <PageContainer className='space-y-5'>
      <header>
        <h1 className='flex items-center gap-2 font-heading text-3xl font-semibold tracking-[-0.035em]'>
          <Inbox className='size-7' />
          {text.t('inbox.title')}
        </h1>
        <p className='mt-2 max-w-2xl text-sm leading-6 text-muted-foreground'>
          {text.t('inbox.description')}
        </p>
      </header>
      <PersonaBar persona={persona} onChange={setPersona} />
      {overview.error ? <Banner tone='danger'>{overview.error}</Banner> : null}
      <div className='space-y-3'>
        <Tabs
          value={box}
          onChange={(value) => {
            setBox(value);
            setFilter('all');
          }}
          tabs={(['toDo', 'done', 'mine', 'copiedToMe'] as const).map(
            (value) => ({
              value,
              label: text.t(`inbox.boxes.${value}`),
              count: count(value),
            }),
          )}
        />
        {businesses.length > 1 ? (
          <div className='flex flex-wrap gap-1.5'>
            {[{ key: 'all' as const }, ...businesses].map((business) => (
              <button
                key={business.key}
                type='button'
                onClick={() => setFilter(business.key)}
                className={cn(
                  'rounded-full border px-2.5 py-0.5 text-xs hover:bg-muted',
                  filter === business.key &&
                    'border-primary bg-primary/10 text-primary',
                )}
              >
                {business.key === 'all'
                  ? text.t('list.all')
                  : text.business(business.key)}
              </button>
            ))}
          </div>
        ) : null}
        {!overview.data ? (
          <Empty>{text.t('common.loading')}</Empty>
        ) : items.length ? (
          <div className='space-y-2'>
            {items.map(({ item, record }) => (
              <RequestRow
                key={`${item.box}:${item.source}:${item.taskId ?? ''}:${item.action ?? ''}:${record.lifecycle}:${record.id}`}
                record={record}
                showBusiness
                since={item.since}
                task={
                  box === 'toDo' ? inboxLabel(text, item, record) : undefined
                }
                selected={
                  opened.current?.lifecycle === record.lifecycle &&
                  opened.current.id === record.id
                }
                onSelect={() => opened.select(record.lifecycle, record.id)}
              />
            ))}
          </div>
        ) : (
          <Empty>{text.t(`inbox.empty.${box}`)}</Empty>
        )}
      </div>
      <DetailModal
        opened={opened}
        persona={persona}
        overview={overview.data}
        onChanged={overview.reload}
      />
    </PageContainer>
  );
}

export const LeavePage = (): ReactElement => <BusinessPage business='leave' />;
export const TravelPage = (): ReactElement => (
  <BusinessPage business='travel' />
);
export const PurchasePage = (): ReactElement => (
  <BusinessPage business='purchase' />
);
export const ContractPage = (): ReactElement => (
  <BusinessPage business='contract' />
);
export const ReimbursementPage = (): ReactElement => (
  <BusinessPage business='reimbursement' />
);
export const PaymentPage = (): ReactElement => (
  <BusinessPage business='payment' />
);
export const GrantPage = (): ReactElement => <BusinessPage business='grant' />;
export const SupplierPage = (): ReactElement => (
  <BusinessPage business='supplier' />
);
export const OnboardingPage = (): ReactElement => (
  <BusinessPage business='onboarding' />
);
export const LaunchPage = (): ReactElement => (
  <BusinessPage business='launch' />
);
export const NoticePage = (): ReactElement => (
  <BusinessPage business='notice' />
);
