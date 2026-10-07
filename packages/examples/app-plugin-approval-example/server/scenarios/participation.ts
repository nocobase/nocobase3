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

// Scenarios 22, 24, 26 and the exclusivity of 28. Each request
// waits in `approving` while its approval's run decides.

// ---------------------------------------- scenario 22: submitting for someone

export type TripState = 'draft' | 'approving' | 'approved' | 'rejected';

export interface Trip extends LifecycleRecord {
  /** Whom the trip is for: their organization picks the approver. */
  readonly applicantId: string;
  readonly createdBy: string;
  readonly submittedBy: string | null;
  readonly city: string;
  readonly status: TripState;
}

export interface TripTypes {
  record: Trip;
  state: TripState;
  services: ScenarioServices;
}

export const tripApproval: Approval<TripTypes> = defineApproval<
  TripTypes,
  'manager'
>({
  name: 'trip',
  // Self-approval is judged against the beneficiary, not the submitter.
  applicant: (record) => record.applicantId,
  directory: directoryOf,
  freeze: ['city'],
  flow: ['manager'],
  stages: {
    manager: stagesFor<TripTypes>().single({
      title: 'Manager',
      onEmpty: 'refuse',
      assignee: ({ directory, applicantId, notes }) =>
        managerChain(directory, applicantId, 1, notes),
    }),
  },
  exits: { approved: 'approve', rejected: 'reject', returned: 'return' },
});

/** Both the beneficiary and whoever submitted hear the outcome. */
const notifyParties: EffectDefinition<TripTypes> = defineEffect<TripTypes>({
  name: 'scenarioTrips.notifyParties',
  async run({ record, to, services }) {
    for (const person of new Set([
      record.applicantId,
      record.submittedBy ?? record.applicantId,
    ]))
      await services.outbox.send(
        person,
        `Trip to ${record.city} for ${record.applicantId}: ${to}`,
        `trip:${String(record.id)}:${to}:${person}`,
      );
  },
});

export const tripLifecycle: Lifecycle<TripTypes> = defineLifecycle({
  name: 'scenarioTrips',
  initial: 'draft',
  states: [
    'draft',
    tripApproval.state('approving'),
    { name: 'approved', final: true },
    { name: 'rejected', final: true },
  ],
  transitions: {
    submit: {
      from: 'draft',
      to: 'approving',
      guard: ({ record, actor, services }) =>
        actor.id === record.applicantId ||
        services.org.canProxyFor(actor.id, record.applicantId) || {
          code: 'notApplicant',
          message: `${actor.id} may not submit for ${record.applicantId}.`,
        },
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
    approve: { from: 'approving', to: 'approved', manual: false },
    reject: { from: 'approving', to: 'rejected', manual: false },
    return: { from: 'approving', to: 'draft', manual: false },
  },
  onEnter: { approved: [notifyParties], rejected: [notifyParties] },
});

// ---------------------------------------------- scenario 24: a candidate pool

interface Simple extends LifecycleRecord {
  readonly applicantId: string;
  readonly status: string;
}

export interface PoolTypes {
  record: Simple;
  state: 'draft' | 'approving' | 'approved' | 'rejected';
  services: ScenarioServices;
}

export const poolApproval: Approval<PoolTypes> = defineApproval<
  PoolTypes,
  'pool'
>({
  name: 'financePool',
  applicant: (record) => record.applicantId,
  directory: directoryOf,
  flow: ['pool'],
  stages: {
    pool: stagesFor<PoolTypes>().claimable({
      title: 'Finance pool',
      mustClaim: true,
      claimTimeoutHours: 24,
      candidates: ({ services }) => services.org.holders('finance'),
    }),
  },
  exits: { approved: 'approve', rejected: 'reject' },
  supervisorRole: 'poolSupervisor',
});

function plain<
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

export const poolLifecycle: Lifecycle<PoolTypes> = plain(
  'scenarioPoolRequests',
  poolApproval,
);

// -------------------------------------- scenario 26: opinions and material

export interface CounselReview extends Simple {
  readonly title: string;
}

export interface CounselTypes {
  record: CounselReview;
  state: 'draft' | 'approving' | 'approved' | 'rejected';
  services: ScenarioServices;
}

export const counselApproval: Approval<CounselTypes> = defineApproval<
  CounselTypes,
  'review'
>({
  name: 'counselReview',
  applicant: (record) => record.applicantId,
  directory: directoryOf,
  freeze: ['title'],
  flow: ['review'],
  stages: {
    review: stagesFor<CounselTypes>().single({
      title: 'Review',
      escalateAfterHours: 72,
      assignee: ({ directory, applicantId, notes }) =>
        managerChain(directory, applicantId, 1, notes),
    }),
  },
  exits: { approved: 'approve', rejected: 'reject' },
  // The reviewer keeps the decision: an opinion holds them until it comes,
  // and material comes from the applicant without returning the request.
  consultations: { blocking: true },
  materials: true,
});

export const counselLifecycle: Lifecycle<CounselTypes> = plain(
  'scenarioCounselReviews',
  counselApproval,
);

// ------------------------------- scenario 28: one open request per matter

export interface Matter extends Simple {
  /** What the request is about, such as `contract:42:priceException`. */
  readonly subjectKey: string;
}

export interface MatterTypes {
  record: Matter;
  state: 'draft' | 'approving' | 'approved' | 'rejected';
  services: ScenarioServices;
}

export const matterApproval: Approval<MatterTypes> = defineApproval<
  MatterTypes,
  'manager'
>({
  name: 'contractMatter',
  applicant: (record) => record.applicantId,
  directory: directoryOf,
  flow: ['manager'],
  stages: {
    manager: stagesFor<MatterTypes>().single({
      title: 'Manager',
      assignee: ({ directory, applicantId, notes }) =>
        managerChain(directory, applicantId, 1, notes),
    }),
  },
  exits: { approved: 'approve', rejected: 'reject' },
});

export const MATTERS = 'scenarioMatters';

export const matterLifecycle: Lifecycle<MatterTypes> = defineLifecycle({
  name: MATTERS,
  initial: 'draft',
  states: [
    'draft',
    matterApproval.state('approving'),
    { name: 'approved', final: true },
    { name: 'rejected', final: true },
  ],
  transitions: {
    submit: {
      from: 'draft',
      to: 'approving',
      guard: async ({ record, actor, services }) => {
        const own = isActor(
          actor,
          record.applicantId,
          'Only the applicant submits.',
        );
        if (own !== true) return own;
        // Read through the transaction: a business rule over its own rows.
        const busy = await services.records.list(
          MATTERS,
          (other) =>
            other.id !== record.id &&
            other.subjectKey === record.subjectKey &&
            other.status === 'approving',
        );
        return (
          busy.length === 0 || {
            kind: 'precondition',
            code: 'subjectBusy',
            message: `${record.subjectKey} already has a request under review.`,
          }
        );
      },
    },
    approve: { from: 'approving', to: 'approved', manual: false },
    reject: { from: 'approving', to: 'rejected', manual: false },
  },
});
