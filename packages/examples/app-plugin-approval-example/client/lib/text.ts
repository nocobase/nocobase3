import { useTranslation } from '@nocobase/i18n/client';

import { personName, personTitle } from '../../shared/people.js';
import { text as str } from '../../shared/text.js';
import { NAMESPACE, type Translate } from './api.js';

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
  'fulfilled',
  'succeeded',
  'refunded',
]);
const DANGER = new Set([
  'rejected',
  'failed',
  'registrationFailed',
  'accountFailed',
  'paymentFailed',
  'executionFailed',
  'refundRequired',
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
  'created',
]);
/** States named like a success that still wait for something, by lifecycle. */
const WAITING: Readonly<Record<string, ReadonlySet<string>>> = {
  scenarioLeaves: new Set(['approved']),
  scenarioReimbursements: new Set(['approved', 'partiallyApproved']),
  scenarioPayments: new Set(['approved']),
  scenarioOrders: new Set(['paid']),
};

/** How a record's state looks in a badge. */
export function stateTone(lifecycle: string, state: string): Tone {
  if (WAITING[lifecycle]?.has(state)) return 'info';
  if (SUCCESS.has(state)) return 'success';
  if (DANGER.has(state)) return 'danger';
  if (NEUTRAL.has(state)) return 'neutral';
  return 'warning';
}

export interface Text {
  readonly t: (key: string, options?: Record<string, unknown>) => string;
  /** For `errorMessage`: a key in this namespace, or the server's English. */
  readonly translate: Translate;
  readonly language: string;
  /** A person's display name; `system` is the system. */
  readonly name: (id: string | null | undefined) => string;
  readonly title: (id: string) => string;
  readonly names: (ids: readonly string[]) => string;
  readonly status: (lifecycle: string, state: string) => string;
  readonly demo: (key: string | null) => string;
  readonly business: (key: string | null) => string;
  /** A stage's label: translated by key, or the definition's own title. */
  readonly stage: (key: string, title?: string | null) => string;
  readonly transition: (lifecycle: string, name: string) => string;
  readonly option: (group: string, value: unknown) => string;
  /** An amount in yuan. */
  readonly money: (value: unknown) => string;
  /** An amount in cents. */
  readonly cents: (value: unknown) => string;
  readonly date: (value: unknown) => string;
  readonly dateTime: (value: unknown) => string;
  readonly ago: (value: unknown) => string;
  /** The first key that has a translation, or `fallback`. */
  readonly lookup: (keys: readonly string[], fallback: string) => string;
}

/** Everything the pages need to turn the example's data into words. */
export function useText(): Text {
  const { t: translate, i18n } = useTranslation(NAMESPACE);
  const t = (key: string, options?: Record<string, unknown>): string =>
    translate(key, options);
  const lookup = (keys: readonly string[], fallback: string): string => {
    for (const key of keys) {
      const value = t(key, { defaultValue: '' });
      if (value && value !== key) return value;
    }
    return fallback;
  };
  const language = i18n.language || 'zh-CN';
  const money = new Intl.NumberFormat(language, {
    style: 'currency',
    currency: 'CNY',
    maximumFractionDigits: 2,
  });
  const relative = new Intl.RelativeTimeFormat(language, { numeric: 'auto' });
  const name = (id: string | null | undefined): string => {
    if (!id) return '—';
    if (id === 'system') return t('common.system');
    return personName(id, language);
  };
  const instant = (value: unknown): Date =>
    new Date(typeof value === 'string' ? value : '');
  return {
    t,
    translate: (key, fallback) => lookup([key], fallback),
    language,
    name,
    title: (id) => personTitle(id, language),
    names: (ids) =>
      ids.map(name).join(language.startsWith('zh') ? '、' : ', ') || '—',
    status: (lifecycle, state) =>
      lookup([`status.${lifecycle}.${state}`, `status.common.${state}`], state),
    demo: (key) =>
      key ? lookup([`demos.${key}.title`], key) : t('common.request'),
    business: (key) =>
      key ? lookup([`business.${key}.title`], key) : t('common.request'),
    stage: (key, title) =>
      lookup([`stages.${key}`, `branches.${key}`], title ?? key),
    transition: (lifecycle, transitionName) =>
      lookup(
        [
          `transitions.${lifecycle}.${transitionName}`,
          `transitions.common.${transitionName}`,
        ],
        transitionName,
      ),
    option: (group, value) =>
      lookup(
        [`options.${group}.${str(value)}`],
        typeof value === 'string' ? value : str(value),
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
      const date = instant(value);
      if (Number.isNaN(date.getTime()))
        return typeof value === 'string' ? value : '—';
      return new Intl.DateTimeFormat(language, { dateStyle: 'medium' }).format(
        date,
      );
    },
    dateTime: (value) => {
      const date = instant(value);
      return Number.isNaN(date.getTime())
        ? '—'
        : new Intl.DateTimeFormat(language, {
            dateStyle: 'medium',
            timeStyle: 'short',
          }).format(date);
    },
    ago: (value) => {
      const time = instant(value).getTime();
      if (Number.isNaN(time)) return '';
      const seconds = Math.round((time - Date.now()) / 1000);
      if (Math.abs(seconds) < 60) return relative.format(seconds, 'second');
      if (Math.abs(seconds) < 3600)
        return relative.format(Math.round(seconds / 60), 'minute');
      if (Math.abs(seconds) < 86_400)
        return relative.format(Math.round(seconds / 3600), 'hour');
      return relative.format(Math.round(seconds / 86_400), 'day');
    },
    lookup,
  };
}
