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
import {
  directoryOf,
  isActor,
  systemOnly,
  SCENARIO_COLLECTIONS,
  type ScenarioServices,
} from './services.js';

// Scenarios 1 and 2. The leave request is the first layer: it
// waits in `approving` while an approval run — a record of its own, whose
// states are the stages — asks the people of each stage, and moves on only
// when the run ends. What the request has of its own — registering the
// approved leave with HR — stays a plain lifecycle concern.
//
//   draft → approving → approved → registered
//                     ↘ rejected   ↘ registrationFailed → (HR retries) approved
//
//   the run: manager → (deptManager → hr, above three days) → approved | rejected

export type LeaveState =
  | 'draft'
  | 'approving'
  | 'approved'
  | 'registrationFailed'
  | 'registered'
  | 'rejected';

export interface LeaveRequest extends LifecycleRecord {
  readonly applicantId: string;
  readonly days: number;
  readonly reason: string;
  readonly registrationRef: string | null;
  readonly status: LeaveState;
}

export interface LeaveTypes {
  record: LeaveRequest;
  state: LeaveState;
  services: ScenarioServices;
}

/** The role that retries a failed registration. */
export const HR_ROLE: string = 'hr';

const stage = stagesFor<LeaveTypes>();

const longLeave = ({ record }: { record: LeaveRequest }): boolean =>
  record.days > 3;

const why = ({
  record,
  included,
}: {
  record: LeaveRequest;
  included: boolean;
}): string => `${record.days} days ${included ? '>' : '≤'} 3`;

export const leaveApproval: Approval<LeaveTypes> = defineApproval<
  LeaveTypes,
  'manager' | 'deptManager' | 'hr'
>({
  name: 'leave',
  applicant: (record) => record.applicantId,
  directory: directoryOf,
  freeze: ['days', 'reason'],
  flow: ['manager', 'deptManager', 'hr'],
  stages: {
    // No manager is never an approval: the submission is refused.
    manager: stage.single({
      title: 'Manager',
      onEmpty: 'refuse',
      assignee: ({ directory, applicantId, notes }) =>
        managerChain(directory, applicantId, 1, notes),
    }),
    deptManager: stage.single({
      title: 'Department manager',
      when: longLeave,
      because: why,
      assignee: ({ directory, applicantId, notes }) =>
        managerChain(directory, applicantId, 2, notes),
    }),
    hr: stage.single({
      title: 'HR',
      when: longLeave,
      because: why,
      assignee: ({ services }) => services.org.holderOf(HR_ROLE),
    }),
  },
  exits: { approved: 'approve', rejected: 'reject' },
  adminRole: 'approvalAdmin',
  notify: ({ task, services }) =>
    services.outbox.send(
      task.assigneeId,
      `Leave request ${task.recordId} awaits you`,
      `task:${task.id}`,
    ),
});

/** Tells the applicant once per decision, however often a state is entered. */
const notifyApplicant: EffectDefinition<LeaveTypes> = defineEffect<LeaveTypes>({
  name: 'scenarioLeaves.notifyApplicant',
  retry: { attempts: 3 },
  async run({ record, to, services }) {
    await services.outbox.send(
      record.applicantId,
      `Leave request ${String(record.id)}: ${to}`,
      `leave:${String(record.id)}:${to}`,
    );
  },
});

/** Keyed per request: a retry re-enters `approved` and must not register twice. */
const registerLeave: EffectDefinition<LeaveTypes> = defineEffect<LeaveTypes>({
  name: 'scenarioLeaves.registerLeave',
  retry: { attempts: 2 },
  onSuccess: 'registrationSucceeded',
  onFailure: 'registrationFailed',
  async run({ record, services }) {
    const key = `leave-registration:${String(record.id)}`;
    await services.external.runOnboardingStep(key, 'registerLeave');
    return { registrationRef: key };
  },
});

export const leaveLifecycle: Lifecycle<LeaveTypes> = defineLifecycle({
  name: 'scenarioLeaves',
  collection: SCENARIO_COLLECTIONS.leaveRequests,
  initial: 'draft',
  states: [
    'draft',
    leaveApproval.state('approving'),
    'approved',
    'registrationFailed',
    { name: 'registered', final: true },
    // A rejection is kept as it is; asking again is a new request.
    { name: 'rejected', final: true },
  ],
  transitions: {
    submit: {
      from: 'draft',
      to: 'approving',
      guard: ({ record, actor, services }) => {
        const own = isActor(
          actor,
          record.applicantId,
          'Only the applicant can submit this request.',
        );
        if (own !== true) return own;
        return (
          services.org.isActive(actor.id) ||
          'The applicant is no longer active.'
        );
      },
    },
    // The run's ends: only the approval fires them.
    approve: {
      from: 'approving',
      to: 'approved',
      manual: false,
      set: leaveApproval.settle,
    },
    reject: { from: 'approving', to: 'rejected', manual: false },
    registrationSucceeded: {
      from: 'approved',
      to: 'registered',
      guard: ({ actor }) => systemOnly(actor),
      accept: ['registrationRef'],
      manual: false,
    },
    registrationFailed: {
      from: 'approved',
      to: 'registrationFailed',
      guard: ({ actor }) => systemOnly(actor),
      manual: false,
    },
    retryRegistration: {
      from: 'registrationFailed',
      to: 'approved',
      guard: ({ actor, services }) =>
        services.org.hasRole(actor.id, HR_ROLE) || {
          code: 'hrOnly',
          message: 'Only HR retries a registration.',
        },
    },
  },
  onEnter: {
    approved: [notifyApplicant, registerLeave],
    rejected: [notifyApplicant],
  },
});

// Scenario 2, the explicit rule: compensatory leave of a day or less needs
// nobody, and the run says which rule let it through.

export type CompensatoryState = 'draft' | 'approving' | 'approved' | 'rejected';

export interface CompensatoryLeave extends LifecycleRecord {
  readonly applicantId: string;
  readonly days: number;
  readonly status: CompensatoryState;
}

export interface CompensatoryTypes {
  record: CompensatoryLeave;
  state: CompensatoryState;
  services: ScenarioServices;
}

export const compensatoryApproval: Approval<CompensatoryTypes> = defineApproval<
  CompensatoryTypes,
  'manager'
>({
  name: 'compensatoryLeave',
  applicant: (record) => record.applicantId,
  directory: directoryOf,
  flow: ['manager'],
  stages: {
    manager: stagesFor<CompensatoryTypes>().single({
      when: ({ record }) => record.days > 1,
      assignee: ({ directory, applicantId, notes }) =>
        managerChain(directory, applicantId, 1, notes),
    }),
  },
  noStages: {
    because:
      'Rule CL-1: a day or less of compensatory leave needs no approval.',
  },
  exits: { approved: 'approve', rejected: 'reject' },
});

export const compensatoryLifecycle: Lifecycle<CompensatoryTypes> =
  defineLifecycle({
    name: 'scenarioCompensatoryLeaves',
    initial: 'draft',
    states: [
      'draft',
      compensatoryApproval.state('approving'),
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
