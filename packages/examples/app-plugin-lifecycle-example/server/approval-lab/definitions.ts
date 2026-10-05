import type { Lifecycle, LifecycleRecord } from '@nocobase/lifecycle';

import { acknowledgementLifecycle } from '../approval-scenarios/acknowledgement.js';
import { approvalLifecycle } from '../approval-scenarios/approval/lifecycle.js';
import {
  SINGLE,
  type ApprovalPolicy,
} from '../approval-scenarios/approval/policy.js';
import {
  defineCoordinationLifecycle,
  type CoordinationPlanner,
} from '../approval-scenarios/coordination.js';
import {
  launchPlanner,
  onboardingPlanner,
  purchasePlanner,
} from '../approval-scenarios/coordination-plans.js';
import { ORG, policies } from '../approval-scenarios/demo-policies.js';
import {
  authorizationRequestLifecycle,
  budgetGrantLifecycle,
} from '../approval-scenarios/grant.js';
import { leaveLifecycle } from '../approval-scenarios/leave.js';
import { noticeLifecycle } from '../approval-scenarios/notice.js';
import { orderLifecycle } from '../approval-scenarios/order.js';
import type { OrgSnapshot } from '../approval-scenarios/org.js';
import { paymentRequestLifecycle } from '../approval-scenarios/payment.js';
import { reimbursementLifecycle } from '../approval-scenarios/reimbursement.js';
import { supplierOnboardingLifecycle } from '../approval-scenarios/supplier.js';
import type { ScenarioServices } from '../approval-scenarios/services.js';
import { workItemLifecycle } from '../approval-scenarios/work-item.js';

export const LAB_ORG: OrgSnapshot = {
  ...ORG,
  people: [
    ...ORG.people,
    'itA',
    'secA',
    'facA',
    'secEng',
    'secLead',
    'opsA',
    'itOpsA',
    'facOpsA',
    'hrA',
    'riskA',
    'riskLead',
  ],
  managers: { ...ORG.managers, secEng: 'secLead', riskA: 'riskLead' },
  roles: {
    ...ORG.roles,
    it: ['itA'],
    security: ['secA'],
    facilities: ['facA'],
    secLead: ['secLead'],
    ops: ['opsA'],
    itOps: ['itOpsA'],
    facOps: ['facOpsA'],
    hrOps: ['hrA'],
    riskOfficer: ['riskA'],
    supplierOps: ['opsA'],
    riskHead: ['riskLead'],
    legal: ['legalA', 'legalB', 'legalC'],
    contractApprover: ['li'],
    grantAuthority: ['finA'],
    financeApprover: ['finA'],
    treasurer: ['finB'],
  },
};

function peoplePolicy(
  title: string,
  people: readonly string[],
): ApprovalPolicy {
  return {
    title,
    currentVersion: 'v1',
    versions: {
      v1: () =>
        people.map((person, index) => ({
          key: `stage${index}`,
          title: person,
          resolver: { kind: 'people', people: [person] },
          rule: SINGLE,
        })),
    },
  };
}

export function labPolicies(): Record<string, ApprovalPolicy> {
  return {
    ...policies(),
    itReview: peoplePolicy('IT', ['itA']),
    facilitiesReview: peoplePolicy('Facilities', ['facA']),
    launchSecurity: peoplePolicy('Security', ['secEng', 'secLead']),
    launchLegal: {
      title: 'Legal',
      currentVersion: 'v1',
      versions: {
        v1: () => [
          {
            key: 'countersign',
            title: 'Legal countersign',
            resolver: { kind: 'people', people: ['legalA', 'legalB'] },
            rule: SINGLE,
          },
          {
            key: 'lead',
            title: 'Legal lead',
            resolver: { kind: 'role', role: 'legalLead' },
            rule: SINGLE,
          },
        ],
      },
    },
    launchFinance: peoplePolicy('Finance', ['finA']),
  };
}

/** The coordinated request kinds and the branches their content needs. */
export const LAB_PLANNERS: Readonly<Record<string, CoordinationPlanner>> = {
  purchase: purchasePlanner(
    new Map([
      ['hardware', { department: 'it', title: 'IT', approvalKind: 'itReview' }],
      [
        'office',
        {
          department: 'facilities',
          title: 'Facilities',
          approvalKind: 'facilitiesReview',
        },
      ],
    ]),
  ),
  launch: launchPlanner(),
  onboarding: onboardingPlanner({
    it: {
      definition: 'itOnboarding@v1',
      ownerRole: 'itOps',
      steps: [
        { key: 'laptop', title: 'Prepare laptop' },
        { key: 'account', title: 'Create account' },
      ],
    },
    admin: {
      definition: 'adminOnboarding@v1',
      ownerRole: 'facOps',
      steps: [{ key: 'desk', title: 'Prepare desk' }],
    },
    hr: {
      definition: 'hrOnboarding@v1',
      ownerRole: 'hrOps',
      steps: [{ key: 'contract', title: 'Register contract' }],
    },
  }),
};

const coordination = defineCoordinationLifecycle(LAB_PLANNERS);

export interface LabLifecycleTypes {
  record: LifecycleRecord;
  state: string;
  parameters: Record<string, unknown>;
  services: ScenarioServices;
}

/** Heterogeneous definitions share the same transaction-bound scenario services. */
export const LAB_LIFECYCLES: readonly Lifecycle<LabLifecycleTypes>[] = [
  leaveLifecycle,
  approvalLifecycle,
  coordination,
  workItemLifecycle,
  acknowledgementLifecycle,
  noticeLifecycle,
  orderLifecycle,
  supplierOnboardingLifecycle,
  reimbursementLifecycle,
  paymentRequestLifecycle,
  authorizationRequestLifecycle,
  budgetGrantLifecycle,
] as unknown as readonly Lifecycle<LabLifecycleTypes>[];
