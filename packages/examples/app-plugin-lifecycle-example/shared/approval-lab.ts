import type { JsonObject } from '@nocobase/lifecycle';

export interface ApprovalDemo {
  readonly key: string;
  readonly lifecycle: string;
  readonly scenarios: string;
  readonly title: string;
  readonly values: JsonObject;
}

/** Form defaults, independent of the lifecycle implementation. */
export const APPROVAL_DEMOS: readonly ApprovalDemo[] = [
  {
    key: 'leave',
    lifecycle: 'leaveRequests',
    scenarios: '1',
    title: 'Single-level leave',
    values: { days: 2, reason: 'Family matters', approverId: null },
  },
  ...(
    [
      ['leaveTiered', '2', { days: 5 }],
      ['leaveVersioned', '3', { days: 5 }],
      ['leaveAtSubmit', '4, 15', { days: 2 }],
      ['financeFirst', '5', { amount: 6000 }],
      ['financeAny', '5', { amount: 6000 }],
      [
        'contractCountersign',
        '6',
        { party: 'Acme', amount: 6000, collect: false },
      ],
      ['committee', '7', { amount: 200000 }],
      ['purchaseChain', '8', { amount: 120000 }],
      [
        'contract',
        '11, 12, 13, 21',
        { party: 'Acme', terms: 'Net 30', amount: 6000 },
      ],
      ['contractFullReview', '12', { party: 'Acme', amount: 6000 }],
      ['legalReview', '14', { party: 'Acme', terms: 'Net 30' }],
      ['financeSingle', '16', { amount: 6000 }],
      ['travel', '22', { destination: 'Shanghai', days: 3 }],
      ['financePool', '24', { amount: 6000 }],
      ['consulted', '26', { party: 'Acme', terms: 'Net 30' }],
      ['contractMatter', '28', { amount: 6000 }],
    ] as readonly [string, string, JsonObject][]
  ).map(([key, scenarios, content]) => ({
    key,
    lifecycle: 'approvalRequests',
    scenarios,
    title: key,
    values: {
      content,
      ...(key === 'contractMatter' ? { subjectKey: 'contract-42:budget' } : {}),
    },
  })),
  {
    key: 'purchase',
    lifecycle: 'coordinations',
    scenarios: '9',
    title: 'Parallel purchase',
    values: {
      content: {
        items: [
          { category: 'hardware', name: 'Laptop', amount: 8000 },
          { category: 'office', name: 'Desk', amount: 2000 },
        ],
      },
    },
  },
  {
    key: 'launch',
    lifecycle: 'coordinations',
    scenarios: '10',
    title: 'Product launch',
    values: { content: { product: 'Atlas', budget: 120000 } },
  },
  {
    key: 'onboarding',
    lifecycle: 'coordinations',
    scenarios: '19',
    title: 'Employee onboarding',
    values: { content: { employee: 'New colleague', remote: false } },
  },
  {
    key: 'order',
    lifecycle: 'orders',
    scenarios: '17',
    title: 'Order and external payment',
    values: {
      amountCents: 20000,
      paymentRef: null,
      paidAt: null,
      shipmentNo: null,
      refundRef: null,
    },
  },
  {
    key: 'supplier',
    lifecycle: 'supplierOnboardings',
    scenarios: '18',
    title: 'Supplier onboarding',
    values: { name: 'Acme', registrationNo: 'ACME-001' },
  },
  {
    key: 'reimbursement',
    lifecycle: 'reimbursements',
    scenarios: '23',
    title: 'Itemized reimbursement',
    values: {
      lines: [
        {
          id: 'flight',
          category: 'travel',
          description: 'Flight',
          amountCents: 80000,
          approverId: null,
          contentHash: null,
          decision: null,
        },
        {
          id: 'hotel',
          category: 'hotel',
          description: 'Hotel',
          amountCents: 30000,
          approverId: null,
          contentHash: null,
          decision: null,
        },
      ],
    },
  },
  {
    key: 'notice',
    lifecycle: 'notices',
    scenarios: '25',
    title: 'Notice and confirmation',
    values: { mode: 'confirmAll', recipientIds: ['li', 'wang'] },
  },
  {
    key: 'payment',
    lifecycle: 'paymentRequests',
    scenarios: '27',
    title: 'Approval and payment execution',
    values: {
      payeeId: 'supplier',
      amountCents: 100000,
      budgetCode: 'general',
      executionMode: 'scheduled',
      installments: 2,
    },
  },
  {
    key: 'authorization',
    lifecycle: 'authorizationRequests',
    scenarios: '28',
    title: 'Authorization and budget grant',
    values: {
      subjectId: 'contract-42',
      subjectRevision: 1,
      matter: 'budget',
      supersedes: '',
      requested: {
        limitCents: 100000,
        maxUses: 3,
        validFrom: '2026-01-01T00:00:00Z',
        validUntil: '2099-01-01T00:00:00Z',
      },
    },
  },
];

export interface LabPerson {
  readonly id: string;
  readonly manager: string | null;
  readonly roles: readonly string[];
}

export interface LabRecord {
  readonly lifecycle: string;
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly applicantId: string;
}

export interface LabOverview {
  readonly people: readonly LabPerson[];
  readonly records: readonly LabRecord[];
  readonly todos: readonly {
    lifecycle: string;
    recordId: string;
    title: string;
    detail: string;
    box: string;
    action: string | null;
  }[];
  readonly messages: readonly Record<string, unknown>[];
  readonly operations: readonly Record<string, unknown>[];
  readonly settings: JsonObject;
}
