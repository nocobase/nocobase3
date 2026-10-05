import type { ReactNode } from 'react';
import type { JsonValue } from '@nocobase/lifecycle';

import { APPROVAL_DEMOS } from '../../shared/approval-lab.js';
import type {
  CenterInboxItem,
  CenterRecord,
} from '../../shared/approval-center.js';
import type { FieldSpec } from './fields.js';
import type { CenterText } from './format.js';
import { Person } from './persona.js';

/** A record's title as a person reads it; sample records are named after their scenario key. */
export function displayTitle(
  text: CenterText,
  record: {
    readonly title: string;
    readonly kind: string | null;
    readonly applicantId: string;
  },
): string {
  if (
    !record.title ||
    APPROVAL_DEMOS.some(
      (demo) => demo.key === record.title || demo.title === record.title,
    )
  )
    return text.t('center.common.titleOf', {
      name: text.name(record.applicantId),
      type: text.type(record.kind),
    });
  return record.title;
}

/** One field's value as text, or null when there is nothing to show. */
export function formatValue(
  text: CenterText,
  spec: FieldSpec,
  value: JsonValue,
): ReactNode {
  if (value === null || value === '' || (Array.isArray(value) && !value.length))
    return null;
  switch (spec.kind) {
    case 'money':
      return text.money(value);
    case 'cents':
      return text.cents(value);
    case 'date':
      return text.date(value);
    case 'datetime':
      return text.dateTime(value);
    case 'select':
      return text.option(spec.group, value);
    case 'checkbox':
      return value === true
        ? text.t(spec.hint ?? 'center.common.yes')
        : spec.hint
          ? null
          : text.t('center.common.no');
    case 'person':
      return typeof value === 'string' ? <Person id={value} /> : null;
    case 'people':
      return Array.isArray(value) ? text.names(value.map(String)) : null;
    case 'number':
      return spec.name.endsWith('days')
        ? text.t('center.common.days', { count: Number(value) })
        : JSON.stringify(value);
    default:
      return typeof value === 'string' || typeof value === 'number'
        ? String(value)
        : JSON.stringify(value);
  }
}

/** The one-line facts of a list row: days, an amount, a counterparty. */
export function factsLine(text: CenterText, record: CenterRecord): string {
  const facts = record.facts;
  const parts: string[] = [];
  const add = (value: string | null | undefined): void => {
    if (value) parts.push(value);
  };
  if (typeof facts.leaveType === 'string')
    add(text.option('leaveType', facts.leaveType));
  if (typeof facts.days === 'number')
    add(text.t('center.common.days', { count: facts.days }));
  if (typeof facts.destination === 'string') add(facts.destination);
  if (typeof facts.item === 'string') add(facts.item);
  if (typeof facts.project === 'string') add(facts.project);
  if (typeof facts.party === 'string') add(facts.party);
  if (typeof facts.product === 'string') add(facts.product);
  if (typeof facts.employee === 'string') add(facts.employee);
  if (typeof facts.name === 'string') add(facts.name);
  if (typeof facts.subjectId === 'string') add(facts.subjectId);
  if (Array.isArray(facts.items))
    add(text.t('center.common.items', { count: facts.items.length }));
  if (typeof facts.amount === 'number') add(text.money(facts.amount));
  if (typeof facts.budget === 'number') add(text.money(facts.budget));
  if (typeof facts.amountCents === 'number') add(text.cents(facts.amountCents));
  if (typeof facts.totalCents === 'number') add(text.cents(facts.totalCents));
  if (typeof facts.limitCents === 'number') add(text.cents(facts.limitCents));
  if (typeof facts.recipients === 'number')
    add(
      text.t('center.common.confirmedOf', {
        done: facts.confirmed,
        total: facts.recipients,
      }),
    );
  return parts.join(' · ');
}

/** What a to-do asks of the person, in words. */
export function taskLabel(
  text: CenterText,
  item: CenterInboxItem,
  record: CenterRecord | undefined,
): string {
  if (item.action === 'submit' && item.detail === 'returned')
    return text.t('center.inbox.task.returned');
  const own = text.t(`center.inbox.task.${item.action ?? 'view'}`, {
    defaultValue: '',
  });
  const base =
    own && own !== `center.inbox.task.${item.action ?? 'view'}`
      ? own
      : text.t('center.inbox.task.default', {
          action: text.action(item.lifecycle, item.action ?? ''),
        });
  const step =
    record?.step && item.action === 'decide'
      ? ` · ${text.stage(record.step)}`
      : '';
  const behalf = item.onBehalfOf
    ? ` · ${text.t('center.inbox.onBehalf', { name: text.name(item.onBehalfOf) })}`
    : '';
  return `${base}${step}${behalf}`;
}
