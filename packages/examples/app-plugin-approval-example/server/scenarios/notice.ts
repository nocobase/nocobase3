import {
  defineEffect,
  defineLifecycle,
  SYSTEM_ACTOR,
  type EffectDefinition,
  type GuardVerdict,
  type JsonObject,
  type Lifecycle,
  type LifecycleActor,
  type LifecycleRecord,
  type LifecycleRuntime,
  type LifecycleTransaction,
  type RecordId,
  type StateHook,
  type TransitionContext,
} from '@nocobase/lifecycle';

import {
  ApprovalError,
  rowsOf,
  type Row,
} from '@nocobase/app-plugin-approval/server';
import type { ScenarioServices } from './services.js';

// Scenario 25's notices. A policy notice is the first layer:
// draft, collecting confirmations, effective, withdrawn. Who was told and
// what each did with it — opened, confirmed, commented — is the notice's
// second layer, one acknowledgement row per recipient. Reading, commenting
// and reminders write those rows alone, so neither a reminder nor a comment
// moves the notice or anyone's page; the last confirmation the notice waits
// for makes it effective in the same transaction, at the version the
// confirmation read — so a recipient added meanwhile is never skipped.
//
// The carbon copy of an approved request is not here: it is the approval
// layer's own `copy` task, created when the run is approved.

export type NoticeState = 'draft' | 'collecting' | 'effective' | 'withdrawn';
export type NoticeMode = 'notify' | 'receipt' | 'confirmAll';
export type AcknowledgementKind = 'notify' | 'receipt' | 'confirm';

export interface Notice extends LifecycleRecord {
  readonly title: string;
  readonly publisherId: string;
  readonly mode: NoticeMode;
  readonly recipientIds: readonly string[];
  readonly publishedAt: string | null;
  readonly effectiveAt: string | null;
  readonly status: NoticeState;
}

export interface NoticeParameters {
  remindAfterHours: number;
  maxReminders: number;
  allowComments: boolean;
}

export interface NoticeTypes {
  record: Notice;
  state: NoticeState;
  parameters: NoticeParameters;
  services: ScenarioServices;
}

type Context = TransitionContext<NoticeTypes>;

export const NOTICES = 'scenarioNotices';
export const ACKNOWLEDGEMENTS = 'scenarioAcknowledgements';

export interface Comment {
  readonly authorId: string;
  readonly text: string;
  readonly at: string;
}

export interface Acknowledgement {
  readonly id: string;
  readonly noticeId: string;
  readonly recipientId: string;
  readonly kind: AcknowledgementKind;
  /** Whether the notice waits for this confirmation. */
  readonly blocking: boolean;
  readonly status: 'unread' | 'read' | 'confirmed' | 'revoked';
  readonly deliveredAt: string | null;
  readonly readAt: string | null;
  readonly confirmedAt: string | null;
  readonly reminders: number;
  readonly remindAt: string | null;
  readonly comments: readonly Comment[];
  readonly rowVersion: number;
}

function toAck(row: Row): Acknowledgement {
  return {
    id: String(row.id),
    noticeId: String(row.noticeId),
    recipientId: String(row.recipientId),
    kind: row.kind as AcknowledgementKind,
    blocking: row.blocking === true,
    status: row.status as Acknowledgement['status'],
    deliveredAt: (row.deliveredAt ?? null) as string | null,
    readAt: (row.readAt ?? null) as string | null,
    confirmedAt: (row.confirmedAt ?? null) as string | null,
    reminders: Number(row.reminders ?? 0),
    remindAt: (row.remindAt ?? null) as string | null,
    comments: (row.comments ?? []) as Comment[],
    rowVersion: Number(row.rowVersion),
  };
}

async function acknowledgements(
  tx: LifecycleTransaction,
  noticeId: string,
): Promise<Acknowledgement[]> {
  return (await rowsOf(tx.handle).find(ACKNOWLEDGEMENTS, { noticeId })).map(
    toAck,
  );
}

async function changeAck(
  tx: LifecycleTransaction,
  ack: Acknowledgement,
  values: Partial<Omit<Acknowledgement, 'id' | 'rowVersion'>>,
): Promise<void> {
  const written = await rowsOf(tx.handle).update(
    ACKNOWLEDGEMENTS,
    ack.id,
    { status: ack.status, rowVersion: ack.rowVersion },
    { ...values, rowVersion: ack.rowVersion + 1 },
  );
  if (!written)
    throw new ApprovalError(
      'CONFLICT',
      'The acknowledgement changed meanwhile.',
    );
}

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

function recipientsOf(input: JsonObject): string[] {
  const value = input.recipientIds;
  return Array.isArray(value)
    ? value.filter(
        (item): item is string => typeof item === 'string' && item !== '',
      )
    : [];
}

/**
 * Every listed person is owed one acknowledgement row: a row made while the
 * notice is collecting blocks it, one made once it is effective still asks
 * for a confirmation but holds nothing up.
 */
const ensureAcknowledgements: StateHook<NoticeTypes> = async ({
  record,
  tx,
  to,
  now,
  parameters,
}) => {
  const existing = new Set(
    (await acknowledgements(tx, String(record.id))).map(
      (ack) => ack.recipientId,
    ),
  );
  const kind = KIND_BY_MODE[record.mode];
  for (const recipientId of record.recipientIds) {
    if (existing.has(recipientId)) continue;
    await rowsOf(tx.handle).insert(ACKNOWLEDGEMENTS, {
      noticeId: String(record.id),
      recipientId,
      kind,
      blocking: to === 'collecting',
      status: 'unread',
      deliveredAt: null,
      readAt: null,
      confirmedAt: null,
      reminders: 0,
      remindAt:
        kind === 'notify'
          ? null
          : new Date(
              now.getTime() + parameters.remindAfterHours * 3_600_000,
            ).toISOString(),
      comments: [],
      rowVersion: 0,
    });
  }
};

/** Delivery is the system's fact: sent once per row, and stamped on it. */
const deliver: EffectDefinition<NoticeTypes> = defineEffect<NoticeTypes>({
  name: 'scenarioNotices.deliver',
  retry: { attempts: 3, backoffMs: 1_000 },
  run: async ({ record, services, now }) => {
    const rows = await services.records.find(ACKNOWLEDGEMENTS, {
      noticeId: String(record.id),
    });
    const delivered: string[] = [];
    for (const ack of rows.map(toAck)) {
      if (ack.deliveredAt !== null || ack.status === 'revoked') continue;
      const verb =
        ack.kind === 'confirm'
          ? 'Please confirm you have read'
          : ack.kind === 'receipt'
            ? 'Please read'
            : 'For your information';
      await services.outbox.send(
        ack.recipientId,
        `${verb}: ${record.title}`,
        `ack:${ack.id}`,
      );
      await services.records.update(ACKNOWLEDGEMENTS, ack.id, {
        deliveredAt: now.toISOString(),
      });
      delivered.push(ack.recipientId);
    }
    return { delivered };
  },
});

export const noticeLifecycle: Lifecycle<NoticeTypes> =
  defineLifecycle<NoticeTypes>({
    name: NOTICES,
    initial: 'draft',
    states: [
      'draft',
      'collecting',
      'effective',
      { name: 'withdrawn', final: true },
    ],
    parameters: { remindAfterHours: 24, maxReminders: 3, allowComments: true },
    transitions: {
      publish: {
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
      },
      // Changing who "everyone" is changes the notice, so it is a transition:
      // a confirmation decided on the old list meets the new version.
      addRecipients: {
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
      },
      // Only the acknowledgements conclude it: no page, not even the publisher's.
      becomeEffective: {
        from: 'collecting',
        to: 'effective',
        manual: false,
        set: ({ now }) => ({ effectiveAt: now.toISOString() }),
      },
      withdraw: {
        from: ['draft', 'collecting'],
        to: 'withdrawn',
        guard: publisherOnly,
      },
    },
    onEnter: { collecting: [deliver], effective: [deliver] },
    onEnterState: {
      collecting: ensureAcknowledgements,
      effective: ensureAcknowledgements,
    },
    onLeaveState: {
      // Withdrawn, the notice takes back the sight its rows granted; a
      // confirmation already given stays a fact.
      collecting: async ({ record, tx, to }) => {
        if (to !== 'withdrawn') return;
        for (const ack of await acknowledgements(tx, String(record.id)))
          if (ack.status === 'unread' || ack.status === 'read')
            await changeAck(tx, ack, { status: 'revoked', remindAt: null });
      },
    },
  });

/**
 * The recipients' side. Each operation writes its row; the confirmation the
 * notice was waiting for last also makes it effective, in the same
 * transaction, at the version it read.
 */
export class NoticeAcknowledgements {
  public constructor(private readonly runtime: LifecycleRuntime) {}

  private async own(
    tx: LifecycleTransaction,
    noticeId: RecordId,
    actor: LifecycleActor,
  ): Promise<{ notice: Notice; ack: Acknowledgement }> {
    const notice = (await tx.read(NOTICES, noticeId)) as Notice | undefined;
    const ack = (await acknowledgements(tx, String(noticeId))).find(
      (each) => each.recipientId === actor.id,
    );
    if (!notice || !ack)
      throw new ApprovalError(
        'NOT_ASSIGNEE',
        'This notice was not sent to you.',
      );
    if (ack.status === 'revoked')
      throw new ApprovalError('TASK_CLOSED', 'The notice was withdrawn.');
    return { notice, ack };
  }

  public read(
    noticeId: RecordId,
    actor: LifecycleActor,
  ): Promise<Acknowledgement> {
    return this.runtime.transaction(async (tx) => {
      const { ack } = await this.own(tx, noticeId, actor);
      // Opening it again changes nothing.
      if (ack.status !== 'unread') return ack;
      await changeAck(tx, ack, {
        status: 'read',
        readAt: tx.now.toISOString(),
        ...(ack.kind === 'confirm' ? {} : { remindAt: null }),
      });
      return (await acknowledgements(tx, String(noticeId))).find(
        (each) => each.id === ack.id,
      ) as Acknowledgement;
    });
  }

  public confirm(
    noticeId: RecordId,
    actor: LifecycleActor,
    comment?: string,
  ): Promise<Acknowledgement> {
    return this.runtime.transaction(async (tx) => {
      const { notice, ack } = await this.own(tx, noticeId, actor);
      if (ack.kind !== 'confirm')
        throw new ApprovalError(
          'INVALID_ANSWER',
          'This copy only informs; there is nothing to confirm.',
        );
      if (ack.status === 'confirmed')
        throw new ApprovalError('ALREADY_ANSWERED', 'You have confirmed it.');
      const { allowComments } = this.runtime.parameters(
        NOTICES,
      ) as NoticeParameters;
      const text = comment?.trim();
      if (text && !allowComments)
        throw new ApprovalError(
          'NOT_ALLOWED',
          'Comments are not allowed on this notice.',
        );
      const at = tx.now.toISOString();
      await changeAck(tx, ack, {
        status: 'confirmed',
        readAt: ack.readAt ?? at,
        confirmedAt: at,
        remindAt: null,
        ...(text
          ? { comments: [...ack.comments, { authorId: actor.id, text, at }] }
          : {}),
      });
      if (!ack.blocking || notice.status !== 'collecting')
        return { ...ack, status: 'confirmed' };
      const waiting = await this.waitingFor(tx, notice);
      if (!waiting.length)
        await tx.fire(NOTICES, notice.id, 'becomeEffective', {
          actor: SYSTEM_ACTOR,
          expect: { version: Number(notice.lifecycleVersion) },
        });
      return { ...ack, status: 'confirmed' };
    });
  }

  public comment(
    noticeId: RecordId,
    actor: LifecycleActor,
    text: string,
  ): Promise<void> {
    return this.runtime.transaction(async (tx) => {
      const { ack } = await this.own(tx, noticeId, actor);
      if (!(this.runtime.parameters(NOTICES) as NoticeParameters).allowComments)
        throw new ApprovalError('NOT_ALLOWED', 'Comments are not allowed.');
      if (!text.trim())
        throw new ApprovalError('REASON_REQUIRED', 'Write a comment.');
      await changeAck(tx, ack, {
        comments: [
          ...ack.comments,
          { authorId: actor.id, text: text.trim(), at: tx.now.toISOString() },
        ],
      });
    });
  }

  /** Who on the notice's list has not confirmed yet. */
  private async waitingFor(
    tx: LifecycleTransaction,
    notice: Notice,
  ): Promise<string[]> {
    const confirmed = new Set(
      (await acknowledgements(tx, String(notice.id)))
        .filter((ack) => ack.status === 'confirmed')
        .map((ack) => ack.recipientId),
    );
    return notice.recipientIds.filter((person) => !confirmed.has(person));
  }

  public waiting(noticeId: RecordId): Promise<string[]> {
    return this.runtime.transaction(async (tx) =>
      this.waitingFor(tx, (await tx.read(NOTICES, noticeId)) as Notice),
    );
  }

  public list(noticeId: RecordId): Promise<Acknowledgement[]> {
    return this.runtime.transaction((tx) =>
      acknowledgements(tx, String(noticeId)),
    );
  }

  /** Whether `viewerId` may see the notice through an acknowledgement row not revoked. */
  public canView(noticeId: RecordId, viewerId: string): Promise<boolean> {
    return this.runtime.transaction(async (tx) =>
      (await acknowledgements(tx, String(noticeId))).some(
        (ack) => ack.recipientId === viewerId && ack.status !== 'revoked',
      ),
    );
  }

  /**
   * Reminds every row past its own reminder time, once per reminder, up to
   * `maxReminders`; each row keeps its own clock. Returns how many it sent.
   */
  public remind(services: ScenarioServices): Promise<number> {
    return this.runtime.transaction(async (tx) => {
      const { remindAfterHours, maxReminders } = this.runtime.parameters(
        NOTICES,
      ) as NoticeParameters;
      const at = tx.now.toISOString();
      let sent = 0;
      for (const ack of (
        await rowsOf(tx.handle).find(ACKNOWLEDGEMENTS, {})
      ).map(toAck)) {
        if (ack.remindAt === null || ack.remindAt > at) continue;
        if (ack.status === 'confirmed' || ack.status === 'revoked') continue;
        if (ack.status === 'read' && ack.kind !== 'confirm') continue;
        if (ack.reminders >= maxReminders) continue;
        const notice = (await tx.read(NOTICES, ack.noticeId)) as Notice;
        const reminders = ack.reminders + 1;
        await changeAck(tx, ack, {
          reminders,
          remindAt:
            reminders >= maxReminders
              ? null
              : new Date(
                  tx.now.getTime() + remindAfterHours * 3_600_000,
                ).toISOString(),
        });
        tx.afterCommit(() =>
          services.outbox.send(
            ack.recipientId,
            `Reminder ${reminders}: ${notice.title}`,
            `remind:${ack.id}:${reminders}`,
          ),
        );
        sent += 1;
      }
      return sent;
    });
  }
}

/** The comments `viewerId` may read: the owner sees all, an author their own, recipients all when open to them. */
export function visibleComments(
  rows: readonly Acknowledgement[],
  viewerId: string,
  ownerId: string,
  visibility: 'owner' | 'recipients',
): Comment[] {
  const isRecipient = rows.some(
    (row) => row.recipientId === viewerId && row.status !== 'revoked',
  );
  return rows
    .flatMap((row) => row.comments)
    .filter(
      (comment) =>
        viewerId === ownerId ||
        comment.authorId === viewerId ||
        (visibility === 'recipients' && isRecipient),
    );
}
