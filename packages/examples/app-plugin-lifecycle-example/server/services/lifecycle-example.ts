import type { DatabaseManager, RepositoryRecord } from '@nocobase/db';
import type { LifecycleRuntime } from '@nocobase/lifecycle';

import {
  parseItems,
  totalCents,
  type ExpenseItem,
} from '../../shared/expense.js';
import { person } from '../../shared/people.js';
import { PRIORITIES, TICKET_CATEGORIES } from '../../shared/ticket.js';
import { expenseLifecycle } from '../lifecycles/expense.js';
import { ticketLifecycle } from '../lifecycles/ticket.js';
import type { ExampleLifecycleName, Plain } from '../tokens.js';

/**
 * A refusal the service makes before any lifecycle is involved. `reason` is
 * stable, so a page can translate it; `message` says the same in English.
 */
export class ExampleError extends Error {
  public constructor(
    public readonly code: 'NOT_FOUND' | 'FORBIDDEN' | 'INVALID',
    public readonly reason: string,
    message: string,
  ) {
    super(message);
    this.name = 'ExampleError';
  }
}

function plain(row: Record<string, unknown>): Plain {
  const values: Plain = {};
  for (const [field, value] of Object.entries(row))
    values[field] = value instanceof Date ? value.toISOString() : value;
  return values;
}

export interface NewTicket {
  readonly subject: string;
  readonly category: string;
  readonly priority: string;
  readonly description: string;
  readonly failNotifications: number;
}

export interface ExpenseDraft {
  readonly title: string;
  readonly purpose: string;
  readonly items: readonly ExpenseItem[];
  readonly failPayments: number;
}

/**
 * The example's own operations around the runtime: creating and editing
 * records the way a form would, and reading what a page shows. Every state
 * change goes through `runtime.fire()`; nothing here writes the status.
 */
export class LifecycleExampleService {
  public constructor(
    private readonly database: DatabaseManager,
    /** The routes mount the library's record routes on it. */
    public readonly runtime: LifecycleRuntime,
    private readonly clock: () => Date = (): Date => new Date(),
  ) {}

  /** Agents see the whole queue; a customer sees their own tickets. */
  public async listTickets(actor: string): Promise<Plain[]> {
    const own = person(actor)?.role !== 'agent';
    const rows = await this.database
      .repository(ticketLifecycle.collection)
      .findMany({
        ...(own ? { filter: { requesterId: actor } } : {}),
        sort: (sort) => sort.field('id').desc(),
        limit: 100,
      });
    return rows.map(plain);
  }

  /** An applicant sees their own reports; an approver, those waiting for them. */
  public async listExpenses(
    actor: string,
    view: 'mine' | 'approvals',
  ): Promise<Plain[]> {
    const rows = await this.database
      .repository(expenseLifecycle.collection)
      .findMany({
        filter:
          view === 'mine'
            ? { applicantId: actor }
            : // Only what is waiting for a decision; a report sent back is with its applicant.
              (filter) =>
                filter.and([
                  filter.string('approverId').eq(actor),
                  filter.or([
                    filter.string('status').eq('awaitingManager'),
                    filter.string('status').eq('awaitingFinance'),
                  ]),
                ]),
        sort: (sort) => sort.field('id').desc(),
        limit: 100,
      });
    return rows.map(plain);
  }

  public async createTicket(values: NewTicket, actor: string): Promise<Plain> {
    if (person(actor)?.role !== 'customer')
      throw new ExampleError(
        'FORBIDDEN',
        'customersOnly',
        'Only a customer can file a ticket.',
      );
    if (!values.subject.trim() || !values.description.trim())
      throw new ExampleError(
        'INVALID',
        'ticketFields',
        'Give the ticket a subject and a description.',
      );
    if (!TICKET_CATEGORIES.includes(values.category))
      throw new ExampleError('INVALID', 'category', 'Choose a category.');
    if (!PRIORITIES.includes(values.priority as (typeof PRIORITIES)[number]))
      throw new ExampleError('INVALID', 'priority', 'Choose a priority.');
    return this.create(
      'tickets',
      {
        ...values,
        requesterId: actor,
        assigneeId: null,
      },
      actor,
    );
  }

  public async createExpense(
    values: ExpenseDraft,
    actor: string,
  ): Promise<Plain> {
    if (person(actor)?.role !== 'applicant')
      throw new ExampleError(
        'FORBIDDEN',
        'applicantsOnly',
        'Only an employee can file an expense report.',
      );
    return this.create(
      'expenses',
      {
        ...this.expenseValues(values),
        applicantId: actor,
        approverId: null,
      },
      actor,
    );
  }

  /** A report is edited only by its applicant, while it is a draft or sent back. */
  public async updateExpense(
    id: string,
    values: ExpenseDraft,
    actor: string,
  ): Promise<void> {
    const current = await this.database
      .repository(expenseLifecycle.collection)
      .findOne({ filter: { id: Number(id) } });
    if (!current)
      throw new ExampleError(
        'NOT_FOUND',
        'expenseMissing',
        'The expense report does not exist.',
      );
    if (current.applicantId !== actor)
      throw new ExampleError(
        'FORBIDDEN',
        'ownExpenseOnly',
        'Only the applicant can edit this report.',
      );
    if (current.status !== 'draft' && current.status !== 'needsInfo')
      throw new ExampleError(
        'INVALID',
        'expenseLocked',
        'A report under review cannot be edited; withdraw it first.',
      );
    await this.database.repository(expenseLifecycle.collection).updateMany({
      // The state and version as read: a concurrent submit wins, and this
      // edit changes nothing.
      filter: {
        id: Number(id),
        status: String(current.status),
        lifecycleVersion: Number(current.lifecycleVersion ?? 0),
      },
      values: this.expenseValues(values) as RepositoryRecord,
    });
  }

  /** The parameters the lifecycle runs with, which pages quote to their users. */
  public parameters(name: ExampleLifecycleName): object {
    return this.runtime.parameters(name);
  }

  /** Sweeps the triggers now instead of waiting for the next scheduled sweep. */
  public runTriggers(): Promise<number> {
    return this.runtime.runTriggers();
  }

  private expenseValues(values: ExpenseDraft): Plain {
    const items = parseItems(values.items);
    return {
      title: values.title,
      purpose: values.purpose,
      items,
      amountCents: totalCents(items),
      failPayments: values.failPayments,
    };
  }

  /** Created through the lifecycle, so a record's history starts at its creation. */
  private async create(
    name: ExampleLifecycleName,
    values: Plain,
    actor: string,
  ): Promise<Plain> {
    const { record } = await this.runtime.create(
      name,
      { ...values, createdAt: this.clock().toISOString() },
      { actor: { id: actor } },
    );
    return { ...record };
  }
}
