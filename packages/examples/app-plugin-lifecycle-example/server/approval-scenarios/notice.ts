// Scenario 25, a policy publication: every listed employee is told, and in
// `confirmAll` mode the policy becomes effective only once each of them has
// confirmed reading it. Nobody is asked to approve anything.
//
// The list of people owed a confirmation lives on the notice itself and
// changes only through its own transitions, so "has everyone confirmed?"
// is always decided against the list in the same transaction that would
// make the notice effective: adding a person bumps the notice's version,
// and a concurrent `becomeEffective` decided on the old list fails its
// conditional update instead of committing. The copies themselves are
// created after commit by an idempotent effect through `runtime.create()`,
// so each gets its `$create` entry and its delivery; a copy that is late or
// missing can only delay the notice, never let it through.
import {
  defineEffect,
  defineLifecycle,
  LifecycleError,
  SYSTEM_ACTOR,
  type EffectDefinition,
  type GuardVerdict,
  type Lifecycle,
  type LifecycleRecord,
  type TransitionContext,
} from '@nocobase/lifecycle';

import type {
  Acknowledgement,
  AcknowledgementKind,
} from './acknowledgement.js';
import { SCENARIO_COLLECTIONS, type ScenarioServices } from './services.js';

export type NoticeState = 'draft' | 'collecting' | 'effective' | 'withdrawn';

/** `notify`: tell; `receipt`: tell and track opening; `confirmAll`: effective once all confirm. */
export type NoticeMode = 'notify' | 'receipt' | 'confirmAll';

export interface Notice extends LifecycleRecord {
  readonly title: string;
  readonly publisherId: string;
  readonly mode: NoticeMode;
  readonly recipientIds: readonly string[];
  readonly publishedAt?: string | null;
  readonly effectiveAt?: string | null;
  readonly status: NoticeState;
}

export interface NoticeTypes {
  record: Notice;
  state: NoticeState;
  services: ScenarioServices;
}

type Context = TransitionContext<NoticeTypes>;

const KIND_BY_MODE: Readonly<Record<NoticeMode, AcknowledgementKind>> = {
  notify: 'notify',
  receipt: 'receipt',
  confirmAll: 'confirm',
};

function publisherOnly({ record, actor }: Context): GuardVerdict {
  return (
    actor.id === record.publisherId || {
      code: 'publisherOnly',
      message: 'Only the publisher can do this.',
    }
  );
}

/** The notice's copies, as the caller's transaction sees them. */
export async function copiesOf(
  services: ScenarioServices,
  noticeId: string,
): Promise<Acknowledgement[]> {
  return (await services.records.list(
    SCENARIO_COLLECTIONS.acknowledgements,
    (row) => row.sourceLifecycle === 'notices' && row.sourceId === noticeId,
  )) as Acknowledgement[];
}

/** Who on the notice's list has not confirmed yet. */
export async function awaitingConfirmation(
  services: ScenarioServices,
  notice: Notice,
): Promise<string[]> {
  const confirmed = new Set(
    (await copiesOf(services, String(notice.id)))
      .filter((copy) => copy.status === 'confirmed')
      .map((copy) => copy.recipientId),
  );
  return notice.recipientIds.filter((person) => !confirmed.has(person));
}

function recipientsOf(input: Record<string, unknown>): string[] {
  const value = input.recipientIds;
  return Array.isArray(value)
    ? value.filter(
        (item): item is string => typeof item === 'string' && item !== '',
      )
    : [];
}

/**
 * Creates the copy each listed person is owed and has not got. A copy made
 * while the notice is collecting blocks it; one made after it is effective
 * still asks for a confirmation but holds nothing up.
 */
const ensureCopies: EffectDefinition<NoticeTypes> = defineEffect<NoticeTypes>({
  name: 'notices.ensureCopies',
  retry: { attempts: 3, backoffMs: 1_000 },
  run: async ({ record, services }) => {
    if (record.status !== 'collecting' && record.status !== 'effective')
      return { created: [] };
    const existing = new Set(
      (await copiesOf(services, String(record.id))).map(
        (copy) => copy.recipientId,
      ),
    );
    const created: string[] = [];
    for (const recipientId of record.recipientIds) {
      if (existing.has(recipientId)) continue;
      await services.lifecycles.create(
        'acknowledgements',
        {
          sourceLifecycle: 'notices',
          sourceId: String(record.id),
          recipientId,
          title: record.title,
          blocking: record.status === 'collecting',
          kind: KIND_BY_MODE[record.mode],
          reminders: 0,
          comments: [],
        },
        { actor: SYSTEM_ACTOR },
      );
      existing.add(recipientId);
      created.push(recipientId);
    }
    return { created };
  },
});

const revokeCopies: EffectDefinition<NoticeTypes> = defineEffect<NoticeTypes>({
  name: 'notices.revokeCopies',
  retry: { attempts: 3, backoffMs: 1_000 },
  run: async ({ record, services }) => {
    let revoked = 0;
    for (const copy of await copiesOf(services, String(record.id))) {
      try {
        await services.lifecycles.fire('acknowledgements', copy.id, 'revoke', {
          actor: SYSTEM_ACTOR,
        });
        revoked += 1;
      } catch (error) {
        // Confirmed or revoked already: a confirmation stays on record.
        if (!(
          error instanceof LifecycleError && error.code === 'INVALID_STATE'
        ))
          throw error;
      }
    }
    return { revoked };
  },
});

export const noticeLifecycle: Lifecycle<NoticeTypes> =
  defineLifecycle<NoticeTypes>({
    name: 'notices',
    collection: SCENARIO_COLLECTIONS.notices,
    initial: 'draft',
    states: [
      'draft',
      'collecting',
      'effective',
      { name: 'withdrawn', final: true },
    ],
    transitions: {
      publish: {
        title: 'Publish',
        from: 'draft',
        to: ['collecting', 'effective'],
        guard: (context) => {
          const publisher = publisherOnly(context);
          if (publisher !== true) return publisher;
          return (
            context.record.recipientIds.length > 0 || {
              code: 'noRecipients',
              message: 'Name at least one recipient.',
            }
          );
        },
        route: ({ record }) =>
          record.mode === 'confirmAll' ? 'collecting' : 'effective',
        set: ({ to, now }) => ({
          publishedAt: now.toISOString(),
          ...(to === 'effective' ? { effectiveAt: now.toISOString() } : {}),
        }),
        effects: [ensureCopies],
      },
      // Adding people while collecting widens what "everyone" means; adding
      // them once effective asks them to confirm without revoking anything.
      addRecipients: {
        title: 'Add recipients',
        from: ['collecting', 'effective'],
        to: ['collecting', 'effective'],
        route: ({ record }) => record.status,
        guard: publisherOnly,
        validate: (input) =>
          recipientsOf(input).length
            ? null
            : [{ field: 'recipientIds', message: 'Name someone to add.' }],
        set: ({ record, input }) => ({
          recipientIds: [
            ...new Set([...record.recipientIds, ...recipientsOf(input)]),
          ],
        }),
        effects: [ensureCopies],
      },
      becomeEffective: {
        title: 'Make effective',
        from: 'collecting',
        to: 'effective',
        guard: async ({ record, actor, services }) => {
          if (actor.system !== true && actor.id !== record.publisherId)
            return {
              code: 'publisherOnly',
              message: 'Only the publisher or the system can do this.',
            };
          const waiting = await awaitingConfirmation(services, record);
          return (
            waiting.length === 0 || {
              code: 'awaitingConfirmation',
              message: `Waiting for ${waiting.length} confirmation(s): ${waiting.join(', ')}.`,
            }
          );
        },
        set: ({ now }) => ({ effectiveAt: now.toISOString() }),
      },
      withdraw: {
        title: 'Withdraw',
        from: ['draft', 'collecting'],
        to: 'withdrawn',
        guard: publisherOnly,
        effects: [revokeCopies],
      },
    },
  });
