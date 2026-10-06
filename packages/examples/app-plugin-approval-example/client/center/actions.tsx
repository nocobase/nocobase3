import { useState, type ReactElement } from 'react';
import type { JsonObject } from '@nocobase/lifecycle';
import { FlaskConical, ShieldCheck } from 'lucide-react';

import { Button } from '../components/ui/button.js';
import { useText } from '../lib/text.js';
import { cn } from '../lib/utils.js';
import type { Action, Tone } from './action-list.js';
import { missingFields } from './field-values.js';
import { FieldGrid } from './fields.js';

function ActionForm({
  action,
  busy,
  onRun,
  onClose,
}: {
  readonly action: Action;
  readonly busy: boolean;
  readonly onRun: (action: Action, form: JsonObject) => Promise<boolean>;
  readonly onClose: () => void;
}): ReactElement {
  const text = useText();
  const [form, setForm] = useState<JsonObject>(action.initial);
  const [invalid, setInvalid] = useState<string[]>([]);
  return (
    <form
      className='space-y-3 rounded-xl border bg-background p-4'
      onSubmit={(event) => {
        event.preventDefault();
        const missing = missingFields(action.fields, form);
        setInvalid(missing);
        if (missing.length) return;
        void onRun(action, form).then((done) => {
          if (done) onClose();
        });
      }}
    >
      <div className='text-sm font-medium'>{action.label}</div>
      {action.fields.length ? (
        <FieldGrid
          specs={action.fields}
          values={form}
          onChange={setForm}
          invalid={invalid}
        />
      ) : (
        <p className='text-sm text-muted-foreground'>
          {text.t('actions.confirm', { action: action.label })}
        </p>
      )}
      <div className='flex gap-2'>
        <Button
          type='submit'
          disabled={busy}
          variant={action.tone === 'danger' ? 'destructive' : 'default'}
        >
          {text.t('actions.confirmButton', { action: action.label })}
        </Button>
        <Button type='button' variant='ghost' onClick={onClose}>
          {text.t('common.cancel')}
        </Button>
      </div>
    </form>
  );
}

const VARIANTS: Readonly<Record<Tone, 'default' | 'destructive' | 'outline'>> =
  {
    primary: 'default',
    danger: 'destructive',
    outline: 'outline',
  };

/**
 * What the person can do now: the main actions as buttons, the rest under
 * them, and the administrator's and the simulator's apart. Each opens its
 * form in place; one without input runs at once.
 */
export function ActionPanel({
  actions,
  busy,
  onRun,
}: {
  readonly actions: readonly Action[];
  readonly busy: boolean;
  readonly onRun: (action: Action, form: JsonObject) => Promise<boolean>;
}): ReactElement | null {
  const text = useText();
  const [open, setOpen] = useState<string | null>(null);
  if (!actions.length) return null;
  const chosen = actions.find((action) => action.key === open);
  const press = (action: Action): void => {
    if (!action.fields.length && !action.confirm) {
      void onRun(action, {});
      return;
    }
    setOpen(open === action.key ? null : action.key);
  };
  const buttons = (items: readonly Action[], size: 'lg' | 'sm') =>
    items.map((action) => (
      <Button
        key={action.key}
        variant={VARIANTS[action.tone]}
        size={size}
        disabled={busy}
        onClick={() => press(action)}
        className={cn(open === action.key && 'ring-3 ring-ring/40')}
      >
        {action.label}
      </Button>
    ));
  const main = actions.filter(
    (action) => action.main && action.group !== 'admin',
  );
  const more = actions.filter(
    (action) =>
      !action.main && (action.group === 'task' || action.group === 'record'),
  );
  const admin = actions.filter((action) => action.group === 'admin');
  const simulated = actions.filter((action) => action.group === 'simulate');
  return (
    <div className='space-y-3'>
      {main.length ? (
        <div className='flex flex-wrap gap-2'>{buttons(main, 'lg')}</div>
      ) : null}
      {more.length ? (
        <div className='flex flex-wrap items-center gap-1.5'>
          <span className='text-xs text-muted-foreground'>
            {text.t('actions.more')}
          </span>
          {buttons(more, 'sm')}
        </div>
      ) : null}
      {admin.length ? (
        <div className='space-y-2 rounded-xl border border-dashed p-3'>
          <div className='flex items-center gap-1.5 text-xs font-medium text-muted-foreground'>
            <ShieldCheck className='size-3.5' />
            {text.t('actions.admin')}
          </div>
          <div className='flex flex-wrap gap-1.5'>{buttons(admin, 'sm')}</div>
        </div>
      ) : null}
      {simulated.length ? (
        <div className='space-y-2 rounded-xl border border-dashed p-3'>
          <div className='flex items-center gap-1.5 text-xs font-medium text-muted-foreground'>
            <FlaskConical className='size-3.5' />
            {text.t('actions.simulate')}
          </div>
          <div className='flex flex-wrap gap-1.5'>
            {buttons(simulated, 'sm')}
          </div>
        </div>
      ) : null}
      {chosen ? (
        <ActionForm
          key={chosen.key}
          action={chosen}
          busy={busy}
          onRun={onRun}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </div>
  );
}
