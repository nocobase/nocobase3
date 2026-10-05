import type { JsonObject } from '@nocobase/lifecycle';
import {
  SINGLE,
  type ApprovalPolicy,
  type StagePlan,
} from './approval/policy.js';
import type { OrgSnapshot } from './org.js';

/**
 * zhang → li → wang → vp → ceo is the management chain. Finance, legal and
 * the committee are groups; admin administers approvals, sup supervises the
 * finance pool, assistant may submit for zhang.
 */
export const ORG: OrgSnapshot = {
  people: [
    'zhang',
    'li',
    'wang',
    'zhao',
    'vp',
    'ceo',
    'hr',
    'finA',
    'finB',
    'finC',
    'legalA',
    'legalB',
    'legalC',
    'legalLead',
    'lawyer',
    'm1',
    'm2',
    'm3',
    'm4',
    'm5',
    'admin',
    'sup',
    'assistant',
  ],
  managers: {
    zhang: 'li',
    li: 'wang',
    zhao: 'wang',
    wang: 'vp',
    vp: 'ceo',
    assistant: 'li',
  },
  roles: {
    hr: ['hr'],
    vp: ['vp'],
    ceo: ['ceo'],
    finance: ['finA', 'finB', 'finC'],
    legal: ['legalA', 'legalB', 'legalC'],
    legalLead: ['legalLead'],
    lawyer: ['lawyer'],
    committee: ['m1', 'm2', 'm3', 'm4', 'm5'],
    approvalAdmin: ['admin'],
    poolSupervisor: ['sup'],
  },
  proxies: { assistant: ['zhang'] },
};

function days(content: JsonObject): number {
  return typeof content.days === 'number' ? content.days : 0;
}

function amount(content: JsonObject): number {
  return typeof content.amount === 'number' ? content.amount : 0;
}

const manager: StagePlan = {
  key: 'manager',
  title: 'Manager',
  resolver: { kind: 'manager' },
  rule: SINGLE,
};
const deptManager: StagePlan = {
  key: 'deptManager',
  title: 'Department manager',
  resolver: { kind: 'manager', levels: 2 },
  rule: SINGLE,
};
const hr: StagePlan = {
  key: 'hr',
  title: 'HR',
  resolver: { kind: 'role', role: 'hr' },
  rule: SINGLE,
};

/** Builds fresh policies per test: `currentVersion` is mutable. */
export function policies(): Record<string, ApprovalPolicy> {
  return {
    // Scenario 2: the path depends on the number of days.
    leaveTiered: {
      title: 'Leave',
      currentVersion: 'v1',
      versions: {
        v1: (content) =>
          days(content) <= 3
            ? [{ ...manager, because: `${days(content)} days ≤ 3` }]
            : [
                { ...manager, because: `${days(content)} days > 3` },
                { ...deptManager, because: `${days(content)} days > 3` },
                { ...hr, because: `${days(content)} days > 3` },
              ],
      },
    },
    // Scenario 3: V1 manager → HR; V2 adds the department manager.
    leaveVersioned: {
      title: 'Leave',
      currentVersion: 'v1',
      versions: {
        v1: () => [manager, hr],
        v2: () => [manager, deptManager, hr],
      },
    },
    // Scenario 4: the manager stage chosen at submission, HR on entry.
    leaveAtSubmit: {
      title: 'Leave',
      currentVersion: 'v1',
      versions: {
        v1: () => [
          { ...manager, resolveAt: 'submit' },
          {
            ...manager,
            key: 'manager2',
            title: 'Manager again',
            escalate: true,
          },
        ],
      },
    },
    // Scenario 5.
    financeFirst: {
      title: 'Finance',
      currentVersion: 'v1',
      versions: {
        v1: () => [
          {
            key: 'finance',
            title: 'Finance',
            resolver: { kind: 'role', role: 'finance', all: true },
            rule: { kind: 'first' },
          },
        ],
      },
    },
    financeAny: {
      title: 'Finance',
      currentVersion: 'v1',
      versions: {
        v1: () => [
          {
            key: 'finance',
            title: 'Finance',
            resolver: { kind: 'role', role: 'finance', all: true },
            rule: { kind: 'any' },
          },
        ],
      },
    },
    // Scenario 6.
    contractCountersign: {
      title: 'Contract',
      currentVersion: 'v1',
      versions: {
        v1: (content) => [
          {
            key: 'legal',
            title: 'Legal',
            // A person picked by two roles counts once.
            resolver: {
              kind: 'people',
              people: Array.isArray(content.reviewers)
                ? content.reviewers.filter(
                    (p): p is string => typeof p === 'string',
                  )
                : ['legalA', 'legalB', 'legalC'],
            },
            rule: {
              kind: 'all',
              onReject: content.collect === true ? 'collect' : 'immediate',
            },
            qualification: 'legal',
          },
        ],
      },
    },
    // Scenario 7.
    committee: {
      title: 'Major purchase',
      currentVersion: 'v1',
      versions: {
        v1: () => [
          {
            key: 'committee',
            title: 'Committee',
            resolver: { kind: 'role', role: 'committee', all: true },
            rule: { kind: 'threshold', min: 3, vetoers: ['m5'] },
          },
        ],
      },
    },
    // Scenario 8: levels by amount; one approval covers a repeated approver.
    purchaseChain: {
      title: 'Purchase',
      currentVersion: 'v1',
      skipRepeated: true,
      versions: {
        v1: (content) => [
          manager,
          deptManager,
          ...(amount(content) > 10_000
            ? [
                {
                  key: 'vp',
                  title: 'VP',
                  resolver: { kind: 'role', role: 'vp' },
                  rule: SINGLE,
                } as const,
              ]
            : []),
          ...(amount(content) > 100_000
            ? [
                {
                  key: 'ceo',
                  title: 'CEO',
                  resolver: { kind: 'role', role: 'ceo' },
                  rule: SINGLE,
                } as const,
              ]
            : []),
        ],
      },
    },
    // Scenarios 11, 12, 21: what each stage's approval covers.
    contract: {
      title: 'Contract',
      currentVersion: 'v1',
      resubmit: 'keepValid',
      carbonCopy: () => ['wang'],
      versions: {
        v1: () => [
          { ...manager, fields: ['party', 'amount'] },
          {
            key: 'legal',
            title: 'Legal',
            resolver: { kind: 'people', people: ['legalA'] },
            rule: SINGLE,
            canRevise: true,
            fields: ['party', 'terms'],
          },
          {
            key: 'finance',
            title: 'Finance',
            resolver: { kind: 'people', people: ['finA'] },
            rule: SINGLE,
            fields: ['amount'],
          },
          {
            key: 'ceo',
            title: 'CEO',
            resolver: { kind: 'role', role: 'ceo' },
            rule: SINGLE,
          },
        ],
      },
    },
    contractFullReview: {
      title: 'Contract',
      currentVersion: 'v1',
      resubmit: 'full',
      versions: {
        v1: () => [
          { ...manager, fields: ['party', 'amount'] },
          {
            key: 'finance',
            title: 'Finance',
            resolver: { kind: 'people', people: ['finA'] },
            rule: SINGLE,
            fields: ['amount'],
          },
        ],
      },
    },
    // Scenario 14.
    legalReview: {
      title: 'Contract review',
      currentVersion: 'v1',
      allowAddSigner: true,
      versions: {
        v1: () => [
          {
            key: 'legal',
            title: 'Legal',
            resolver: { kind: 'people', people: ['legalA'] },
            rule: SINGLE,
          },
          {
            key: 'legalLead',
            title: 'Legal lead',
            resolver: { kind: 'role', role: 'legalLead' },
            rule: SINGLE,
          },
        ],
      },
    },
    // Scenario 16: a stage that needs a qualification.
    financeSingle: {
      title: 'Payment approval',
      currentVersion: 'v1',
      versions: {
        v1: () => [
          {
            key: 'finance',
            title: 'Finance',
            resolver: { kind: 'people', people: ['finA'] },
            rule: SINGLE,
            qualification: 'finance',
          },
        ],
      },
    },
    // Scenario 22.
    travel: {
      title: 'Business trip',
      currentVersion: 'v1',
      proxySubmit: true,
      versions: { v1: () => [manager] },
    },
    // Scenario 24.
    financePool: {
      title: 'Shared finance',
      currentVersion: 'v1',
      versions: {
        v1: () => [
          {
            key: 'pool',
            title: 'Finance pool',
            resolver: { kind: 'role', role: 'finance', all: true },
            rule: { kind: 'claim' },
          },
        ],
      },
    },
    // Scenario 26.
    consulted: {
      title: 'Contract with counsel',
      currentVersion: 'v1',
      consultationsBlockDecision: true,
      versions: {
        v1: () => [
          {
            key: 'legal',
            title: 'Legal',
            resolver: { kind: 'people', people: ['legalA'] },
            rule: SINGLE,
          },
        ],
      },
    },
    // Scenario 28: one open request per subject and matter.
    contractMatter: {
      title: 'Contract matter',
      currentVersion: 'v1',
      exclusivePerSubject: true,
      versions: { v1: () => [manager] },
    },
    // No approval needed by an explicit rule.
    exempt: {
      title: 'Exempt',
      currentVersion: 'v1',
      versions: { v1: () => [] },
    },
  };
}
