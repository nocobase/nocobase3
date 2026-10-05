import { useEffect, useState, type ReactElement } from 'react';
import { useApiClient } from '@nocobase/app-client';
import { Inbox, Plus, Sparkles } from 'lucide-react';

import {
  centerBusiness,
  CENTER_BUSINESSES,
  type CenterBox,
  type CenterInboxItem,
  type CenterBusinessKey,
  type CenterPreview,
  type CenterRecord,
} from '../../shared/approval-center.js';
import { PageContainer } from '../components/page-container.js';
import { Modal } from '../components/ui/dialog.js';
import { Banner } from '../components/record-ui.js';
import { Button } from '../components/ui/button.js';
import { errorMessage } from '../lib/api.js';
import { cn } from '../lib/utils.js';
import { centerApi, useCenter } from './api.js';
import { displayTitle, taskLabel } from './describe.js';
import { RequestDetail } from './detail.js';
import { useCenterText } from './format.js';
import { Empty, RequestRow, Tabs } from './list.js';
import { PersonaBar } from './persona.js';
import { usePersona } from './persona-state.js';
import { FlowPreview, RequestForm } from './request-form.js';
import { requestType } from './types.js';

interface Opened {
  readonly lifecycle: string;
  readonly id: string;
}

/** A detail pane that can follow links to children and come back. */
function useOpened(): {
  readonly current: Opened | undefined;
  readonly previous: Opened | undefined;
  readonly open: (lifecycle: string, id: string) => void;
  readonly select: (lifecycle: string, id: string) => void;
  readonly back: () => void;
  readonly clear: () => void;
} {
  const [stack, setStack] = useState<Opened[]>([]);
  return {
    current: stack.at(-1),
    previous: stack.at(-2),
    open: (lifecycle, id) => setStack((items) => [...items, { lifecycle, id }]),
    select: (lifecycle, id) => setStack([{ lifecycle, id }]),
    back: () => setStack((items) => items.slice(0, -1)),
    clear: () => setStack([]),
  };
}

type OpenedState = ReturnType<typeof useOpened>;

/**
 * A request opened from a list, over the page. Links to a child or a parent
 * open inside the same dialog, with a way back.
 */
function DetailModal({
  opened,
  persona,
  records,
  inbox,
  onChanged,
}: {
  readonly opened: OpenedState;
  readonly persona: string;
  readonly records: readonly CenterRecord[];
  readonly inbox: readonly CenterInboxItem[];
  readonly onChanged: () => Promise<void>;
}): ReactElement {
  const text = useCenterText();
  const { current } = opened;
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
      title={text.t('center.detail.dialogTitle')}
      hideTitle
      closeLabel={text.t('center.common.close')}
      className='sm:max-w-4xl'
    >
      {current ? (
        <RequestDetail
          key={`${current.lifecycle}:${current.id}:${persona}`}
          lifecycle={current.lifecycle}
          id={current.id}
          actor={persona}
          records={records}
          inbox={inbox}
          onOpen={opened.open}
          onBack={opened.previous ? opened.back : undefined}
          backLabel={
            previous
              ? text.t('center.common.backTo', {
                  title: displayTitle(text, previous),
                })
              : undefined
          }
          onChanged={onChanged}
        />
      ) : null}
    </Modal>
  );
}

function Guide({
  business,
  actor,
}: {
  readonly business: CenterBusinessKey;
  readonly actor: string;
}): ReactElement {
  const text = useCenterText();
  const client = useApiClient();
  const typeKey = centerBusiness(business)?.types[0] ?? '';
  const spec = requestType(typeKey);
  const [preview, setPreview] = useState<CenterPreview | undefined>();
  useEffect(() => {
    if (!spec?.previewContent) return;
    const form = spec.initial('zhang');
    centerApi(client)
      .preview(typeKey, spec.previewContent(form), 'zhang', actor)
      .then(setPreview, () => setPreview(undefined));
    // The guide previews the default request once per type and persona.
    // eslint-disable-next-line react-hooks/exhaustive-deps, @eslint-react/exhaustive-deps
  }, [typeKey, actor]);
  return (
    <div className='space-y-5 rounded-xl border bg-card p-5'>
      <div>
        <h3 className='text-base font-semibold'>
          {text.t('center.guide.title')}
        </h3>
        <p className='mt-1 text-sm text-muted-foreground'>
          {text.t(`center.business.${business}.description`)}
        </p>
      </div>
      <ol className='space-y-3'>
        {['step1', 'step2', 'step3'].map((step, index) => (
          <li key={step} className='flex gap-3 text-sm'>
            <span className='inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary'>
              {index + 1}
            </span>
            <span className='pt-0.5'>
              {text.t(`center.business.${business}.${step}`)}
            </span>
          </li>
        ))}
      </ol>
      <FlowPreview typeKey={typeKey} preview={preview} applicantId='zhang' />
    </div>
  );
}

/**
 * One business application of the center: start a request, follow the ones
 * you started, and handle the ones waiting for you.
 */
export function BusinessPage({
  business,
}: {
  readonly business: CenterBusinessKey;
}): ReactElement {
  const text = useCenterText();
  const client = useApiClient();
  const [persona, setPersona] = usePersona();
  const center = useCenter(persona);
  const opened = useOpened();
  const [creating, setCreating] = useState(false);
  const [chosenTab, setChosenTab] = useState<
    { persona: string; tab: 'toDo' | 'mine' | 'all' } | undefined
  >();
  const [note, setNote] = useState('');
  const definition = centerBusiness(business);
  const records = center.data?.records ?? [];
  const inbox = center.data?.inbox ?? [];
  const own = records.filter((record) => record.business === business);
  const top = own.filter(
    (record) =>
      record.parent === null && record.lifecycle !== 'acknowledgements',
  );
  const todo = inbox.filter(
    (item) =>
      item.box === 'toDo' &&
      own.some(
        (record) =>
          record.lifecycle === item.lifecycle && record.id === item.recordId,
      ),
  );
  const mine = top.filter((record) => record.applicantId === persona);
  const counts: Record<string, number> = {};
  for (const record of own)
    for (const person of record.handlers)
      counts[person] = (counts[person] ?? 0) + 1;
  // A tab chosen by one persona is not kept for the next: each first sees what concerns them.
  const tab =
    chosenTab?.persona === persona
      ? chosenTab.tab
      : todo.length
        ? 'toDo'
        : 'mine';
  const setTab = (value: 'toDo' | 'mine' | 'all'): void =>
    setChosenTab({ persona, tab: value });
  const byKey = (lifecycle: string, id: string): CenterRecord | undefined =>
    records.find(
      (record) => record.lifecycle === lifecycle && record.id === id,
    );
  const rows: { record: CenterRecord; task?: string; since?: string }[] =
    tab === 'toDo'
      ? todo.flatMap((item) => {
          const record = byKey(item.lifecycle, item.recordId);
          return record
            ? [
                {
                  record,
                  task: taskLabel(text, item, record),
                  since: item.since,
                },
              ]
            : [];
        })
      : (tab === 'mine' ? mine : top).map((record) => ({ record }));
  const select = (lifecycle: string, id: string): void =>
    opened.select(lifecycle, id);
  if (!definition) return <PageContainer>{business}</PageContainer>;
  return (
    <PageContainer className='space-y-5'>
      <header className='flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between'>
        <div className='min-w-0'>
          <h1 className='font-heading text-3xl font-semibold tracking-[-0.035em]'>
            {text.t(`center.business.${business}.title`)}
          </h1>
          <p className='mt-2 max-w-2xl text-sm leading-6 text-muted-foreground'>
            {text.t(`center.business.${business}.description`)}
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
          {text.t(`center.business.${business}.new`)}
        </Button>
      </header>
      <PersonaBar
        persona={persona}
        onChange={setPersona}
        cast={definition.cast}
        counts={counts}
      />
      {center.error || note ? (
        <Banner tone='danger'>{note || center.error}</Banner>
      ) : null}
      <div className='grid items-start gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]'>
        <div className='space-y-3'>
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              {
                value: 'toDo',
                label: text.t('center.list.toDo'),
                count: todo.length,
              },
              {
                value: 'mine',
                label: text.t('center.list.mine'),
                count: mine.length,
              },
              { value: 'all', label: text.t('center.list.all') },
            ]}
          />
          {!center.data ? (
            <Empty>{text.t('center.common.loading')}</Empty>
          ) : rows.length ? (
            <div className='space-y-2'>
              {rows.map(({ record, task, since }) => (
                <RequestRow
                  key={`${record.lifecycle}:${record.id}:${task ?? ''}`}
                  record={record}
                  task={task}
                  since={since}
                  selected={
                    opened.current?.lifecycle === record.lifecycle &&
                    opened.current.id === record.id
                  }
                  onSelect={() => select(record.lifecycle, record.id)}
                />
              ))}
            </div>
          ) : (
            <Empty>
              <p>{text.t(`center.list.empty.${tab}`)}</p>
              {tab !== 'toDo' &&
              !top.length &&
              (persona === 'zhang' || persona === 'admin') ? (
                <Button
                  className='mt-3'
                  variant='outline'
                  onClick={() =>
                    void centerApi(client)
                      .loadSamples(persona)
                      .then(center.reload, (cause: unknown) =>
                        setNote(errorMessage(cause)),
                      )
                  }
                >
                  <Sparkles />
                  {text.t('center.list.samples')}
                </Button>
              ) : null}
            </Empty>
          )}
        </div>
        <div className='min-w-0'>
          <Guide business={business} actor={persona} />
        </div>
      </div>
      <Modal
        open={creating}
        onOpenChange={setCreating}
        title={text.t(`center.business.${business}.new`)}
        closeLabel={text.t('center.common.close')}
      >
        <RequestForm
          key={persona}
          types={definition.types}
          actor={persona}
          onCancel={() => setCreating(false)}
          onCreated={(created) => {
            setCreating(false);
            void center.reload();
            opened.select(created.lifecycle, created.id);
            setTab('mine');
          }}
        />
      </Modal>
      <DetailModal
        opened={opened}
        persona={persona}
        records={records}
        inbox={inbox}
        onChanged={center.reload}
      />
    </PageContainer>
  );
}

/** Every task across the businesses, for whoever is acting. */
export function InboxPage(): ReactElement {
  const text = useCenterText();
  const [persona, setPersona] = usePersona();
  const center = useCenter(persona);
  const opened = useOpened();
  const [box, setBox] = useState<CenterBox>('toDo');
  const [filter, setFilter] = useState<CenterBusinessKey | 'all'>('all');
  const records = center.data?.records ?? [];
  const inbox = center.data?.inbox ?? [];
  const byKey = (lifecycle: string, id: string): CenterRecord | undefined =>
    records.find(
      (record) => record.lifecycle === lifecycle && record.id === id,
    );
  const items = inbox
    .filter((item) => item.box === box)
    .map((item) => ({ item, record: byKey(item.lifecycle, item.recordId) }))
    .filter(
      (
        entry,
      ): entry is { item: (typeof inbox)[number]; record: CenterRecord } =>
        entry.record !== undefined &&
        (filter === 'all' || entry.record.business === filter),
    );
  const count = (value: CenterBox): number =>
    inbox.filter((item) => item.box === value).length;
  const businesses = CENTER_BUSINESSES.filter((business) =>
    inbox.some(
      (item) =>
        item.box === box &&
        byKey(item.lifecycle, item.recordId)?.business === business.key,
    ),
  );
  return (
    <PageContainer className='space-y-5'>
      <header className='flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between'>
        <div>
          <h1 className='flex items-center gap-2 font-heading text-3xl font-semibold tracking-[-0.035em]'>
            <Inbox className='size-7' />
            {text.t('center.inbox.title')}
          </h1>
          <p className='mt-2 max-w-2xl text-sm leading-6 text-muted-foreground'>
            {text.t('center.inbox.description')}
          </p>
        </div>
      </header>
      <PersonaBar persona={persona} onChange={setPersona} />
      {center.error ? <Banner tone='danger'>{center.error}</Banner> : null}
      <div className='space-y-3'>
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
                label: text.t(`center.inbox.boxes.${value}`),
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
                    ? text.t('center.list.all')
                    : text.business(business.key)}
                </button>
              ))}
            </div>
          ) : null}
          {!center.data ? (
            <Empty>{text.t('center.common.loading')}</Empty>
          ) : items.length ? (
            <div className='space-y-2'>
              {items.map(({ item, record }) => (
                <RequestRow
                  key={`${item.box}:${item.lifecycle}:${item.recordId}:${item.action ?? ''}`}
                  record={record}
                  showBusiness
                  since={item.since}
                  task={
                    item.box === 'toDo'
                      ? taskLabel(text, item, record)
                      : undefined
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
            <Empty>{text.t(`center.inbox.empty.${box}`)}</Empty>
          )}
        </div>
      </div>
      <DetailModal
        opened={opened}
        persona={persona}
        records={records}
        inbox={inbox}
        onChanged={center.reload}
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
