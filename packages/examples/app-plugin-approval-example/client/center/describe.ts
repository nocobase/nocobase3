import type { InboxItem, RecordSummary } from '../../shared/types.js';
import type { Text } from '../lib/text.js';

/** A record's title as a person reads it: its own, or its kind and applicant. */
export function displayTitle(
  text: Text,
  record: Pick<RecordSummary, 'title' | 'demo' | 'applicantId'>,
): string {
  if (record.title) return record.title;
  return text.t('common.titleOf', {
    name: text.name(record.applicantId),
    type: text.demo(record.demo),
  });
}

/** The one-line facts of a list row: days, an amount, a counterparty. */
export function factsLine(text: Text, record: RecordSummary): string {
  const facts = record.facts;
  const parts: string[] = [];
  const add = (value: string | null | undefined): void => {
    if (value) parts.push(value);
  };
  if (typeof facts.leaveType === 'string')
    add(text.option('leaveType', facts.leaveType));
  if (typeof facts.days === 'number')
    add(text.t('common.days', { count: facts.days }));
  for (const field of [
    'city',
    'item',
    'project',
    'party',
    'subject',
    'subjectKey',
    'name',
    'subjectId',
    'purpose',
  ])
    if (typeof facts[field] === 'string') add(facts[field]);
  if (
    typeof facts.content === 'object' &&
    facts.content !== null &&
    !Array.isArray(facts.content)
  ) {
    const content = facts.content;
    if (Array.isArray(content.items))
      add(text.t('common.items', { count: content.items.length }));
    for (const field of ['product', 'employee'])
      if (typeof content[field] === 'string') add(content[field]);
    if (typeof content.budget === 'number') add(text.money(content.budget));
  }
  if (Array.isArray(facts.lines))
    add(text.t('common.lines', { count: facts.lines.length }));
  if (typeof facts.amount === 'number') add(text.money(facts.amount));
  if (typeof facts.amountCents === 'number') add(text.cents(facts.amountCents));
  if (Array.isArray(facts.recipientIds))
    add(text.names(facts.recipientIds.map(String)));
  return parts.join(' · ');
}

/** What a to-do asks of the person, in words. */
export function inboxLabel(
  text: Text,
  item: InboxItem,
  record: RecordSummary | undefined,
): string {
  let base: string;
  if (item.source === 'transition')
    base =
      item.box === 'toDo'
        ? text.t('inbox.task.transition', {
            action: text.transition(item.lifecycle, item.action ?? ''),
          })
        : text.transition(item.lifecycle, item.action ?? '');
  else if (item.source === 'acknowledgement')
    base = text.t(`inbox.task.${item.action ?? 'copy'}`);
  else if (item.source === 'record') base = text.t('inbox.task.mine');
  else
    base =
      item.action === 'claim'
        ? text.t('inbox.task.claim')
        : item.detail === 'consult' ||
            item.detail === 'material' ||
            item.detail === 'copy'
          ? text.t(`inbox.task.${item.detail}`)
          : text.t('inbox.task.decide', {
              stage: text.stage(item.detail ?? '', record?.stage),
            });
  return item.onBehalfOf
    ? `${base} · ${text.t('inbox.onBehalf', { name: text.name(item.onBehalfOf) })}`
    : base;
}
