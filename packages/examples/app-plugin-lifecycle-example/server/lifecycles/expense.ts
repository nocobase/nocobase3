import {
  defineLifecycle,
  LifecycleError,
  type Lifecycle,
  type LifecycleRecord,
  type TransitionContext,
} from '@nocobase/lifecycle';

import { itemProblems, parseItems } from '../../shared/expense.js';
import { FINANCE_DIRECTOR, MANAGERS } from '../../shared/people.js';
import { text } from '../../shared/text.js';
import { LIFECYCLE_EXAMPLE_COLLECTIONS } from '../scope.js';
import {
  notifyApplicant,
  notifyApprover,
  requestPayment,
} from './expense.effects.js';
import type { ExampleServices } from './services.js';

export type ExpenseState =
  | 'draft'
  | 'awaitingManager'
  | 'awaitingFinance'
  | 'needsInfo'
  | 'approved'
  | 'rejected'
  | 'paid';

export interface Expense extends LifecycleRecord {
  readonly title: string;
  readonly applicantId: string;
  readonly amountCents: number;
  readonly approverId: string | null;
  readonly status: ExpenseState;
  readonly statusChangedAt: string;
  /** How many payment attempts fail on purpose. */
  readonly failPayments: number;
}

export interface ExpenseTypes {
  record: Expense;
  state: ExpenseState;
  /** Limits in yuan; the record holds cents. */
  parameters: {
    autoApproveLimit: number;
    financeLimit: number;
    escalateAfterMinutes: number;
  };
  services: ExampleServices;
}

type Context = TransitionContext<ExpenseTypes>;

// Submitting and resubmitting after more information share one rule.
function routeByAmount({ record, parameters }: Context): ExpenseState {
  return record.amountCents <= parameters.autoApproveLimit * 100
    ? 'approved'
    : 'awaitingManager';
}

function isApplicant({ record, actor }: Context): boolean {
  return actor.id === record.applicantId;
}

function isApprover({ record, actor }: Context): boolean {
  return actor.id === record.approverId;
}

/** A report with no items, or an item without a date, cannot be submitted. */
function readyToSubmit({ record }: Context): Record<string, unknown> {
  const problems = [
    ...(record.title.trim() ? [] : ['请填写报销事由']),
    ...itemProblems(parseItems(record.items)),
  ];
  if (problems.length)
    throw new LifecycleError('INVALID_INPUT', problems.join('；'));
  return { approverId: MANAGERS[record.applicantId] ?? FINANCE_DIRECTOR };
}

function reasonRequired(input: Record<string, unknown>): string | null {
  return typeof input.reason === 'string' && input.reason.trim()
    ? null
    : '请填写原因';
}

/**
 * An expense report. Up to 5,000 yuan is approved automatically; above it
 * the applicant's manager approves, and above 50,000 the finance director
 * too. An approver may reject it or send it back for more information, the
 * applicant may withdraw it while it waits, and a manager who does nothing
 * for a while is passed over for theirs. An approved report is paid, and
 * marked paid with the payment's reference.
 */
export const expenseLifecycle: Lifecycle<ExpenseTypes> =
  defineLifecycle<ExpenseTypes>({
    name: 'expenses',
    collection: LIFECYCLE_EXAMPLE_COLLECTIONS.expenses,
    initial: 'draft',
    states: [
      'draft',
      'awaitingManager',
      'awaitingFinance',
      'needsInfo',
      'approved',
      'rejected',
      'paid',
    ],
    // A real approval escalates after days; the example after minutes.
    parameters: {
      autoApproveLimit: 5000,
      financeLimit: 50000,
      escalateAfterMinutes: 3,
    },
    transitions: {
      submit: {
        title: '提交',
        from: 'draft',
        to: ['approved', 'awaitingManager'],
        route: routeByAmount,
        guard: isApplicant,
        set: readyToSubmit,
      },
      approve: {
        title: '通过',
        from: ['awaitingManager', 'awaitingFinance'],
        to: ['approved', 'awaitingFinance'],
        route: ({ record, parameters }) =>
          record.status === 'awaitingManager' &&
          record.amountCents > parameters.financeLimit * 100
            ? 'awaitingFinance'
            : 'approved',
        guard: isApprover,
        set: ({ to }) => ({
          approverId: to === 'awaitingFinance' ? FINANCE_DIRECTOR : null,
        }),
      },
      reject: {
        title: '驳回',
        from: ['awaitingManager', 'awaitingFinance'],
        to: 'rejected',
        guard: isApprover,
        validate: reasonRequired,
        set: () => ({ approverId: null }),
        effects: [notifyApplicant],
      },
      requestInfo: {
        title: '退回补充',
        from: ['awaitingManager', 'awaitingFinance'],
        to: 'needsInfo',
        guard: isApprover,
        validate: reasonRequired,
        // Back with the applicant; resubmitting picks the approver again.
        set: () => ({ approverId: null }),
        effects: [notifyApplicant],
      },
      resubmit: {
        title: '重新提交',
        from: 'needsInfo',
        to: ['approved', 'awaitingManager'],
        route: routeByAmount,
        guard: isApplicant,
        set: readyToSubmit,
      },
      withdraw: {
        title: '撤回',
        from: ['awaitingManager', 'awaitingFinance', 'needsInfo'],
        to: 'draft',
        guard: isApplicant,
        set: () => ({ approverId: null }),
      },
      escalate: {
        title: '超时升级',
        // A self-transition: the state stays, the approver changes, and the
        // wait starts again because every transition stamps statusChangedAt.
        from: 'awaitingManager',
        to: 'awaitingManager',
        guard: ({ record, actor }) =>
          actor.system === true &&
          MANAGERS[text(record.approverId)] !== undefined,
        set: ({ record }) => ({
          approverId: MANAGERS[text(record.approverId)],
        }),
      },
      paid: {
        title: '付款完成',
        from: 'approved',
        to: 'paid',
        guard: ({ actor }) => actor.system === true,
        // The input is what the payment effect returned.
        set: ({ input }) => ({ paymentRef: text(input.paymentRef) || null }),
      },
    },
    // Whichever transition enters the state, these run.
    onEnter: {
      awaitingManager: [notifyApprover],
      awaitingFinance: [notifyApprover],
      approved: [notifyApplicant, requestPayment],
    },
    triggers: {
      escalateStale: {
        transition: 'escalate',
        when: 'awaitingManager',
        after: ({ escalateAfterMinutes }) => escalateAfterMinutes * 60_000,
      },
    },
  });
