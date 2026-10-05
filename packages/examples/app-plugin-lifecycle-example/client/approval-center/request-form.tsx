import { useEffect, useState, type ReactElement } from 'react';
import { useApiClient } from '@nocobase/app-client';
import type { JsonObject } from '@nocobase/lifecycle';
import { ArrowRight, GitFork, Send } from 'lucide-react';

import type { CenterPreview } from '../../shared/approval-center.js';
import type { LabRecord } from '../../shared/approval-lab.js';
import { Banner } from '../components/record-ui.js';
import { Button } from '../components/ui/button.js';
import { errorMessage } from '../lib/api.js';
import { useTranslate } from '../lib/use-example-record.js';
import { cn } from '../lib/utils.js';
import { centerApi } from './api.js';
import { missingFields } from './field-values.js';
import { FieldGrid } from './fields.js';
import { useCenterText } from './format.js';
import { Avatar } from './persona.js';
import { requestType, STATIC_FLOWS } from './types.js';

function ruleText(
  t: (key: string, options?: Record<string, unknown>) => string,
  rule: unknown,
  people: number,
): string {
  if (Array.isArray(rule)) return '';
  const value = (rule ?? {}) as {
    kind?: string;
    onReject?: string;
    min?: number;
  };
  if (value.kind === 'all')
    return people > 1
      ? t(
          value.onReject === 'collect'
            ? 'center.rules.allCollect'
            : 'center.rules.all',
        )
      : '';
  if (value.kind === 'threshold')
    return t('center.rules.threshold', { min: value.min });
  return value.kind ? t(`center.rules.${value.kind}`) : '';
}

/** Who a request would go to, as it would be routed if submitted now. */
export function FlowPreview({
  typeKey,
  preview,
  applicantId,
}: {
  readonly typeKey: string;
  readonly preview: CenterPreview | undefined;
  readonly applicantId: string;
}): ReactElement {
  const text = useCenterText();
  const fixed = STATIC_FLOWS[typeKey];
  const node = (
    key: string,
    title: string,
    people: readonly string[],
    sub?: string,
  ): ReactElement => (
    <div
      key={key}
      className='min-w-32 rounded-lg border bg-background px-3 py-2'
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
  if (fixed)
    body = (
      <div className='flex flex-wrap items-center gap-2'>
        {fixed.flatMap((step, index) => [
          ...(index ? [arrow(`a${index}`)] : []),
          node(
            step,
            text.t(`center.flowSteps.${step}`),
            step === 'submit' || step === 'publish' ? [applicantId] : [],
          ),
        ])}
      </div>
    );
  else if (!preview)
    body = (
      <p className='text-xs text-muted-foreground'>
        {text.t('center.common.loading')}
      </p>
    );
  else if (preview.mode === 'parallel')
    body = (
      <div className='flex flex-wrap items-center gap-2'>
        {node('submit', text.t('center.flowSteps.submit'), [applicantId])}
        {arrow('a')}
        <div className='flex flex-col gap-2 rounded-lg border border-dashed p-2'>
          <span className='flex items-center gap-1 text-[11px] text-muted-foreground'>
            <GitFork className='size-3' />
            {text.t('center.flow.parallel')}
          </span>
          {preview.steps.map((step) =>
            node(
              step.key,
              text.stage(step.key, step.title),
              step.people,
              step.required ? undefined : text.t('center.flow.optional'),
            ),
          )}
        </div>
        {arrow('b')}
        {node('finished', text.t('center.flowSteps.finished'), [])}
      </div>
    );
  else
    body = (
      <div className='flex flex-wrap items-center gap-2'>
        {node('submit', text.t('center.flowSteps.submit'), [applicantId])}
        {preview.steps.flatMap((step, index) => [
          arrow(`a${index}`),
          node(
            step.key,
            text.stage(step.key, step.title),
            step.people,
            ruleText(text.t, step.rule, step.people.length) || undefined,
          ),
        ])}
        {arrow('end')}
        {node(
          'finished',
          text.t(
            preview.steps.length
              ? 'center.flowSteps.finished'
              : 'center.flowSteps.autoApproved',
          ),
          [],
        )}
      </div>
    );
  return (
    <div className='space-y-2 rounded-xl bg-muted/40 p-4'>
      <div className='text-sm font-medium'>{text.t('center.form.preview')}</div>
      {body}
      {preview?.problems.length ? (
        <Banner tone='danger'>{text.t('center.form.unplannable')}</Banner>
      ) : null}
      {!fixed ? (
        <p className='text-[11px] text-muted-foreground'>
          {text.t('center.form.previewHint')}
        </p>
      ) : null}
    </div>
  );
}

/** The form a person starts a request with, with its route previewed live. */
export function RequestForm({
  types,
  actor,
  onCreated,
  onCancel,
}: {
  readonly types: readonly string[];
  readonly actor: string;
  readonly onCreated: (record: LabRecord) => void;
  readonly onCancel: () => void;
}): ReactElement {
  const text = useCenterText();
  const translate = useTranslate();
  const client = useApiClient();
  const [typeKey, setTypeKey] = useState(types[0]);
  const spec = requestType(typeKey);
  const [form, setForm] = useState<JsonObject>(
    () => spec?.initial(actor) ?? {},
  );
  const [invalid, setInvalid] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<CenterPreview | undefined>();
  const applicantId =
    typeof form.applicantId === 'string' && form.applicantId
      ? form.applicantId
      : actor;
  const previewKey = spec?.previewContent
    ? JSON.stringify(spec.previewContent(form))
    : '';
  useEffect(() => {
    if (!spec?.previewContent) return undefined;
    const timer = setTimeout(() => {
      centerApi(client)
        .preview(
          typeKey,
          JSON.parse(previewKey) as JsonObject,
          applicantId,
          actor,
        )
        .then(setPreview, () => setPreview(undefined));
    }, 300);
    return () => clearTimeout(timer);
    // `previewKey` stands for the content the preview is planned from.
    // eslint-disable-next-line react-hooks/exhaustive-deps, @eslint-react/exhaustive-deps
  }, [typeKey, previewKey, applicantId, actor]);
  if (!spec) return <p>{text.t('center.common.unknownType')}</p>;
  const fields = spec.fields(actor);
  const submit = async (send: boolean): Promise<void> => {
    const missing = missingFields(fields, form);
    setInvalid(missing);
    if (missing.length) {
      setError(text.t('center.form.missing'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const values = spec.values(form);
      const created = await centerApi(client).create(
        typeKey,
        {
          title: text.t('center.common.titleOf', {
            name: text.name(applicantId),
            type: text.type(typeKey),
          }),
          ...values,
        },
        actor,
        send,
      );
      onCreated(created);
    } catch (cause) {
      setError(errorMessage(cause, translate));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className='space-y-5'>
      {types.length > 1 ? (
        <div className='grid gap-2 sm:grid-cols-2'>
          {types.map((key) => (
            <button
              key={key}
              type='button'
              onClick={() => {
                setTypeKey(key);
                setForm(requestType(key)?.initial(actor) ?? {});
                setInvalid([]);
                setError('');
                setPreview(undefined);
              }}
              className={cn(
                'rounded-xl border p-3 text-left transition-colors hover:bg-muted',
                key === typeKey && 'border-primary bg-primary/5',
              )}
            >
              <div className='text-sm font-medium'>{text.type(key)}</div>
              <div className='mt-0.5 text-xs text-muted-foreground'>
                {text.t(`center.typeHints.${key}`)}
              </div>
            </button>
          ))}
        </div>
      ) : (
        <p className='text-sm text-muted-foreground'>
          {text.t(`center.typeHints.${typeKey}`)}
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
        <FlowPreview
          typeKey={typeKey}
          preview={preview}
          applicantId={applicantId}
        />
        {error ? <Banner tone='danger'>{error}</Banner> : null}
        <div className='flex flex-wrap gap-2'>
          <Button type='submit' disabled={busy}>
            <Send />
            {text.t(
              typeKey === 'notice'
                ? 'center.form.publish'
                : 'center.form.submit',
            )}
          </Button>
          {typeKey !== 'supplier' ? (
            <Button
              type='button'
              variant='outline'
              disabled={busy}
              onClick={() => void submit(false)}
            >
              {text.t('center.form.saveDraft')}
            </Button>
          ) : null}
          <Button type='button' variant='ghost' onClick={onCancel}>
            {text.t('center.common.cancel')}
          </Button>
        </div>
      </form>
    </div>
  );
}
