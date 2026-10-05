import { text as str } from '../../shared/text.js';
import { useTranslation } from '@nocobase/i18n/client';

import { centerName, centerTitle } from '../../shared/approval-center.js';
import { NAMESPACE } from '../lib/format.js';

export type Tone = 'neutral' | 'info' | 'warning' | 'success' | 'danger';

export const TONE_CLASSES: Readonly<Record<Tone, string>> = {
  neutral: 'bg-muted text-muted-foreground',
  info: 'bg-primary/10 text-primary',
  warning: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  success: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  danger: 'bg-destructive/10 text-destructive',
};

const SUCCESS = new Set([
  'approved',
  'registered',
  'completed',
  'done',
  'confirmed',
  'effective',
  'active',
  'paid',
  'executed',
  'succeeded',
]);
const DANGER = new Set([
  'rejected',
  'failed',
  'registrationFailed',
  'accountFailed',
  'paymentFailed',
  'executionFailed',
]);
const NEUTRAL = new Set([
  'draft',
  'cancelled',
  'withdrawn',
  'revoked',
  'terminated',
  'expired',
  'superseded',
  'exhausted',
  'rolledBack',
]);
/** States named like a success that still wait for something, per lifecycle. */
const WAITING: Readonly<Record<string, ReadonlySet<string>>> = {
  leaveRequests: new Set(['approved']),
  reimbursements: new Set(['approved', 'partiallyApproved']),
  paymentRequests: new Set(['approved']),
  coordinations: new Set([]),
};

/** How a record's state looks in a badge. */
export function stateTone(lifecycle: string, state: string): Tone {
  if (WAITING[lifecycle]?.has(state)) return 'info';
  if (SUCCESS.has(state)) return 'success';
  if (DANGER.has(state)) return 'danger';
  if (NEUTRAL.has(state)) return 'neutral';
  return 'warning';
}

/** Whether nothing more will happen to a record in this state. */
export function isSettled(lifecycle: string, state: string): boolean {
  return (
    stateTone(lifecycle, state) !== 'warning' && !WAITING[lifecycle]?.has(state)
  );
}

export interface CenterText {
  readonly t: (key: string, options?: Record<string, unknown>) => string;
  readonly language: string;
  /** A person's display name. `system` is the system. */
  readonly name: (id: string | null | undefined) => string;
  readonly title: (id: string) => string;
  readonly names: (ids: readonly string[]) => string;
  readonly status: (lifecycle: string, state: string) => string;
  readonly type: (kind: string | null) => string;
  readonly business: (key: string | null) => string;
  /** The label of an approval stage, an added signer, or a branch. */
  readonly stage: (key: string, title?: string) => string;
  readonly action: (lifecycle: string, name: string) => string;
  readonly option: (group: string, value: unknown) => string;
  /** A plain amount in yuan. */
  readonly money: (value: unknown) => string;
  /** An amount in cents. */
  readonly cents: (value: unknown) => string;
  readonly date: (value: unknown) => string;
  readonly dateTime: (value: unknown) => string;
  readonly ago: (value: unknown) => string;
}

function lookup(
  t: (key: string, options?: Record<string, unknown>) => string,
  keys: readonly string[],
  fallback: string,
): string {
  for (const key of keys) {
    const value = t(key, { defaultValue: '' });
    if (value && value !== key) return value;
  }
  return fallback;
}

/** Everything the center needs to turn record data into words. */
export function useCenterText(): CenterText {
  const { t: translate, i18n } = useTranslation(NAMESPACE);
  const t = (key: string, options?: Record<string, unknown>): string =>
    translate(key, options);
  const language = i18n.language || 'zh-CN';
  const money = new Intl.NumberFormat(language, {
    style: 'currency',
    currency: 'CNY',
    maximumFractionDigits: 2,
  });
  const relative = new Intl.RelativeTimeFormat(language, { numeric: 'auto' });
  const name = (id: string | null | undefined): string => {
    if (!id) return '—';
    if (id === 'system') return t('center.common.system');
    return centerName(id, language);
  };
  const stage = (key: string, title?: string): string => {
    // An added signer: `<stage>:<before|after|parallel>:<person>`.
    const signer = /^(.+):(before|after|parallel):(.+)$/.exec(key);
    if (signer)
      return t(`center.stages.added.${signer[2]}`, {
        name: name(signer[3]),
      });
    if (/^stage\d+$/.test(key) && title)
      return t('center.stages.reviewer', { name: name(title) });
    return lookup(
      t,
      [
        `center.stages.${key}`,
        `center.branches.${key}`,
        `center.workSteps.${key}`,
      ],
      title ?? key,
    );
  };
  return {
    t,
    language,
    name,
    title: (id) => centerTitle(id, language),
    names: (ids) =>
      ids.map(name).join(language.startsWith('zh') ? '、' : ', ') || '—',
    status: (lifecycle, state) =>
      lookup(
        t,
        [
          `center.status.${lifecycle}.${state}`,
          `center.status.common.${state}`,
        ],
        state,
      ),
    type: (kind) =>
      kind
        ? lookup(t, [`center.types.${kind}`], kind)
        : t('center.common.request'),
    business: (key) =>
      key ? t(`center.business.${key}.title`) : t('center.common.request'),
    stage,
    action: (lifecycle, action) =>
      lookup(
        t,
        [
          `center.actions.${lifecycle}.${action}`,
          `center.actions.common.${action}`,
        ],
        action,
      ),
    option: (group, value) =>
      lookup(
        t,
        [`center.options.${group}.${str(value)}`],
        typeof value === 'string' ? value : '',
      ),
    money: (value) =>
      typeof value === 'number' && Number.isFinite(value)
        ? money.format(value)
        : '—',
    cents: (value) =>
      typeof value === 'number' && Number.isFinite(value)
        ? money.format(value / 100)
        : '—',
    date: (value) => {
      const date = new Date(typeof value === 'string' ? value : '');
      return Number.isNaN(date.getTime())
        ? typeof value === 'string'
          ? value
          : '—'
        : new Intl.DateTimeFormat(language, { dateStyle: 'medium' }).format(
            date,
          );
    },
    dateTime: (value) => {
      const date = new Date(typeof value === 'string' ? value : '');
      return Number.isNaN(date.getTime())
        ? '—'
        : new Intl.DateTimeFormat(language, {
            dateStyle: 'medium',
            timeStyle: 'short',
          }).format(date);
    },
    ago: (value) => {
      const time = Date.parse(typeof value === 'string' ? value : '');
      if (Number.isNaN(time)) return '';
      const seconds = Math.round((time - Date.now()) / 1000);
      if (Math.abs(seconds) < 60) return relative.format(seconds, 'second');
      if (Math.abs(seconds) < 3600)
        return relative.format(Math.round(seconds / 60), 'minute');
      if (Math.abs(seconds) < 86_400)
        return relative.format(Math.round(seconds / 3600), 'hour');
      return relative.format(Math.round(seconds / 86_400), 'day');
    },
  };
}
