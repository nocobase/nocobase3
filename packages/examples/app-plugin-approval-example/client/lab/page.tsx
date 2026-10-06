import { useState, type ReactElement } from 'react';
import { useApiClient } from '@nocobase/app-client';
import { Clock, FlaskConical, Sparkles } from 'lucide-react';

import { DEMOS, type DemoKey } from '../../shared/catalog.js';
import { text as str } from '../../shared/text.js';
import type { Overview, RecordDetail } from '../../shared/types.js';
import { Choice } from '../components/choice.js';
import { PageContainer } from '../components/page-container.js';
import { Textarea } from '../components/textarea.js';
import { Button } from '../components/ui/button.js';
import { Modal } from '../components/ui/dialog.js';
import { errorMessage, exampleApi } from '../lib/api.js';
import { useText } from '../lib/text.js';
import { Banner, Empty, Section, StatusBadge } from '../center/common.js';
import { DetailModal } from '../center/pages.js';
import { isAdminOf, useOpened, useOverview } from '../center/state.js';
import { PersonaBar } from '../center/persona.js';
import { usePersona } from '../center/persona-state.js';
import { RequestForm } from '../center/request-form.js';

const PROVIDERS = [
  '',
  'pay',
  'checkCompany',
  'createSupplierAccount',
  'runOnboardingStep',
  'rollBackPreparation',
];

const JSON_SETTINGS = ['managers', 'roles', 'inactive', 'delegations'] as const;

/** The administrator's controls over the organization and the simulations. */
function Settings({
  overview,
  actor,
  onSaved,
}: {
  readonly overview: Overview;
  readonly actor: string;
  readonly onSaved: () => Promise<void>;
}): ReactElement {
  const text = useText();
  const client = useApiClient();
  const current = overview.settings;
  const [form, setForm] = useState(() => ({
    ruleVersion: String(current.ruleVersion ?? 1),
    failOperation: current.failOperation ?? '',
    declinePayment: current.declinePayment === true,
    highRisk: current.highRisk === true,
    ...Object.fromEntries(
      JSON_SETTINGS.map((name) => [
        name,
        current[name] === undefined
          ? ''
          : JSON.stringify(current[name], null, 2),
      ]),
    ),
  }));
  const [note, setNote] = useState<{
    tone: 'success' | 'danger';
    text: string;
  } | null>(null);
  const save = async (): Promise<void> => {
    try {
      const settings: Record<string, unknown> = {
        ruleVersion: Number(form.ruleVersion),
        failOperation: form.failOperation,
        declinePayment: form.declinePayment,
        highRisk: form.highRisk,
      };
      for (const name of JSON_SETTINGS) {
        const value = (form as Record<string, unknown>)[name];
        if (typeof value === 'string' && value.trim())
          settings[name] = JSON.parse(value) as unknown;
      }
      await exampleApi(client).saveSettings(settings, actor);
      await onSaved();
      setNote({ tone: 'success', text: text.t('lab.saved') });
    } catch (cause) {
      setNote({ tone: 'danger', text: errorMessage(cause, text.translate) });
    }
  };
  return (
    <Section title={text.t('lab.settings')}>
      <div className='space-y-4'>
        <div className='grid gap-4 sm:grid-cols-2'>
          <label className='space-y-1.5 text-sm'>
            <span className='block font-medium'>
              {text.t('lab.ruleVersion')}
            </span>
            <Choice
              label={text.t('lab.ruleVersion')}
              value={form.ruleVersion}
              options={['1', '2'].map((value) => ({
                value,
                label: `v${value}`,
              }))}
              onChange={(value) => setForm({ ...form, ruleVersion: value })}
            />
          </label>
          <label className='space-y-1.5 text-sm'>
            <span className='block font-medium'>
              {text.t('lab.failOperation')}
            </span>
            <Choice
              label={text.t('lab.failOperation')}
              value={form.failOperation}
              options={PROVIDERS.map((value) => ({
                value,
                label: value
                  ? text.t(`lab.providers.${value}`)
                  : text.t('lab.noOutage'),
              }))}
              onChange={(value) => setForm({ ...form, failOperation: value })}
            />
          </label>
          {(['declinePayment', 'highRisk'] as const).map((name) => (
            <label key={name} className='flex items-center gap-2 text-sm'>
              <input
                type='checkbox'
                className='size-4 accent-primary'
                checked={form[name]}
                onChange={(event) =>
                  setForm({ ...form, [name]: event.target.checked })
                }
              />
              {text.t(`lab.${name}`)}
            </label>
          ))}
        </div>
        <div className='grid gap-4 sm:grid-cols-2'>
          {JSON_SETTINGS.map((name) => (
            <label key={name} className='space-y-1.5 text-sm'>
              <span className='block font-medium'>{text.t(`lab.${name}`)}</span>
              <Textarea
                aria-label={text.t(`lab.${name}`)}
                className='font-mono text-xs'
                value={str((form as Record<string, unknown>)[name])}
                placeholder={text.t(`lab.${name}Placeholder`)}
                onChange={(event) =>
                  setForm({ ...form, [name]: event.target.value })
                }
              />
            </label>
          ))}
        </div>
        {note ? <Banner tone={note.tone}>{note.text}</Banner> : null}
        <Button onClick={() => void save()}>{text.t('lab.save')}</Button>
      </div>
    </Section>
  );
}

/** States, transitions, the diagram and the effect runs of one record. */
function UnderTheHood({
  detail,
  actor,
  isAdmin,
  reload,
}: {
  readonly detail: RecordDetail;
  readonly actor: string;
  readonly isAdmin: boolean;
  readonly reload: () => Promise<void>;
}): ReactElement {
  const text = useText();
  const client = useApiClient();
  const [note, setNote] = useState('');
  const { lifecycle, id } = detail.summary;
  const operate = async (
    runId: string,
    action: 'retry' | 'cancel',
  ): Promise<void> => {
    try {
      await exampleApi(client).operate(lifecycle, id, runId, action, actor);
      await reload();
      setNote('');
    } catch (cause) {
      setNote(errorMessage(cause, text.translate));
    }
  };
  return (
    <Section title={text.t('lab.underTheHood')}>
      <div className='space-y-4 text-xs'>
        <div>
          <div className='mb-1 font-medium'>
            {text.t('lab.lifecycle', { name: lifecycle })}
          </div>
          <div className='flex flex-wrap gap-1'>
            {detail.description.states.map((state) => (
              <span
                key={state}
                className={
                  state === detail.state
                    ? 'rounded bg-primary px-1.5 text-primary-foreground'
                    : 'rounded bg-muted px-1.5'
                }
              >
                {state}
              </span>
            ))}
          </div>
        </div>
        <div>
          <div className='mb-1 font-medium'>{text.t('lab.available')}</div>
          <ul className='space-y-0.5'>
            {detail.available.map((transition) => (
              <li key={transition.name}>
                {transition.allowed ? '✓' : '✗'} {transition.name}
                {transition.blockers.length
                  ? ` — ${transition.blockers.map((blocker) => blocker.message).join(' ')}`
                  : ''}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className='mb-1 font-medium'>{text.t('lab.history')}</div>
          <ul className='space-y-0.5 font-mono'>
            {detail.history.map((entry) => (
              <li key={entry.id}>
                v{entry.version} {entry.transition}: {entry.from ?? '∅'} →{' '}
                {entry.to} · {entry.actorId}
              </li>
            ))}
            {detail.runs.flatMap((view) =>
              view.history.map((entry) => (
                <li key={`run:${entry.id}`} className='text-muted-foreground'>
                  approval:{view.run.source}#{view.run.id} v{entry.version}{' '}
                  {entry.transition}: {entry.from ?? '∅'} → {entry.to}
                </li>
              )),
            )}
          </ul>
        </div>
        <div>
          <div className='mb-1 font-medium'>{text.t('lab.effects')}</div>
          {detail.effects.length ? (
            <ul className='space-y-1'>
              {detail.effects.map((run) => (
                <li key={run.id} className='flex flex-wrap items-center gap-2'>
                  <span className='font-mono'>
                    {run.effect} · {run.status} · {run.attempts}/
                    {run.maxAttempts}
                  </span>
                  {run.error ? (
                    <span className='text-destructive'>{run.error}</span>
                  ) : null}
                  {isAdmin && ['failed', 'dead'].includes(run.status) ? (
                    <Button
                      size='sm'
                      variant='outline'
                      onClick={() => void operate(run.id, 'retry')}
                    >
                      {text.t('lab.retry')}
                    </Button>
                  ) : null}
                  {isAdmin &&
                  ['queued', 'failed', 'dead'].includes(run.status) ? (
                    <Button
                      size='sm'
                      variant='ghost'
                      onClick={() => void operate(run.id, 'cancel')}
                    >
                      {text.t('lab.cancelRun')}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className='text-muted-foreground'>{text.t('lab.noEffects')}</p>
          )}
        </div>
        <details>
          <summary className='cursor-pointer font-medium'>
            {text.t('lab.diagram')}
          </summary>
          <pre className='mt-2 overflow-x-auto rounded bg-muted p-2'>
            {detail.diagram}
          </pre>
        </details>
        {note ? <Banner tone='danger'>{note}</Banner> : null}
      </div>
    </Section>
  );
}

/**
 * The lab: every scenario with its technical detail. It runs on the same
 * records as the approval center, and adds samples, the clock, the
 * administrator's controls, and a look under the hood of each record.
 */
export default function ApprovalLabPage(): ReactElement {
  const text = useText();
  const client = useApiClient();
  const [persona, setPersona] = usePersona();
  const overview = useOverview(persona);
  const opened = useOpened();
  const [creating, setCreating] = useState<DemoKey | null>(null);
  const [note, setNote] = useState<{
    tone: 'success' | 'danger';
    text: string;
  } | null>(null);
  const isAdmin = isAdminOf(overview.data, persona);
  const records = overview.data?.records ?? [];
  const run = async (
    work: () => Promise<number>,
    done: string,
  ): Promise<void> => {
    try {
      const count = await work();
      await overview.reload();
      setNote({ tone: 'success', text: text.t(done, { count }) });
    } catch (cause) {
      setNote({ tone: 'danger', text: errorMessage(cause, text.translate) });
    }
  };
  return (
    <PageContainer className='space-y-5'>
      <header className='flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between'>
        <div>
          <h1 className='flex items-center gap-2 font-heading text-3xl font-semibold tracking-[-0.035em]'>
            <FlaskConical className='size-7' />
            {text.t('lab.title')}
          </h1>
          <p className='mt-2 max-w-3xl text-sm leading-6 text-muted-foreground'>
            {text.t('lab.description')}
          </p>
        </div>
        <div className='flex flex-wrap gap-2'>
          <Button
            variant='outline'
            onClick={() =>
              void run(
                () => exampleApi(client).samples(persona),
                'lab.samplesLoaded',
              )
            }
          >
            <Sparkles />
            {text.t('list.samples')}
          </Button>
          <Button
            variant='outline'
            onClick={() =>
              void run(() => exampleApi(client).sweep(persona), 'lab.swept')
            }
          >
            <Clock />
            {text.t('lab.sweep')}
          </Button>
        </div>
      </header>
      <PersonaBar persona={persona} onChange={setPersona} />
      {overview.error ? <Banner tone='danger'>{overview.error}</Banner> : null}
      {note ? <Banner tone={note.tone}>{note.text}</Banner> : null}
      <Section title={text.t('lab.scenarios')}>
        <div className='overflow-x-auto'>
          <table className='w-full text-sm'>
            <thead className='text-left text-xs text-muted-foreground'>
              <tr>
                <th className='py-1.5 pr-3 font-normal'>
                  {text.t('lab.scenario')}
                </th>
                <th className='py-1.5 pr-3 font-normal'>
                  {text.t('lab.demo')}
                </th>
                <th className='py-1.5 pr-3 font-normal'>
                  {text.t('lab.records')}
                </th>
                <th className='py-1.5 font-normal' />
              </tr>
            </thead>
            <tbody>
              {DEMOS.map((item) => {
                const mine = records.filter(
                  (record) =>
                    record.demo === item.key && record.parent === null,
                );
                return (
                  <tr key={item.key} className='border-t align-top'>
                    <td className='py-2 pr-3 whitespace-nowrap text-muted-foreground'>
                      {item.scenarios}
                    </td>
                    <td className='py-2 pr-3'>
                      <div className='font-medium'>{text.demo(item.key)}</div>
                      <div className='text-xs text-muted-foreground'>
                        {text.t(`demos.${item.key}.hint`)}
                      </div>
                    </td>
                    <td className='py-2 pr-3'>
                      <div className='flex flex-wrap gap-1.5'>
                        {mine.slice(0, 6).map((record) => (
                          <button
                            key={record.id}
                            type='button'
                            onClick={() =>
                              opened.select(record.lifecycle, record.id)
                            }
                            className='inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs hover:bg-muted'
                          >
                            #{record.id}
                            <StatusBadge
                              lifecycle={record.lifecycle}
                              state={record.status}
                            />
                          </button>
                        ))}
                      </div>
                    </td>
                    <td className='py-2 text-right'>
                      <Button
                        size='sm'
                        variant='outline'
                        onClick={() => setCreating(item.key)}
                      >
                        {text.t('lab.new')}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>
      <div className='grid items-start gap-5 xl:grid-cols-2'>
        <Section title={text.t('lab.messages')}>
          {overview.data?.messages.length ? (
            <ul className='space-y-1 text-xs'>
              {overview.data.messages.map((message) => (
                <li key={message.id}>
                  <span className='text-muted-foreground'>
                    {text.dateTime(message.createdAt)}
                  </span>{' '}
                  {message.subject}
                </li>
              ))}
            </ul>
          ) : (
            <Empty>{text.t('lab.noMessages')}</Empty>
          )}
        </Section>
        <Section title={text.t('lab.operations')}>
          {overview.data?.operations.length ? (
            <ul className='space-y-1 font-mono text-xs'>
              {overview.data.operations.map((operation) => (
                <li key={operation.id}>
                  {operation.kind} · {operation.key} →{' '}
                  {JSON.stringify(operation.result)}
                </li>
              ))}
            </ul>
          ) : (
            <Empty>{text.t('lab.noOperations')}</Empty>
          )}
        </Section>
      </div>
      {isAdmin && overview.data ? (
        <Settings
          key={JSON.stringify(overview.data.settings)}
          overview={overview.data}
          actor={persona}
          onSaved={overview.reload}
        />
      ) : null}
      <Modal
        open={creating !== null}
        onOpenChange={(open) => {
          if (!open) setCreating(null);
        }}
        title={creating ? text.demo(creating) : ''}
        closeLabel={text.t('common.close')}
      >
        {creating ? (
          <RequestForm
            key={`${creating}:${persona}`}
            demos={[creating]}
            actor={persona}
            onCancel={() => setCreating(null)}
            onCreated={(created) => {
              setCreating(null);
              void overview.reload();
              opened.select(created.lifecycle, created.id);
            }}
          />
        ) : null}
      </Modal>
      <DetailModal
        opened={opened}
        persona={persona}
        overview={overview.data}
        onChanged={overview.reload}
        footer={(detail, reload) => (
          <UnderTheHood
            detail={detail}
            actor={persona}
            isAdmin={isAdmin}
            reload={reload}
          />
        )}
      />
    </PageContainer>
  );
}
