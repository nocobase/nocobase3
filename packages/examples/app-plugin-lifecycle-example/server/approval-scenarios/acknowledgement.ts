// Scenario 25, carbon copies and read confirmations: one record per
// recipient of something they are told about. A copy grants sight of its
// source and nothing else — its transitions are reading, confirming and
// commenting, never deciding — and it keeps delivery (an effect and
// `deliveredAt`) apart from the recipient's own acknowledgement (`read`,
// `confirmed`).
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

import {
  SCENARIO_COLLECTIONS,
  type RecordAccess,
  type ScenarioServices,
} from './services.js';

export type AcknowledgementState =
  'unread' | 'delivered' | 'read' | 'confirmed' | 'revoked';

/**
 * What a copy asks of its recipient: `notify` nothing, `receipt` that they
 * open it (and they are reminded until they do), `confirm` that they state
 * they have read it.
 */
export type AcknowledgementKind = 'notify' | 'receipt' | 'confirm';

export interface AcknowledgementComment {
  readonly authorId: string;
  readonly text: string;
  readonly at: string;
}

export interface Acknowledgement extends LifecycleRecord {
  readonly sourceLifecycle: string;
  readonly sourceId: string;
  readonly recipientId: string;
  readonly title: string;
  /** Whether the source waits for this confirmation before it continues. */
  readonly blocking: boolean;
  /** Defaults to `confirm` for a blocking copy and `notify` otherwise. */
  readonly kind?: AcknowledgementKind;
  readonly deliveredAt?: string | null;
  readonly readAt?: string | null;
  readonly confirmedAt?: string | null;
  readonly reminders?: number;
  readonly comments?: readonly AcknowledgementComment[];
  readonly status: AcknowledgementState;
  readonly statusChangedAt: string;
}

export interface AcknowledgementParameters {
  /** Idle time in `delivered` (or `read`, for a confirmation) before a reminder. */
  remindAfterHours: number;
  maxReminders: number;
  allowComments: boolean;
  /** `owner`: only the source's owner and the comment's author see it; `recipients`: every recipient too. */
  commentVisibility: 'owner' | 'recipients';
}

export interface AcknowledgementTypes {
  record: Acknowledgement;
  state: AcknowledgementState;
  parameters: AcknowledgementParameters;
  services: ScenarioServices;
}

type Context = TransitionContext<AcknowledgementTypes>;

export function kindOf(record: Acknowledgement): AcknowledgementKind {
  return record.kind ?? (record.blocking ? 'confirm' : 'notify');
}

function recipientOnly({ record, actor }: Context): GuardVerdict {
  return (
    actor.id === record.recipientId || {
      code: 'recipientOnly',
      message: 'Only the recipient of this copy can do this.',
    }
  );
}

function systemOnly({ actor }: Context): GuardVerdict {
  return (
    actor.system === true || {
      code: 'systemOnly',
      message: 'Only the system does this.',
    }
  );
}

function commentText(input: Record<string, unknown>): string | undefined {
  return typeof input.comment === 'string' && input.comment.trim()
    ? input.comment.trim()
    : undefined;
}

const deliver: EffectDefinition<AcknowledgementTypes> =
  defineEffect<AcknowledgementTypes>({
    name: 'acknowledgements.deliver',
    retry: { attempts: 3, backoffMs: 1_000, factor: 2 },
    onSuccess: 'markDelivered',
    run: async ({ record, idempotencyKey, services }) => {
      const verb =
        kindOf(record) === 'confirm'
          ? 'Please confirm you have read'
          : kindOf(record) === 'receipt'
            ? 'Please read'
            : 'For your information';
      await services.outbox.send(
        record.recipientId,
        `${verb}: ${record.title}`,
        idempotencyKey,
      );
      return { deliveredTo: record.recipientId };
    },
  });

const sendReminder: EffectDefinition<AcknowledgementTypes> =
  defineEffect<AcknowledgementTypes>({
    name: 'acknowledgements.sendReminder',
    retry: { attempts: 3, backoffMs: 1_000 },
    run: async ({ record, idempotencyKey, services }) => {
      await services.outbox.send(
        record.recipientId,
        `Reminder ${record.reminders ?? 0}: ${record.title}`,
        idempotencyKey,
      );
    },
  });

/**
 * A blocking confirmation tells its source. Only notices wait on copies;
 * a copy of an approval request never blocks it. The notice decides for
 * itself, in its own transaction, whether everyone has now confirmed.
 */
const notifySource: EffectDefinition<AcknowledgementTypes> =
  defineEffect<AcknowledgementTypes>({
    name: 'acknowledgements.notifySource',
    // A CONFLICT means the notice changed while this was decided — a
    // recipient was added, another confirmation landed: look again.
    retry: { attempts: 3, backoffMs: 500 },
    run: async ({ record, services }) => {
      if (!record.blocking || record.sourceLifecycle !== 'notices')
        return { told: false };
      try {
        await services.lifecycles.fire(
          'notices',
          record.sourceId,
          'becomeEffective',
          { actor: SYSTEM_ACTOR },
        );
        return { told: true, effective: true };
      } catch (error) {
        if (
          error instanceof LifecycleError &&
          (error.code === 'INVALID_STATE' || error.code === 'GUARD_REJECTED')
        )
          return { told: true, effective: false, reason: error.code };
        throw error;
      }
    },
  });

/**
 * One carbon copy or read confirmation. Created through `runtime.create()`
 * — by the approval lifecycle after approval, or by a notice — so the
 * initial `onEnter` delivers it.
 */
export const acknowledgementLifecycle: Lifecycle<AcknowledgementTypes> =
  defineLifecycle<AcknowledgementTypes>({
    name: 'acknowledgements',
    collection: SCENARIO_COLLECTIONS.acknowledgements,
    initial: 'unread',
    states: [
      'unread',
      'delivered',
      'read',
      { name: 'confirmed', final: true },
      { name: 'revoked', final: true },
    ],
    parameters: {
      remindAfterHours: 24,
      maxReminders: 3,
      allowComments: true,
      commentVisibility: 'owner',
    },
    transitions: {
      // Delivery is the system's fact, not the recipient's: it moves the
      // copy only while nobody has read it yet.
      markDelivered: {
        title: 'Delivered',
        from: 'unread',
        to: 'delivered',
        guard: systemOnly,
        set: ({ now }) => ({ deliveredAt: now.toISOString() }),
      },
      read: {
        title: 'Mark as read',
        from: ['unread', 'delivered'],
        to: 'read',
        guard: recipientOnly,
        set: ({ now }) => ({ readAt: now.toISOString() }),
      },
      confirm: {
        title: 'Confirm I have read it',
        from: ['unread', 'delivered', 'read'],
        to: 'confirmed',
        guard: (context) => {
          const recipient = recipientOnly(context);
          if (recipient !== true) return recipient;
          return (
            kindOf(context.record) === 'confirm' || {
              code: 'nothingToConfirm',
              message: 'This copy only informs; there is nothing to confirm.',
            }
          );
        },
        set: ({ record, actor, input, parameters, now }) => {
          const at = now.toISOString();
          const text = commentText(input);
          if (text !== undefined && !parameters.allowComments)
            throw new LifecycleError(
              'INVALID_INPUT',
              'Comments are not allowed on this copy.',
            );
          return {
            readAt: record.readAt ?? at,
            confirmedAt: at,
            ...(text === undefined
              ? {}
              : {
                  comments: [
                    ...(record.comments ?? []),
                    { authorId: actor.id, text, at },
                  ],
                }),
          };
        },
        effects: [notifySource],
      },
      comment: {
        title: 'Comment',
        from: 'read',
        to: 'read',
        guard: (context) =>
          context.parameters.allowComments
            ? recipientOnly(context)
            : { code: 'commentsOff', message: 'Comments are not allowed.' },
        validate: (input) =>
          commentText(input) === undefined
            ? [{ field: 'comment', message: 'Write a comment.' }]
            : null,
        set: ({ record, actor, input, now }) => ({
          comments: [
            ...(record.comments ?? []),
            {
              authorId: actor.id,
              text: commentText(input) ?? '',
              at: now.toISOString(),
            },
          ],
        }),
      },
      // A reminder is a self-transition, so every one restarts the idle
      // time and the next comes `remindAfterHours` later.
      remind: {
        title: 'Remind',
        from: ['delivered', 'read'],
        to: ['delivered', 'read'],
        route: ({ record }) =>
          record.status === 'read' ? 'read' : 'delivered',
        guard: (context) => {
          const system = systemOnly(context);
          if (system !== true) return system;
          const { record, parameters } = context;
          const kind = kindOf(record);
          if (kind === 'notify')
            return { code: 'notifyOnly', message: 'Nothing is owed.' };
          if (record.status === 'read' && kind !== 'confirm')
            return { code: 'alreadyRead', message: 'It has been read.' };
          return (
            (record.reminders ?? 0) < parameters.maxReminders || {
              code: 'remindersExhausted',
              message: 'Every reminder has been sent.',
            }
          );
        },
        set: ({ record }) => ({ reminders: (record.reminders ?? 0) + 1 }),
        effects: [sendReminder],
      },
      // The source was withdrawn: the copy no longer grants sight of it.
      revoke: {
        title: 'Revoke',
        from: ['unread', 'delivered', 'read'],
        to: 'revoked',
        guard: systemOnly,
      },
    },
    onEnter: { unread: [deliver] },
    triggers: {
      remindIdle: {
        transition: 'remind',
        when: ['delivered', 'read'],
        after: ({ remindAfterHours }) => remindAfterHours * 3_600_000,
      },
    },
  });

/**
 * Whether `viewerId` may see the source through a copy: any copy of it
 * addressed to them that has not been revoked. Sight only — a copy is never
 * consulted for who may decide.
 */
export async function canViewSource(
  records: RecordAccess,
  viewerId: string,
  sourceLifecycle: string,
  sourceId: string,
): Promise<boolean> {
  const copies = await records.list(
    SCENARIO_COLLECTIONS.acknowledgements,
    (row) =>
      row.sourceLifecycle === sourceLifecycle &&
      row.sourceId === sourceId &&
      row.recipientId === viewerId &&
      row.status !== 'revoked',
  );
  return copies.length > 0;
}

/** The comments on a source's copies that `viewerId` may read. */
export function visibleComments(
  copies: readonly Acknowledgement[],
  viewerId: string,
  ownerId: string,
  visibility: AcknowledgementParameters['commentVisibility'],
): AcknowledgementComment[] {
  const isRecipient = copies.some(
    (copy) => copy.recipientId === viewerId && copy.status !== 'revoked',
  );
  return copies
    .flatMap((copy) => copy.comments ?? [])
    .filter(
      (comment) =>
        viewerId === ownerId ||
        comment.authorId === viewerId ||
        (visibility === 'recipients' && isRecipient),
    );
}
