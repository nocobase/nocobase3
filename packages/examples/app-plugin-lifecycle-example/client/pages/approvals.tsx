import { text } from '../../shared/text.js';
import { useState, type ReactElement } from 'react';
import { useApiClient } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  createLifecycleHook,
  type JsonObject,
  type UseRecordLifecycle,
} from '@nocobase/lifecycle/react';

import {
  APPROVAL_DEMOS,
  type LabOverview,
  type LabRecord,
} from '../../shared/approval-lab.js';
import {
  assigneeTasks,
  candidatesOf,
  votesOf,
  type ApprovalTrail,
} from '../../shared/approval-trail.js';
import { Choice } from '../components/choice.js';
import { LabForm } from '../components/lab-form.js';
import { PageContainer } from '../components/page-container.js';
import { PageHeader } from '../components/page-header.js';
import { Banner, LifecyclePanel, StateBadge } from '../components/record-ui.js';
import { Button } from '../components/ui/button.js';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../components/ui/card.js';
import { errorMessage } from '../lib/api.js';
import { NAMESPACE } from '../lib/format.js';
import { useLoader } from '../lib/use-loader.js';

const BASE = 'lifecycle-example/approval-lab';
const useLabLifecycle: UseRecordLifecycle = createLifecycleHook({
  useTransport: useApiClient,
  basePath: `${BASE}/lifecycles`,
});

export default function ApprovalsPage(): ReactElement {
  const { t } = useTranslation(NAMESPACE);
  const client = useApiClient();
  const [actor, setActor] = useState('zhang');
  const [selected, setSelected] = useState<LabRecord | undefined>();
  const [creating, setCreating] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('toDo');
  const overview = useLoader(
    () =>
      client.request<LabOverview>({
        path: `${BASE}/overview`,
        query: { actAs: actor },
      }),
    `approval-overview:${actor}`,
  );
  const people = overview.data?.people.map((person) => person.id) ?? [
    'zhang',
    'li',
    'admin',
  ];
  const current = useLabLifecycle(
    selected?.lifecycle ?? 'approvalRequests',
    selected?.id,
    { actAs: actor },
  );
  // A staged approval's stages and to-dos are rows of their own.
  const trail = useLoader(
    selected?.lifecycle === 'approvalRequests' && current.view
      ? () =>
          client.request<ApprovalTrail>({
            path: `${BASE}/approvals/${encodeURIComponent(selected.id)}`,
            query: { actAs: actor },
          })
      : undefined,
    `approval-trail:${selected?.id ?? ''}:${actor}:${current.view?.version ?? 0}`,
  );
  const reload = async (): Promise<void> => {
    await Promise.all([overview.reload(), current.reload(), trail.reload()]);
  };
  const perform = async (action: () => Promise<unknown>): Promise<void> => {
    setBusy(true);
    setNote('');
    try {
      await action();
      await reload();
      setNote(t('lab.saved'));
    } catch (error) {
      setNote(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  const open = (record: LabRecord): void => {
    setSelected(record);
    setCreating(false);
    setNote('');
  };
  const items =
    overview.data?.todos.filter((item) => item.box === filter) ?? [];
  return (
    <PageContainer>
      <PageHeader
        title={t('lab.title')}
        description={t('lab.description')}
        actions={
          <div className='flex flex-wrap gap-2'>
            <Choice
              label={t('lab.identity')}
              value={actor}
              options={people.map((id) => ({ value: id, label: id }))}
              onChange={(id) => {
                setActor(id);
                setNote('');
              }}
            />
            <Button
              onClick={() => {
                setCreating(true);
                setSelected(undefined);
              }}
            >
              {t('lab.new')}
            </Button>
            {actor === 'zhang' || actor === 'admin' ? (
              <Button
                variant='outline'
                disabled={busy}
                onClick={() =>
                  void perform(() =>
                    client.request({
                      method: 'POST',
                      path: `${BASE}/samples`,
                      query: { actAs: actor },
                    }),
                  )
                }
              >
                {t('lab.loadSamples')}
              </Button>
            ) : null}
            <Button
              variant='outline'
              disabled={busy}
              onClick={() =>
                void perform(() =>
                  client.request({
                    method: 'POST',
                    path: `${BASE}/sweep`,
                    query: { actAs: actor },
                  }),
                )
              }
            >
              {t('lab.sweep')}
            </Button>
          </div>
        }
      />
      <p className='text-sm text-muted-foreground'>{t('lab.demoNotice')}</p>
      {note || overview.error || current.error ? (
        <Banner tone='info'>
          {note || overview.error || errorMessage(current.error)}
        </Banner>
      ) : null}
      {!overview.data ? <p>{t('common.loading')}</p> : null}
      <div className='grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]'>
        <div className='space-y-5'>
          <Card>
            <CardHeader>
              <CardTitle>{t('lab.todo')}</CardTitle>
            </CardHeader>
            <CardContent className='space-y-3'>
              <Choice
                label={t('lab.box')}
                value={filter}
                options={['toDo', 'done', 'mine', 'copiedToMe'].map(
                  (value) => ({ value, label: t(`lab.boxes.${value}`) }),
                )}
                onChange={setFilter}
              />
              {items.length ? (
                items.map((item) => (
                  <Button
                    key={`${item.lifecycle}:${item.recordId}:${item.action ?? ''}`}
                    variant='outline'
                    className='h-auto w-full justify-start whitespace-normal text-left'
                    onClick={() =>
                      open({
                        lifecycle: item.lifecycle,
                        id: item.recordId,
                        title: item.title,
                        status: item.detail,
                        applicantId: '',
                      })
                    }
                  >
                    <span>
                      {item.title}
                      <span className='block text-xs text-muted-foreground'>
                        {t(`states.${item.detail}`, {
                          defaultValue: item.detail,
                        })}
                      </span>
                    </span>
                  </Button>
                ))
              ) : (
                <p className='text-sm text-muted-foreground'>
                  {t('lab.empty')}
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t('lab.records')}</CardTitle>
            </CardHeader>
            <CardContent className='max-h-96 space-y-2 overflow-y-auto'>
              {overview.data?.records.length ? (
                overview.data.records.map((item) => (
                  <Button
                    key={`${item.lifecycle}:${item.id}`}
                    variant={
                      selected?.id === item.id &&
                      selected.lifecycle === item.lifecycle
                        ? 'secondary'
                        : 'ghost'
                    }
                    className='h-auto w-full justify-between gap-2 whitespace-normal text-left'
                    onClick={() => open(item)}
                  >
                    <span>
                      {item.title}
                      <span className='block text-xs text-muted-foreground'>
                        {item.applicantId}
                      </span>
                    </span>
                    <StateBadge state={item.status} />
                  </Button>
                ))
              ) : (
                <p>{t('lab.empty')}</p>
              )}
            </CardContent>
          </Card>
        </div>
        <div className='space-y-5'>
          {creating ? (
            <CreateForm
              key={actor}
              actor={actor}
              people={people}
              busy={busy}
              onCreate={(key, values) =>
                perform(async () => {
                  const created = await client.request<LabRecord>({
                    method: 'POST',
                    path: `${BASE}/create/${key}`,
                    query: { actAs: actor },
                    json: values,
                  });
                  open(created);
                })
              }
            />
          ) : selected && current.view ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>
                    {text(current.view.record.title ?? selected.title)}{' '}
                    <StateBadge state={current.view.state} />
                  </CardTitle>
                </CardHeader>
                <CardContent className='space-y-4'>
                  <RecordProgress
                    record={current.view.record}
                    trail={
                      selected.lifecycle === 'approvalRequests'
                        ? (trail.data ?? null)
                        : null
                    }
                    onOpen={open}
                  />
                  <ActionForm
                    key={`${selected.lifecycle}:${selected.id}:${actor}:${current.view.version}`}
                    actor={actor}
                    selected={selected}
                    people={people}
                    current={current}
                    busy={busy}
                    perform={perform}
                  />
                </CardContent>
              </Card>
              {current.description ? (
                <LifecyclePanel
                  detail={{ ...current.view, ...current.description }}
                  actions={current}
                  onChange={reload}
                  allowOperate={actor === 'admin'}
                />
              ) : null}
            </>
          ) : (
            <Card>
              <CardContent className='py-8 text-muted-foreground'>
                {selected ? t('common.loading') : t('lab.selectHint')}
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle>{t('lab.messages')}</CardTitle>
            </CardHeader>
            <CardContent className='space-y-2'>
              {overview.data?.messages.length ? (
                overview.data.messages.map((message) => (
                  <p key={text(message.id)} className='border-b pb-2 text-sm'>
                    {text(message.subject)}
                    <span className='block text-xs text-muted-foreground'>
                      {text(message.createdAt)}
                    </span>
                  </p>
                ))
              ) : (
                <p className='text-sm text-muted-foreground'>
                  {t('lab.empty')}
                </p>
              )}
            </CardContent>
          </Card>
          <details className='rounded-lg border p-4'>
            <summary className='cursor-pointer font-medium'>
              {t('lab.operations')}
            </summary>
            <pre className='mt-3 max-h-72 overflow-auto text-xs'>
              {JSON.stringify(overview.data?.operations ?? [], null, 2)}
            </pre>
          </details>
          {actor === 'admin' && overview.data ? (
            <SettingsForm
              key={JSON.stringify(overview.data.settings)}
              settings={overview.data.settings}
              busy={busy}
              onSave={(settings) =>
                perform(() =>
                  client.request({
                    method: 'PUT',
                    path: `${BASE}/settings`,
                    query: { actAs: actor },
                    json: settings,
                  }),
                )
              }
            />
          ) : null}
          <details className='rounded-lg border p-4'>
            <summary className='cursor-pointer font-medium'>
              {t('lab.people')}
            </summary>
            <ul className='mt-3 space-y-1 text-sm'>
              {overview.data?.people.map((person) => (
                <li key={person.id}>
                  {person.id} → {person.manager ?? '—'} ·{' '}
                  {person.roles.join(', ')}
                </li>
              ))}
            </ul>
          </details>
        </div>
      </div>
    </PageContainer>
  );
}

function CreateForm({
  actor,
  people,
  busy,
  onCreate,
}: {
  readonly actor: string;
  readonly people: readonly string[];
  readonly busy: boolean;
  readonly onCreate: (key: string, values: JsonObject) => Promise<void>;
}): ReactElement {
  const { t } = useTranslation(NAMESPACE);
  const [key, setKey] = useState(APPROVAL_DEMOS[0].key);
  const demo =
    APPROVAL_DEMOS.find((item) => item.key === key) ?? APPROVAL_DEMOS[0];
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('lab.new')}</CardTitle>
      </CardHeader>
      <CardContent className='space-y-4'>
        <Choice
          label={t('lab.scenario')}
          value={key}
          options={APPROVAL_DEMOS.map((item) => ({
            value: item.key,
            label: `${item.scenarios} · ${t(`lab.demos.${item.key}`, { defaultValue: item.title })}`,
          }))}
          onChange={setKey}
        />
        <DraftForm
          key={key}
          initial={{
            title: t(`lab.demos.${demo.key}`, { defaultValue: demo.title }),
            applicantId: actor,
            ...demo.values,
          }}
          people={people}
          busy={busy}
          onSave={(values) => onCreate(key, values)}
        />
      </CardContent>
    </Card>
  );
}

function DraftForm({
  initial,
  people,
  busy,
  onSave,
}: {
  readonly initial: JsonObject;
  readonly people: readonly string[];
  readonly busy: boolean;
  readonly onSave: (values: JsonObject) => Promise<void>;
}): ReactElement {
  const { t } = useTranslation(NAMESPACE);
  const [values, setValues] = useState(initial);
  return (
    <form
      className='space-y-4'
      onSubmit={(event) => {
        event.preventDefault();
        void onSave(values);
      }}
    >
      <LabForm values={values} onChange={setValues} people={people} />
      <Button type='submit' disabled={busy}>
        {t('lab.createDraft')}
      </Button>
    </form>
  );
}

function RecordProgress({
  record,
  trail,
  onOpen,
}: {
  readonly record: Readonly<Record<string, unknown>>;
  readonly trail: ApprovalTrail | null;
  readonly onOpen: (record: LabRecord) => void;
}): ReactElement {
  const { t } = useTranslation(NAMESPACE);
  const stages = trail?.stages ?? [];
  const branches = Array.isArray(record.branches)
    ? (record.branches as Record<string, unknown>[])
    : [];
  return (
    <div className='space-y-3'>
      {record.approverId ? (
        <p className='text-sm'>
          {t('lab.approver')}: {text(record.approverId)}
        </p>
      ) : null}
      {stages.map((stage, index) => (
        <div key={stage.id} className='rounded-lg border p-3'>
          <div className='flex justify-between gap-2'>
            <span>
              {index + 1}. {stage.title}
            </span>
            <StateBadge state={stage.status} />
          </div>
          <p className='text-sm text-muted-foreground'>
            {(stage.rule.kind === 'claim'
              ? candidatesOf(stage)
              : assigneeTasks(stage).map((task) => task.assigneeId)
            ).join(', ')}
          </p>
          <p className='text-xs text-muted-foreground'>
            {stage.rule.kind} · {stage.notes.join(' ')}
          </p>
          {votesOf(stage).map((vote) => (
            <p key={vote.id} className='mt-1 text-sm'>
              {vote.actorId}: {vote.decision} {vote.comment}
            </p>
          ))}
        </div>
      ))}
      {branches.map((branch) => (
        <Button
          key={text(branch.key)}
          variant='outline'
          className='w-full justify-between'
          onClick={() =>
            onOpen({
              lifecycle: text(branch.lifecycle),
              id: text(branch.id),
              title: text(branch.title),
              status: text(branch.state),
              applicantId: text(record.applicantId),
            })
          }
        >
          {text(branch.title)} <StateBadge state={text(branch.state)} />
        </Button>
      ))}
      {record.grantId ? (
        <Button
          variant='outline'
          onClick={() =>
            onOpen({
              lifecycle: 'budgetGrants',
              id: text(record.grantId),
              title: t('lab.grant'),
              status: 'active',
              applicantId: text(record.applicantId),
            })
          }
        >
          {t('lab.openGrant')}
        </Button>
      ) : null}
      {record.parentId && record.parentLifecycle ? (
        <Button
          variant='outline'
          onClick={() =>
            onOpen({
              lifecycle: text(record.parentLifecycle),
              id: text(record.parentId),
              title: t('lab.parent'),
              status: '',
              applicantId: text(record.applicantId),
            })
          }
        >
          {t('lab.openParent')}
        </Button>
      ) : null}
      <details>
        <summary className='cursor-pointer text-sm'>{t('lab.content')}</summary>
        <pre className='mt-2 max-h-80 overflow-auto rounded-lg bg-muted p-3 text-xs'>
          {JSON.stringify(
            trail ? { ...record, approval: trail } : record,
            null,
            2,
          )}
        </pre>
      </details>
    </div>
  );
}

function ActionForm({
  actor,
  selected,
  people,
  current,
  busy,
  perform,
}: {
  readonly actor: string;
  readonly selected: LabRecord;
  readonly people: readonly string[];
  readonly current: ReturnType<typeof useLabLifecycle>;
  readonly busy: boolean;
  readonly perform: (action: () => Promise<unknown>) => Promise<void>;
}): ReactElement {
  const client = useApiClient();
  const { t } = useTranslation(NAMESPACE);
  const [transition, setTransition] = useState('');
  const [input, setInput] = useState<JsonObject>({});
  const forms = useLoader(
    () =>
      client.request<Record<string, JsonObject>>({
        path: `${BASE}/forms/${selected.lifecycle}/${encodeURIComponent(selected.id)}`,
        query: { actAs: actor },
      }),
    `forms:${selected.lifecycle}:${selected.id}:${actor}:${current.view?.version ?? 0}`,
  );
  const available = current.view?.available ?? [];
  const events: Readonly<Record<string, readonly string[]>> = {
    orders: ['markReady', 'paymentSucceeded', 'refundSucceeded'],
    supplierOnboardings: ['depositReceived'],
    approvalRequests: ['escalate', 'unclaimStale'],
  };
  const actions = available.filter(
    (item) =>
      !item.blockers.some(
        (blocker) =>
          blocker.code === 'systemOnly' ||
          blocker.message === 'Only the system does this.',
      ) ||
      (actor === 'admin' && events[selected.lifecycle]?.includes(item.name)),
  );
  const chosen = actions.find((item) => item.name === transition);
  const system = chosen?.blockers.some(
    (blocker) =>
      blocker.code === 'systemOnly' ||
      blocker.message === 'Only the system does this.',
  );
  // Some guards inspect the form input. The server evaluates them again on submit.
  const roleCodes = new Set([
    'notAssignee',
    'applicantOnly',
    'adminOnly',
    'approverOnly',
    'financeOnly',
    'treasurerOnly',
    'authorityOnly',
    'notRecipient',
    'notYours',
    'noAddSigner',
    'mayNotRevise',
    'alreadyDecided',
  ]);
  const refused =
    !system && chosen?.blockers.some((blocker) => roleCodes.has(blocker.code));
  return (
    <form
      className='space-y-3'
      onSubmit={(event) => {
        event.preventDefault();
        void perform(async () => {
          if (system)
            await client.request({
              method: 'POST',
              path: `${BASE}/events/${selected.lifecycle}/${encodeURIComponent(selected.id)}`,
              query: { actAs: actor },
              json: { transition, input, version: current.view?.version },
            });
          else await current.fire(transition, input);
        });
      }}
    >
      {forms.error ? <Banner tone='info'>{forms.error}</Banner> : null}
      {actions.length ? (
        <Choice
          label={t('lab.action')}
          value={transition}
          options={[
            { value: '', label: t('lab.chooseAction') },
            ...actions.map((item) => ({
              value: item.name,
              label: `${t(`lab.actions.${item.name}`, { defaultValue: item.title ?? item.name })}${item.allowed ? '' : ' · …'}`,
            })),
          ]}
          onChange={(value) => {
            setTransition(value);
            setInput(forms.data?.[value] ?? {});
          }}
          disabled={!forms.data}
        />
      ) : (
        <p className='text-sm text-muted-foreground'>{t('lab.noActions')}</p>
      )}
      {chosen ? (
        <>
          <LabForm
            key={transition}
            values={input}
            onChange={(values) => {
              if (
                transition === 'decideLine' &&
                values.lineId !== input.lineId
              ) {
                const lines = current.view?.record.lines;
                const line = Array.isArray(lines)
                  ? (
                      lines as {
                        id: string;
                        contentHash: string;
                        amountCents: number;
                      }[]
                    ).find((item) => item.id === values.lineId)
                  : undefined;
                if (line)
                  values = {
                    ...values,
                    contentHash: line.contentHash,
                    approvedCents: line.amountCents,
                  };
              }
              setInput(values);
            }}
            people={people}
            signer={transition === 'addSigner'}
          />
          {chosen.blockers.length && !system ? (
            <p className='text-xs text-muted-foreground'>
              {chosen.blockers.map((item) => item.message).join(' ')}{' '}
              {t('lab.guardHint')}
            </p>
          ) : null}
          <Button type='submit' disabled={busy || refused === true}>
            {system ? t('lab.simulate') : t('lab.execute')}
          </Button>
        </>
      ) : null}
    </form>
  );
}

function SettingsForm({
  settings,
  busy,
  onSave,
}: {
  readonly settings: JsonObject;
  readonly busy: boolean;
  readonly onSave: (values: JsonObject) => Promise<void>;
}): ReactElement {
  const { t } = useTranslation(NAMESPACE);
  const [values, setValues] = useState<JsonObject>({
    highRisk: false,
    failOperation: '',
    declinePayment: false,
    managers: {},
    roles: {},
    inactive: [],
    delegations: [],
    versions: { leaveVersioned: 'v1' },
    ...settings,
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('lab.settings')}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className='mb-3 text-sm text-muted-foreground'>
          {t('lab.settingsHint')}
        </p>
        <form
          className='space-y-4'
          onSubmit={(event) => {
            event.preventDefault();
            void onSave(values);
          }}
        >
          <LabForm values={values} onChange={setValues} people={[]} />
          <Button disabled={busy} type='submit'>
            {t('lab.saveSettings')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
