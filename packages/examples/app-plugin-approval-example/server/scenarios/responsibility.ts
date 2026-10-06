import {
  defineLifecycle,
  type Lifecycle,
  type LifecycleRecord,
} from '@nocobase/lifecycle';

import {
  defineApproval,
  managerChain,
  stagesFor,
  type Approval,
} from '@nocobase/app-plugin-approval/server';
import { directoryOf, isActor, type ScenarioServices } from './services.js';

// Scenarios 14–16. Handing over, adding signers, deciding as a
// delegate and reassigning are operations on task rows: the record stays in
// its stage, its version and clock do not move, and the history of who held
// a task and why is the chain of rows each new one names its predecessor in.

interface Simple extends LifecycleRecord {
  readonly applicantId: string;
  readonly status: string;
}

function simpleLifecycle<
  T extends { record: Simple; state: string; services: ScenarioServices },
>(name: string, approval: Approval<T>): Lifecycle<T> {
  return defineLifecycle({
    name,
    initial: 'draft',
    states: [
      'draft',
      approval.state('approving'),
      { name: 'approved', final: true },
      { name: 'rejected', final: true },
    ],
    transitions: {
      submit: {
        from: 'draft',
        to: 'approving',
        guard: ({ record, actor }) =>
          isActor(actor, record.applicantId, 'Only the applicant submits.'),
      },
      approve: { from: 'approving', to: 'approved', manual: false },
      reject: { from: 'approving', to: 'rejected', manual: false },
    },
  });
}

// ------------------------------------------------- scenario 14: legal review

export interface LegalReviewTypes {
  record: Simple;
  state: 'draft' | 'approving' | 'approved' | 'rejected';
  services: ScenarioServices;
}

const legal = stagesFor<LegalReviewTypes>();

export const legalReviewApproval: Approval<LegalReviewTypes> = defineApproval<
  LegalReviewTypes,
  'legal' | 'legalLead'
>({
  name: 'legalReview',
  applicant: (record) => record.applicantId,
  directory: directoryOf,
  flow: ['legal', 'legalLead'],
  stages: {
    legal: legal.single({ title: 'Legal', assignee: () => 'legalA' }),
    legalLead: legal.single({
      title: 'Legal lead',
      assignee: ({ services }) => services.org.holderOf('legalLead'),
    }),
  },
  exits: { approved: 'approve', rejected: 'reject' },
  // An added signer may not add another.
  signers: { modes: ['before', 'after', 'alongside'], maxDepth: 1 },
});

export const legalReviewLifecycle: Lifecycle<LegalReviewTypes> =
  simpleLifecycle('scenarioLegalReviews', legalReviewApproval);

// ------------------------------------- scenarios 15, 16: expenses, payments

export interface ExpenseTypes {
  record: Simple;
  state: 'draft' | 'approving' | 'approved' | 'rejected';
  services: ScenarioServices;
}

export const expenseApproval: Approval<ExpenseTypes> = defineApproval<
  ExpenseTypes,
  'manager'
>({
  name: 'expense',
  applicant: (record) => record.applicantId,
  directory: directoryOf,
  flow: ['manager'],
  stages: {
    manager: stagesFor<ExpenseTypes>().single({
      title: 'Manager',
      escalateAfterHours: 72,
      assignee: ({ directory, applicantId, notes }) =>
        managerChain(directory, applicantId, 1, notes),
    }),
  },
  exits: { approved: 'approve', rejected: 'reject' },
});

export const expenseLifecycle: Lifecycle<ExpenseTypes> = simpleLifecycle(
  'scenarioExpenses',
  expenseApproval,
);

export interface PaymentApprovalTypes {
  record: Simple;
  state: 'draft' | 'approving' | 'approved' | 'rejected';
  services: ScenarioServices;
}

export const paymentApproval: Approval<PaymentApprovalTypes> = defineApproval<
  PaymentApprovalTypes,
  'finance'
>({
  name: 'paymentApproval',
  applicant: (record) => record.applicantId,
  directory: directoryOf,
  flow: ['finance'],
  stages: {
    finance: stagesFor<PaymentApprovalTypes>().single({
      title: 'Finance',
      qualification: 'finance',
      assignee: () => 'finA',
    }),
  },
  exits: { approved: 'approve', rejected: 'reject' },
  adminRole: 'approvalAdmin',
});

export const paymentApprovalLifecycle: Lifecycle<PaymentApprovalTypes> =
  simpleLifecycle('scenarioPaymentApprovals', paymentApproval);
