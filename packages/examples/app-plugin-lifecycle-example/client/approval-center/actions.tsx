import { useState, type ReactElement } from 'react';
import type { JsonObject } from '@nocobase/lifecycle';
import type { AvailableTransition } from '@nocobase/lifecycle/react';
import { FlaskConical } from 'lucide-react';

import { Button } from '../components/ui/button.js';
import { cn } from '../lib/utils.js';
import {
  actionLabel,
  SIMULATED,
  visibleActions,
  type ActionContext,
  type Tone,
  type VisibleAction,
} from './action-specs.js';
import { missingFields } from './field-values.js';
import { FieldGrid } from './fields.js';

function ActionForm({
  action,
  context,
  busy,
  onFire,
  onClose,
}: {
  readonly action: VisibleAction;
  readonly context: ActionContext;
  readonly busy: boolean;
  readonly onFire: (transition: string, input: JsonObject) => Promise<boolean>;
  readonly onClose: () => void;
}): ReactElement {
  const { text } = context;
  const fields = action.spec.fields?.(context) ?? [];
  const [form, setForm] = useState<JsonObject>(
    () => action.spec.initial?.(context) ?? {},
  );
  const [invalid, setInvalid] = useState<string[]>([]);
  const label = actionLabel(text, context.lifecycle, action.key);
  return (
    <form
      className='space-y-3 rounded-xl border bg-background p-4'
      onSubmit={(event) => {
        event.preventDefault();
        const missing = missingFields(fields, form);
        setInvalid(missing);
        if (missing.length) return;
        const input = action.spec.input
          ? action.spec.input(form, context)
          : form;
        void onFire(action.spec.transition, input).then((done) => {
          if (done) onClose();
        });
      }}
    >
      <div className='text-sm font-medium'>{label}</div>
      {fields.length ? (
        <FieldGrid
          specs={fields}
          values={form}
          onChange={setForm}
          invalid={invalid}
        />
      ) : (
        <p className='text-sm text-muted-foreground'>
          {text.t('center.actions.confirm', { action: label })}
        </p>
      )}
      <div className='flex gap-2'>
        <Button
          type='submit'
          disabled={busy}
          variant={action.spec.tone === 'danger' ? 'destructive' : 'default'}
        >
          {text.t('center.actions.confirmButton', { action: label })}
        </Button>
        <Button type='button' variant='ghost' onClick={onClose}>
          {text.t('center.common.cancel')}
        </Button>
      </div>
    </form>
  );
}

const BUTTON_VARIANTS: Readonly<
  Record<Tone, 'default' | 'destructive' | 'outline'>
> = {
  primary: 'default',
  danger: 'destructive',
  outline: 'outline',
};

/**
 * What the person can do now, as business actions: the main ones as buttons,
 * the rest under them; each opens its form in place. Only actions the
 * lifecycle's guards allow this person are shown.
 */
export function ActionPanel({
  context,
  available,
  version,
  onFire,
  onSimulate,
  busy,
}: {
  readonly context: ActionContext;
  readonly available: readonly AvailableTransition[];
  readonly version: number | null;
  readonly onFire: (transition: string, input: JsonObject) => Promise<boolean>;
  readonly onSimulate: (
    transition: string,
    input: JsonObject,
    version: number | null,
  ) => Promise<boolean>;
  readonly busy: boolean;
}): ReactElement | null {
  const { text } = context;
  const [open, setOpen] = useState<string | null>(null);
  const actions = visibleActions(context, available);
  const main = actions.filter((action) => action.spec.main);
  const more = actions.filter((action) => !action.spec.main);
  const simulated =
    context.actor === 'admin'
      ? (SIMULATED[context.lifecycle] ?? []).filter((event) =>
          available.some((item) => item.name === event.transition),
        )
      : [];
  if (!actions.length && !simulated.length) return null;
  const chosen = actions.find((action) => action.key === open);
  const press = (action: VisibleAction): void => {
    if (
      !action.spec.fields &&
      action.spec.tone !== 'danger' &&
      action.spec.main
    ) {
      void onFire(
        action.spec.transition,
        action.spec.input ? action.spec.input({}, context) : {},
      );
      return;
    }
    setOpen(open === action.key ? null : action.key);
  };
  return (
    <div className='space-y-3'>
      {main.length ? (
        <div className='flex flex-wrap gap-2'>
          {main.map((action) => (
            <Button
              key={action.key}
              variant={BUTTON_VARIANTS[action.spec.tone]}
              size='lg'
              disabled={busy}
              onClick={() => press(action)}
              className={cn(open === action.key && 'ring-3 ring-ring/40')}
            >
              {actionLabel(text, context.lifecycle, action.key)}
            </Button>
          ))}
        </div>
      ) : null}
      {more.length ? (
        <div className='flex flex-wrap items-center gap-1.5'>
          <span className='text-xs text-muted-foreground'>
            {text.t('center.actions.more')}
          </span>
          {more.map((action) => (
            <Button
              key={action.key}
              variant={
                action.spec.tone === 'danger' ? 'destructive' : 'outline'
              }
              size='sm'
              disabled={busy}
              onClick={() => press(action)}
              className={cn(open === action.key && 'ring-3 ring-ring/40')}
            >
              {actionLabel(text, context.lifecycle, action.key)}
            </Button>
          ))}
        </div>
      ) : null}
      {chosen ? (
        <ActionForm
          key={chosen.key}
          action={chosen}
          context={context}
          busy={busy}
          onFire={onFire}
          onClose={() => setOpen(null)}
        />
      ) : null}
      {simulated.length ? (
        <div className='space-y-2 rounded-xl border border-dashed p-3'>
          <div className='flex items-center gap-1.5 text-xs font-medium text-muted-foreground'>
            <FlaskConical className='size-3.5' />
            {text.t('center.actions.simulate')}
          </div>
          <div className='flex flex-wrap gap-1.5'>
            {simulated.map((event) => (
              <Button
                key={event.transition}
                size='sm'
                variant='outline'
                disabled={busy}
                onClick={() =>
                  void onSimulate(event.transition, event.input(), version)
                }
              >
                {text.t(`center.simulated.${event.transition}`)}
              </Button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
