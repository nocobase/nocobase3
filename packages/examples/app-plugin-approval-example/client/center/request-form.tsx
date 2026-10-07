import { useEffect, useState, type ReactElement } from 'react';
import { useApiClient } from '@nocobase/app-client';
import type { JsonObject } from '@nocobase/lifecycle';
import { ArrowRight, GitFork, Send } from 'lucide-react';

import { demo, type DemoKey } from '../../shared/catalog.js';
import type { Created, Preview } from '../../shared/types.js';
import { Button } from '../components/ui/button.js';
import { errorMessage, exampleApi } from '../lib/api.js';
import { useText } from '../lib/text.js';
import { cn } from '../lib/utils.js';
import { Banner } from './common.js';
import { missingFields } from './field-values.js';
import { FieldGrid } from './fields.js';
import { initialForm, requestFields } from './forms.js';
import { Avatar } from './persona.js';

/** Who a request would go to, as it would be routed if submitted now. */
export function FlowPreview({
  preview,
  applicantId,
}: {
  readonly preview: Preview | undefined;
  readonly applicantId: string;
}): ReactElement {
  const text = useText();
  const node = (
    key: string,
    title: string,
    people: readonly string[],
    sub?: string,
    muted = false,
  ): ReactElement => (
    <div
      key={key}
      className={cn(
        'min-w-32 rounded-lg border bg-background px-3 py-2',
        muted && 'border-dashed opacity-60',
      )}
    >
      <div className='text-xs font-medium'>{title}</div>
      {people.length ? (
        <div className='mt-1 flex flex-wrap items-center gap-1'>
          {people.slice(0, 4).map((id) => (
            <span key={id} className='inline-flex items-center gap-1 text-xs'>
              <Avatar id={id} size='sm' />
              {text.name(id)}
            </span>
          ))}
          {people.length > 4 ? (
            <span className='text-xs text-muted-foreground'>
              +{people.length - 4}
            </span>
          ) : null}
        </div>
      ) : null}
      {sub ? (
        <div className='mt-1 text-[11px] text-muted-foreground'>{sub}</div>
      ) : null}
    </div>
  );
  const arrow = (key: string): ReactElement => (
    <ArrowRight key={key} className='size-4 shrink-0 text-muted-foreground' />
  );
  let body: ReactElement;
  if (!preview)
    body = (
      <p className='text-xs text-muted-foreground'>
        {text.t('common.loading')}
      </p>
    );
  else if (preview.mode === 'none')
    body = (
      <p className='text-xs text-muted-foreground'>{text.t('preview.none')}</p>
    );
  else if (preview.mode === 'branches')
    body = (
      <div className='flex flex-wrap items-center gap-2'>
        {node('submit', text.t('preview.submit'), [applicantId])}
        {arrow('a')}
        <div className='flex flex-col gap-2 rounded-lg border border-dashed p-2'>
          <span className='flex items-center gap-1 text-[11px] text-muted-foreground'>
            <GitFork className='size-3' />
            {text.t('preview.parallel')}
          </span>
          {preview.steps.map((step) =>
            node(
              step.key,
              text.stage(step.key, step.title),
              step.people,
              step.required ? undefined : text.t('preview.optional'),
            ),
          )}
        </div>
        {arrow('b')}
        {node('finished', text.t('preview.finished'), [])}
      </div>
    );
  else {
    const included = preview.steps.filter((step) => step.included);
    body = (
      <div className='flex flex-wrap items-center gap-2'>
        {node('submit', text.t('preview.submit'), [applicantId])}
        {included.flatMap((step, index) => [
          arrow(`a${index}`),
          node(
            step.key,
            text.stage(step.key, step.title),
            step.people,
            step.people.length > 1
              ? text.lookup([`policies.${step.rule}`], step.rule)
              : step.people.length
                ? undefined
                : text.t('preview.nobody'),
          ),
        ])}
        {arrow('end')}
        {node(
          'finished',
          text.t(included.length ? 'preview.finished' : 'preview.automatic'),
          [],
        )}
      </div>
    );
  }
  const skipped = preview?.steps.filter((step) => !step.included) ?? [];
  return (
    <div className='space-y-2 rounded-xl bg-muted/40 p-4'>
      <div className='text-sm font-medium'>{text.t('preview.title')}</div>
      {body}
      {skipped.length ? (
        <p className='text-[11px] text-muted-foreground'>
          {text.t('preview.skipped', {
            stages: skipped
              .map(
                (step) =>
                  `${text.stage(step.key, step.title)}${step.because ? ` (${step.because})` : ''}`,
              )
              .join(', '),
          })}
        </p>
      ) : null}
      {preview?.problems.length ? (
        <Banner tone='danger'>{preview.problems.join(' ')}</Banner>
      ) : null}
      {preview?.notes.length ? (
        <ul className='list-inside list-disc text-[11px] text-muted-foreground'>
          {preview.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** The form a person starts a request with, with its route previewed live. */
export function RequestForm({
  demos,
  actor,
  onCreated,
  onCancel,
}: {
  readonly demos: readonly DemoKey[];
  readonly actor: string;
  readonly onCreated: (created: Created) => void;
  readonly onCancel: () => void;
}): ReactElement {
  const text = useText();
  const client = useApiClient();
  const [key, setKey] = useState<DemoKey>(demos[0]);
  const [form, setForm] = useState<JsonObject>(() => initialForm(key, actor));
  const [invalid, setInvalid] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<Preview | undefined>();
  const item = demo(key);
  const applicantId =
    typeof form.applicantId === 'string' && form.applicantId
      ? form.applicantId
      : actor;
  const formKey = JSON.stringify(form);
  useEffect(() => {
    const timer = setTimeout(() => {
      exampleApi(client)
        .preview(key, JSON.parse(formKey) as JsonObject, actor)
        .then(setPreview, () => setPreview(undefined));
    }, 300);
    return () => clearTimeout(timer);
  }, [client, key, formKey, actor]);
  const fields = requestFields(key);
  const submit = async (send: boolean): Promise<void> => {
    const missing = missingFields(fields, form);
    setInvalid(missing);
    if (missing.length) {
      setError(text.t('form.missing'));
      return;
    }
    setBusy(true);
    setError('');
    const api = exampleApi(client);
    try {
      const created = await api.create(key, form, actor);
      if (send && item?.start) {
        try {
          await api.fire(created.lifecycle, created.id, item.start, {}, actor);
        } catch (cause) {
          // Kept as a draft: the refusal says why it could not be sent.
          setError(errorMessage(cause, text.translate));
          onCreated(created);
          return;
        }
      }
      onCreated(created);
    } catch (cause) {
      setError(errorMessage(cause, text.translate));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className='space-y-5'>
      {demos.length > 1 ? (
        <div className='grid gap-2 sm:grid-cols-2'>
          {demos.map((each) => (
            <button
              key={each}
              type='button'
              onClick={() => {
                setKey(each);
                setForm(initialForm(each, actor));
                setInvalid([]);
                setError('');
                setPreview(undefined);
              }}
              className={cn(
                'rounded-xl border p-3 text-left transition-colors hover:bg-muted',
                each === key && 'border-primary bg-primary/5',
              )}
            >
              <div className='text-sm font-medium'>{text.demo(each)}</div>
              <div className='mt-0.5 text-xs text-muted-foreground'>
                {text.t(`demos.${each}.hint`)}
              </div>
            </button>
          ))}
        </div>
      ) : (
        <p className='text-sm text-muted-foreground'>
          {text.t(`demos.${key}.hint`)}
        </p>
      )}
      <form
        className='space-y-5'
        onSubmit={(event) => {
          event.preventDefault();
          void submit(true);
        }}
      >
        <FieldGrid
          specs={fields}
          values={form}
          onChange={setForm}
          invalid={invalid}
        />
        <FlowPreview preview={preview} applicantId={applicantId} />
        {error ? <Banner tone='danger'>{error}</Banner> : null}
        <div className='flex flex-wrap gap-2'>
          {item?.start ? (
            <Button type='submit' disabled={busy}>
              <Send />
              {text.transition(item.lifecycle, item.start)}
            </Button>
          ) : null}
          <Button
            type={item?.start ? 'button' : 'submit'}
            variant={item?.start ? 'outline' : 'default'}
            disabled={busy}
            onClick={item?.start ? () => void submit(false) : undefined}
          >
            {text.t('form.saveDraft')}
          </Button>
          <Button type='button' variant='ghost' onClick={onCancel}>
            {text.t('common.cancel')}
          </Button>
        </div>
      </form>
    </div>
  );
}
