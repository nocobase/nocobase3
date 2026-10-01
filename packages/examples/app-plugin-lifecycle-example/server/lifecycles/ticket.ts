import {
  defineLifecycle,
  type Lifecycle,
  type LifecycleRecord,
  type TransitionContext,
} from '@nocobase/lifecycle';

import { person } from '../../shared/people.js';
import { LIFECYCLE_EXAMPLE_COLLECTIONS } from '../scope.js';
import type { ExampleServices } from './services.js';
import { notifyAssignee, notifyCustomer } from './ticket.effects.js';

export type TicketState = 'new' | 'open' | 'awaitingCustomer' | 'closed';

export interface Ticket extends LifecycleRecord {
  readonly subject: string;
  readonly requesterId: string;
  readonly assigneeId: string | null;
  readonly status: TicketState;
  readonly statusChangedAt: string;
  /** How many notification attempts fail on purpose. */
  readonly failNotifications: number;
}

export interface TicketTypes {
  record: Ticket;
  state: TicketState;
  parameters: { waitMinutes: number; reopenDays: number };
  services: ExampleServices;
}

type Context = TransitionContext<TicketTypes>;

function isAgent({ actor }: Context): boolean {
  return person(actor.id)?.role === 'agent';
}

function isRequester({ record, actor }: Context): boolean {
  return actor.id === record.requesterId;
}

function messageRequired(input: Record<string, unknown>): string | null {
  return typeof input.message === 'string' && input.message.trim()
    ? null
    : '请填写内容';
}

/**
 * A support ticket. An agent takes it and replies; the ticket then waits for
 * the customer, and closes itself when the customer stays silent. A customer
 * reply brings it back to the agent, and a closed ticket can be reopened for
 * a while. The conversation is the transition log: every reply is the input
 * of the transition it caused.
 */
export const ticketLifecycle: Lifecycle<TicketTypes> =
  defineLifecycle<TicketTypes>({
    name: 'tickets',
    collection: LIFECYCLE_EXAMPLE_COLLECTIONS.tickets,
    initial: 'new',
    states: ['new', 'open', 'awaitingCustomer', 'closed'],
    // A real help desk waits days; the example waits minutes so you can watch it.
    parameters: { waitMinutes: 2, reopenDays: 7 },
    transitions: {
      accept: {
        title: '受理',
        from: 'new',
        to: 'open',
        guard: isAgent,
        set: ({ actor }) => ({ assigneeId: actor.id }),
      },
      reply: {
        title: '回复客户',
        // A follow-up while waiting restarts the wait.
        from: ['new', 'open', 'awaitingCustomer'],
        to: 'awaitingCustomer',
        guard: isAgent,
        validate: messageRequired,
        // Replying to a new ticket takes it.
        set: ({ record, actor }) =>
          record.assigneeId ? {} : { assigneeId: actor.id },
        effects: [notifyCustomer],
      },
      customerReply: {
        title: '客户回复',
        from: ['new', 'open', 'awaitingCustomer'],
        to: ['new', 'open'],
        route: ({ record }) => (record.status === 'new' ? 'new' : 'open'),
        guard: isRequester,
        validate: messageRequired,
        effects: [notifyAssignee],
      },
      resolve: {
        title: '标记已解决',
        from: ['open', 'awaitingCustomer'],
        to: 'closed',
        guard: isAgent,
        set: () => ({ closedReason: 'resolved' }),
      },
      autoClose: {
        title: '超时自动关闭',
        from: 'awaitingCustomer',
        to: 'closed',
        guard: ({ actor }) => actor.system === true,
        set: () => ({ closedReason: 'timeout' }),
      },
      reopen: {
        title: '重新打开',
        from: 'closed',
        to: 'open',
        // Only the customer, and only for a while after it closed.
        guard: (context) =>
          isRequester(context) &&
          context.now.getTime() - Date.parse(context.record.statusChangedAt) <
            context.parameters.reopenDays * 86_400_000,
        validate: messageRequired,
        set: () => ({ closedReason: null }),
        effects: [notifyAssignee],
      },
    },
    triggers: {
      closeSilent: {
        transition: 'autoClose',
        when: 'awaitingCustomer',
        after: ({ waitMinutes }) => waitMinutes * 60_000,
      },
    },
  });
