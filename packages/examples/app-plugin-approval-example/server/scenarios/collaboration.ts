import {
  defineLifecycle,
  type Lifecycle,
  type LifecycleRecord,
  type LifecycleTypes,
} from '@nocobase/lifecycle';

import {
  defineApproval,
  managerChain,
  stagesFor,
  type Approval,
  type StageDefinition,
} from '@nocobase/app-plugin-approval/server';
import { directoryOf, isActor, type ScenarioServices } from './services.js';

// Scenarios 5–8. Each business is a plain lifecycle that waits
// in `approving` while its approval's run goes through the stages; how
// several people make one stage's result is the stage's policy, and nothing
// else changes between them.

/** A draft → approving → approved | rejected lifecycle around one approval. */
function approvalLifecycle<
  T extends LifecycleTypes & { services: ScenarioServices },
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
          isActor(
            actor,
            String(record.applicantId),
            'Only the applicant submits.',
          ),
      },
      approve: { from: 'approving', to: 'approved', manual: false },
      reject: { from: 'approving', to: 'rejected', manual: false },
    },
  });
}

// --------------------------------------------------------- scenario 5

export interface FinanceRequest extends LifecycleRecord {
  readonly applicantId: string;
  /** `first`: the first answer decides; `any`: one approval is enough. */
  readonly mode: 'first' | 'any';
  readonly status: string;
}

export interface FinanceTypes {
  record: FinanceRequest;
  state: 'draft' | 'approving' | 'approved' | 'rejected';
  services: ScenarioServices;
}

const finance = stagesFor<FinanceTypes>();
const financeTeam = ({ services }: { services: ScenarioServices }): string[] =>
  services.org.holders('finance');

export const financeApproval: Approval<FinanceTypes> = defineApproval<
  FinanceTypes,
  'financeFirst' | 'financeAny'
>({
  name: 'financeOrSign',
  applicant: (record) => record.applicantId,
  directory: directoryOf,
  flow: ['financeFirst', 'financeAny'],
  stages: {
    financeFirst: finance.first({
      title: 'Finance (first answer)',
      when: ({ record }) => record.mode === 'first',
      assignees: financeTeam,
    }),
    financeAny: finance.any({
      title: 'Finance (one approval)',
      when: ({ record }) => record.mode === 'any',
      assignees: financeTeam,
    }),
  },
  exits: { approved: 'approve', rejected: 'reject' },
});

export const financeLifecycle: Lifecycle<FinanceTypes> = approvalLifecycle(
  'scenarioFinanceRequests',
  financeApproval,
);

// --------------------------------------------------------- scenario 6

export interface CountersignRequest extends LifecycleRecord {
  readonly applicantId: string;
  /** Who reviews; the legal team when absent. */
  readonly reviewers: readonly string[] | null;
  /** Collect every opinion before a rejection takes effect. */
  readonly collect: boolean;
  readonly status: string;
}

export interface CountersignTypes {
  record: CountersignRequest;
  state: 'draft' | 'approving' | 'approved' | 'rejected';
  services: ScenarioServices;
}

const countersign = stagesFor<CountersignTypes>();
const reviewers = ({
  record,
  services,
}: {
  record: CountersignRequest;
  services: ScenarioServices;
}): readonly string[] => record.reviewers ?? services.org.holders('legal');

export const countersignApproval: Approval<CountersignTypes> = defineApproval<
  CountersignTypes,
  'legal' | 'legalCollect'
>({
  name: 'countersign',
  applicant: (record) => record.applicantId,
  directory: directoryOf,
  flow: ['legal', 'legalCollect'],
  stages: {
    legal: countersign.all({
      title: 'Legal',
      when: ({ record }) => !record.collect,
      qualification: 'legal',
      assignees: reviewers,
    }),
    legalCollect: countersign.all({
      title: 'Legal (every opinion)',
      when: ({ record }) => record.collect,
      onReject: 'collect',
      qualification: 'legal',
      assignees: reviewers,
    }),
  },
  exits: { approved: 'approve', rejected: 'reject' },
  adminRole: 'approvalAdmin',
});

export const countersignLifecycle: Lifecycle<CountersignTypes> =
  approvalLifecycle('scenarioCountersigns', countersignApproval);

// --------------------------------------------------------- scenario 7

export interface CommitteeRequest extends LifecycleRecord {
  readonly applicantId: string;
  readonly status: string;
}

export interface CommitteeTypes {
  record: CommitteeRequest;
  state: 'draft' | 'approving' | 'approved' | 'rejected';
  services: ScenarioServices;
}

export const committeeApproval: Approval<CommitteeTypes> = defineApproval<
  CommitteeTypes,
  'committee'
>({
  name: 'committee',
  applicant: (record) => record.applicantId,
  directory: directoryOf,
  flow: ['committee'],
  stages: {
    committee: stagesFor<CommitteeTypes>().threshold({
      title: 'Committee: three of five',
      min: 3,
      vetoers: ['m5'],
      abstain: true,
      assignees: ({ services }) => services.org.holders('committee'),
    }),
  },
  exits: { approved: 'approve', rejected: 'reject' },
});

export const committeeLifecycle: Lifecycle<CommitteeTypes> = approvalLifecycle(
  'scenarioCommitteeRequests',
  committeeApproval,
);

// --------------------------------------------------------- scenario 8

export interface PurchaseRequest extends LifecycleRecord {
  readonly applicantId: string;
  readonly amount: number;
  readonly status: string;
}

export interface PurchaseTypes {
  record: PurchaseRequest;
  state: 'draft' | 'approving' | 'approved' | 'rejected';
  services: ScenarioServices;
}

const purchase = stagesFor<PurchaseTypes>();

function level(title: string, levels: number): StageDefinition<PurchaseTypes> {
  return purchase.single({
    title,
    assignee: ({ directory, applicantId, notes }) =>
      managerChain(directory, applicantId, levels, notes),
  });
}

export const purchaseApproval: Approval<PurchaseTypes> = defineApproval<
  PurchaseTypes,
  'manager' | 'deptManager' | 'vp' | 'ceo'
>({
  name: 'purchaseChain',
  applicant: (record) => record.applicantId,
  directory: directoryOf,
  freeze: ['amount'],
  flow: ['manager', 'deptManager', 'vp', 'ceo'],
  stages: {
    manager: level('Manager', 1),
    deptManager: level('Department manager', 2),
    vp: purchase.single({
      title: 'VP',
      when: ({ record }) => record.amount > 10_000,
      because: ({ record, included }) =>
        `${record.amount} ${included ? '>' : '≤'} 10000`,
      assignee: ({ services }) => services.org.holderOf('vp'),
    }),
    ceo: purchase.single({
      title: 'CEO',
      when: ({ record }) => record.amount > 100_000,
      because: ({ record, included }) =>
        `${record.amount} ${included ? '>' : '≤'} 100000`,
      assignee: ({ services }) => services.org.holderOf('ceo'),
    }),
  },
  exits: { approved: 'approve', rejected: 'reject' },
  skipRepeated: true,
  adminRole: 'approvalAdmin',
});

export const purchaseLifecycle: Lifecycle<PurchaseTypes> = approvalLifecycle(
  'scenarioPurchaseRequests',
  purchaseApproval,
);
