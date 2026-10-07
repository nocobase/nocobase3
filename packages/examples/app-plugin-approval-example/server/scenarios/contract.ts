import {
  defineEffect,
  defineLifecycle,
  type EffectDefinition,
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

// A contract approval with four stages, a countersignature and a pool. The
// contract waits in `approving` and knows only how a run
// ends — approved, rejected, or returned to the applicant — and where each
// end leads. The approval declares the stages, who decides each, how their
// answers add up and where returns may go; they are the states of the run,
// a record of its own, and every person's part is a task row. Added
// signers, transfers, claims and escalation are task operations.
//
//   draft → approving → approved | rejected, or returned to draft
//
//   the run: managerApproval → countersign → procurement → (ceoApproval)
//
// Any reviewer may return it to the applicant or to an earlier stage, and
// ask to come straight back once it is decided again.

export type ContractState = 'draft' | 'approving' | 'approved' | 'rejected';

export interface Contract extends LifecycleRecord {
  readonly applicantId: string;
  readonly title: string;
  readonly amount: number;
  readonly status: ContractState;
}

export interface ContractTypes {
  record: Contract;
  state: ContractState;
  parameters: { ceoThreshold: number };
  services: ScenarioServices;
}

const stage = stagesFor<ContractTypes>();

export const contractApproval: Approval<ContractTypes> = defineApproval<
  ContractTypes,
  'managerApproval' | 'countersign' | 'procurement' | 'ceoApproval'
>({
  name: 'contract',
  applicant: (record) => record.applicantId,
  directory: directoryOf,
  freeze: ['title', 'amount'],
  flow: ['managerApproval', 'countersign', 'procurement', 'ceoApproval'],
  stages: {
    managerApproval: stage.single({
      title: 'Manager',
      onEmpty: 'refuse',
      escalateAfterHours: 48,
      assignee: ({ directory, applicantId, notes }) =>
        managerChain(directory, applicantId, 1, notes),
    }),
    countersign: stage.all({
      title: 'Legal and finance',
      assignees: ({ services }) => [
        ...services.org.holders('legal'),
        ...services.org.holders('finance'),
      ],
    }),
    procurement: stage.claimable({
      title: 'Procurement',
      mustClaim: false,
      claimTimeoutHours: 24,
      candidates: ({ services }) => services.org.holders('procurement'),
    }),
    ceoApproval: stage.single({
      title: 'CEO',
      when: ({ record, parameters }) => record.amount > parameters.ceoThreshold,
      escalateAfterHours: 48,
      assignee: ({ services }) => services.org.holderOf('ceo'),
    }),
  },
  exits: { approved: 'approve', rejected: 'reject', returned: 'return' },
  returns: { earlier: true, resume: true },
  signers: { modes: ['before', 'after', 'alongside'], maxDepth: 1 },
  notify: ({ task, services }) =>
    services.outbox.send(
      task.assigneeId,
      `Contract ${task.recordId} awaits you (${task.stage})`,
      `task:${task.id}`,
    ),
});

/** Tells the applicant where their contract ended up: once per entry. */
const notifyApplicant: EffectDefinition<ContractTypes> =
  defineEffect<ContractTypes>({
    name: 'scenarioContracts.notifyApplicant',
    retry: { attempts: 3 },
    async run({ record, from, to, services, idempotencyKey }) {
      if (from === null) return;
      await services.outbox.send(
        record.applicantId,
        `Contract ${String(record.id)}: ${to}`,
        idempotencyKey,
      );
    },
  });

export const contractLifecycle: Lifecycle<ContractTypes> = defineLifecycle({
  name: 'scenarioContracts',
  initial: 'draft',
  states: [
    'draft',
    contractApproval.state('approving'),
    { name: 'approved', final: true },
    { name: 'rejected', final: true },
  ],
  parameters: { ceoThreshold: 100_000 },
  transitions: {
    submit: {
      from: 'draft',
      to: 'approving',
      guard: ({ record, actor }) =>
        isActor(actor, record.applicantId, 'Only the applicant submits.'),
    },
    withdraw: {
      from: 'approving',
      to: 'draft',
      guard: ({ record, actor }) =>
        isActor(actor, record.applicantId, 'Only the applicant withdraws.'),
    },
    approve: {
      from: 'approving',
      to: 'approved',
      manual: false,
      set: contractApproval.settle,
    },
    reject: { from: 'approving', to: 'rejected', manual: false },
    return: {
      from: 'approving',
      to: 'draft',
      manual: false,
      set: contractApproval.settle,
    },
  },
  onEnter: {
    draft: [notifyApplicant],
    approved: [notifyApplicant],
    rejected: [notifyApplicant],
  },
});

// Scenarios 11–13 and 21: a contract review whose stages each cover some of
// the content. Legal may propose changes to the content; a change is the
// run's until the run ends, and a change to what an earlier stage covered
// sends the request back there. Approved or returned, the changes are
// written to the record. Returned to the applicant and resubmitted, an
// approval whose covered fields did not change is kept (`keep: 'valid'`), or
// everything is decided again (`full`).

export type ReviewState = 'draft' | 'approving' | 'approved' | 'rejected';

export interface ContractReview extends LifecycleRecord {
  readonly applicantId: string;
  readonly submittedBy: string | null;
  readonly party: string;
  readonly amount: number;
  readonly terms: string;
  readonly status: ReviewState;
}

export interface ReviewTypes {
  record: ContractReview;
  state: ReviewState;
  services: ScenarioServices;
}

const review = stagesFor<ReviewTypes>();

function reviewApproval(
  name: string,
  keep: 'valid' | 'none',
): Approval<ReviewTypes> {
  return defineApproval<ReviewTypes, 'manager' | 'legal' | 'finance' | 'ceo'>({
    name,
    applicant: (record) => record.applicantId,
    directory: directoryOf,
    freeze: ['party', 'amount', 'terms'],
    flow: ['manager', 'legal', 'finance', 'ceo'],
    stages: {
      manager: review.single({
        title: 'Manager',
        covers: ['party', 'amount'],
        assignee: ({ directory, applicantId, notes }) =>
          managerChain(directory, applicantId, 1, notes),
      }),
      legal: review.single({
        title: 'Legal',
        covers: ['party', 'terms'],
        canRevise: ['party', 'amount', 'terms'],
        assignee: () => 'legalA',
      }),
      finance: review.single({
        title: 'Finance',
        covers: ['amount'],
        assignee: () => 'finA',
      }),
      ceo: review.single({
        title: 'CEO',
        when: () => keep === 'valid',
        assignee: ({ services }) => services.org.holderOf('ceo'),
      }),
    },
    exits: { approved: 'approve', rejected: 'reject', returned: 'return' },
    returns: { earlier: true },
    resubmit: { keep },
    copies: () => ['wang'],
  });
}

function reviewLifecycle(
  name: string,
  approval: Approval<ReviewTypes>,
): Lifecycle<ReviewTypes> {
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
      // The content changes only while it is a draft.
      edit: {
        from: 'draft',
        to: 'draft',
        guard: ({ record, actor }) =>
          isActor(actor, record.applicantId, 'Only the applicant edits.'),
        accept: ['party', 'amount', 'terms'],
      },
      submit: {
        from: 'draft',
        to: 'approving',
        guard: ({ record, actor }) =>
          isActor(actor, record.applicantId, 'Only the applicant submits.'),
        set: ({ actor }) => ({ submittedBy: actor.id }),
      },
      withdraw: {
        from: 'approving',
        to: 'draft',
        guard: ({ record, actor }) =>
          actor.id === record.applicantId ||
          actor.id === record.submittedBy || {
            code: 'notAllowed',
            message: 'Only the applicant or the submitter withdraws.',
          },
      },
      // How a run ends; what the run's stages changed is written here.
      approve: {
        from: 'approving',
        to: 'approved',
        manual: false,
        set: approval.settle,
      },
      reject: { from: 'approving', to: 'rejected', manual: false },
      return: {
        from: 'approving',
        to: 'draft',
        manual: false,
        set: approval.settle,
      },
    },
  });
}

export const reviewKeepingApproval: Approval<ReviewTypes> = reviewApproval(
  'contractReview',
  'valid',
);
export const reviewKeepingLifecycle: Lifecycle<ReviewTypes> = reviewLifecycle(
  'scenarioContractReviews',
  reviewKeepingApproval,
);
export const reviewFullApproval: Approval<ReviewTypes> = reviewApproval(
  'contractFullReview',
  'none',
);
export const reviewFullLifecycle: Lifecycle<ReviewTypes> = reviewLifecycle(
  'scenarioContractFullReviews',
  reviewFullApproval,
);
