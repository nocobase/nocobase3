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
import {
  directoryOf,
  isActor,
  SCENARIO_COLLECTIONS,
  type ScenarioServices,
} from './services.js';

// Scenarios 3 and 4: rule versions, and the organization
// changing under requests in flight.
//
// V1 is manager → HR; V2 adds the department manager between them — stages
// of the run, while the request waits in `approving`. Which version a new
// request gets is an administrator parameter, read once at submission; the
// run keeps the version and the plan it produced, so a published V2 does not
// reach a V1 request in flight. A resubmission after a
// return keeps the first submission's version. Moving one request to V2 is
// an explicit, logged migration.
//
// The manager is chosen when the stage opens; HR is chosen at submission and
// kept, so an organization change between the two reaches one and not the
// other.

export type RuledLeaveState = 'draft' | 'approving' | 'approved' | 'rejected';

export interface RuledLeave extends LifecycleRecord {
  readonly applicantId: string;
  readonly days: number;
  readonly status: RuledLeaveState;
}

export interface RuledLeaveTypes {
  record: RuledLeave;
  state: RuledLeaveState;
  parameters: { ruleVersion: number };
  services: ScenarioServices;
}

const stage = stagesFor<RuledLeaveTypes>();

export const ruledLeaveApproval: Approval<RuledLeaveTypes> = defineApproval<
  RuledLeaveTypes,
  'manager' | 'deptManager' | 'hr'
>({
  name: 'ruledLeave',
  version: ({ parameters }) => parameters.ruleVersion,
  applicant: (record) => record.applicantId,
  directory: directoryOf,
  freeze: ['days'],
  flow: ['manager', 'deptManager', 'hr'],
  stages: {
    manager: stage.single({
      title: 'Manager',
      assignee: ({ directory, applicantId, notes }) =>
        managerChain(directory, applicantId, 1, notes),
    }),
    deptManager: stage.single({
      title: 'Department manager',
      when: ({ version }) => version >= 2,
      because: ({ version, included }) =>
        included
          ? `Rule v${version} asks the department manager.`
          : `Rule v${version} has no department manager stage.`,
      assignee: ({ directory, applicantId, notes }) =>
        managerChain(directory, applicantId, 2, notes),
    }),
    hr: stage.single({
      title: 'HR',
      chooseAt: 'submit',
      assignee: ({ services }) => services.org.holderOf('hr'),
    }),
  },
  exits: { approved: 'approve', rejected: 'reject', returned: 'return' },
  migrations: true,
  adminRole: 'approvalAdmin',
});

export const ruledLeaveLifecycle: Lifecycle<RuledLeaveTypes> = defineLifecycle({
  name: 'scenarioRuledLeaves',
  collection: SCENARIO_COLLECTIONS.ruledLeaves,
  initial: 'draft',
  states: [
    'draft',
    ruledLeaveApproval.state('approving'),
    { name: 'approved', final: true },
    { name: 'rejected', final: true },
  ],
  parameters: { ruleVersion: 1 },
  transitions: {
    submit: {
      from: 'draft',
      to: 'approving',
      guard: ({ record, actor }) =>
        isActor(actor, record.applicantId, 'Only the applicant submits.'),
    },
    approve: { from: 'approving', to: 'approved', manual: false },
    reject: { from: 'approving', to: 'rejected', manual: false },
    return: { from: 'approving', to: 'draft', manual: false },
  },
});
