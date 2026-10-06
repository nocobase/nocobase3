import type { JsonObject } from '@nocobase/lifecycle';

/**
 * What a person can start in the example, shared by the server, which
 * creates the records, and the client, which offers the forms. A demo is one
 * kind of request: the lifecycle it creates a record of, the transition that
 * sends it on its way, and the form values a sample starts from.
 */
export type BusinessKey =
  | 'leave'
  | 'travel'
  | 'purchase'
  | 'contract'
  | 'reimbursement'
  | 'payment'
  | 'grant'
  | 'supplier'
  | 'onboarding'
  | 'launch'
  | 'notice'
  | 'order';

export type DemoKey =
  | 'leave'
  | 'ruledLeave'
  | 'compensatory'
  | 'trip'
  | 'purchaseChain'
  | 'purchase'
  | 'committee'
  | 'contract'
  | 'contractReview'
  | 'contractFullReview'
  | 'countersign'
  | 'legalReview'
  | 'counsel'
  | 'matter'
  | 'reimbursement'
  | 'expense'
  | 'payment'
  | 'financeFirst'
  | 'financeAny'
  | 'pool'
  | 'paymentApproval'
  | 'grantRequest'
  | 'supplier'
  | 'onboarding'
  | 'launch'
  | 'notice'
  | 'order';

export interface Demo {
  readonly key: DemoKey;
  readonly lifecycle: string;
  readonly business: BusinessKey;
  /** The scenarios of the design it shows, for the lab. */
  readonly scenarios: string;
  /** The transition that sends a new record on its way; null when the system does. */
  readonly start: string | null;
  /** Whether a person other than the applicant may start it for them. */
  readonly proxy?: boolean;
  /** The form a new request starts from, which a sample keeps as it is. */
  sample(): JsonObject;
}

const day = 86_400_000;

function inDays(days: number): string {
  return new Date(Date.now() + days * day).toISOString().slice(0, 10);
}

export const DEMOS: readonly Demo[] = [
  {
    key: 'leave',
    lifecycle: 'scenarioLeaves',
    business: 'leave',
    scenarios: '1, 2',
    start: 'submit',
    sample: () => ({
      leaveType: 'annual',
      startDate: inDays(7),
      endDate: inDays(8),
      days: 2,
      reason: 'Family matters',
    }),
  },
  {
    key: 'ruledLeave',
    lifecycle: 'scenarioRuledLeaves',
    business: 'leave',
    scenarios: '3, 4',
    start: 'submit',
    sample: () => ({ days: 5, reason: 'Annual trip' }),
  },
  {
    key: 'compensatory',
    lifecycle: 'scenarioCompensatoryLeaves',
    business: 'leave',
    scenarios: '2',
    start: 'submit',
    sample: () => ({ days: 1, reason: 'Weekend release' }),
  },
  {
    key: 'trip',
    lifecycle: 'scenarioTrips',
    business: 'travel',
    scenarios: '22',
    start: 'submit',
    proxy: true,
    sample: () => ({
      city: 'Shanghai',
      days: 3,
      purpose: 'Customer visit',
    }),
  },
  {
    key: 'purchaseChain',
    lifecycle: 'scenarioPurchaseRequests',
    business: 'purchase',
    scenarios: '8',
    start: 'submit',
    sample: () => ({
      item: 'Design workstations',
      amount: 120_000,
      reason: 'Replace the studio machines',
    }),
  },
  {
    key: 'purchase',
    lifecycle: 'scenarioCoordinations',
    business: 'purchase',
    scenarios: '9',
    start: 'start',
    sample: () => ({
      items: [
        { category: 'server', name: 'Rack server', amount: 30_000 },
        { category: 'software', name: 'EDR licences', amount: 8_000 },
        { category: 'stationery', name: 'Pens', amount: 50 },
      ],
    }),
  },
  {
    key: 'committee',
    lifecycle: 'scenarioCommitteeRequests',
    business: 'purchase',
    scenarios: '7',
    start: 'submit',
    sample: () => ({ project: 'Regional warehouse', amount: 2_000_000 }),
  },
  {
    key: 'contract',
    lifecycle: 'scenarioContracts',
    business: 'contract',
    scenarios: '11, 12, 13',
    start: 'submit',
    sample: () => ({ title: 'Acme supply agreement', amount: 60_000 }),
  },
  {
    key: 'contractReview',
    lifecycle: 'scenarioContractReviews',
    business: 'contract',
    scenarios: '11, 12, 21, 25',
    start: 'submit',
    sample: () => ({ party: 'Acme', amount: 6_000, terms: 'Net 30' }),
  },
  {
    key: 'contractFullReview',
    lifecycle: 'scenarioContractFullReviews',
    business: 'contract',
    scenarios: '12',
    start: 'submit',
    sample: () => ({ party: 'Globex', amount: 9_000, terms: 'Net 45' }),
  },
  {
    key: 'countersign',
    lifecycle: 'scenarioCountersigns',
    business: 'contract',
    scenarios: '6',
    start: 'submit',
    sample: () => ({ subject: 'Data processing agreement', collect: false }),
  },
  {
    key: 'legalReview',
    lifecycle: 'scenarioLegalReviews',
    business: 'contract',
    scenarios: '14',
    start: 'submit',
    sample: () => ({ subject: 'Partnership terms' }),
  },
  {
    key: 'counsel',
    lifecycle: 'scenarioCounselReviews',
    business: 'contract',
    scenarios: '26',
    start: 'submit',
    sample: () => ({ title: 'Joint venture structure' }),
  },
  {
    key: 'matter',
    lifecycle: 'scenarioMatters',
    business: 'contract',
    scenarios: '28',
    start: 'submit',
    sample: () => ({ subjectKey: 'contract-42:budget' }),
  },
  {
    key: 'reimbursement',
    lifecycle: 'scenarioReimbursements',
    business: 'reimbursement',
    scenarios: '23',
    start: 'submit',
    sample: () => ({
      title: 'Shanghai customer visit',
      lines: [
        {
          id: 'flight',
          category: 'travel',
          description: 'Flight',
          amountCents: 80_000,
        },
        {
          id: 'hotel',
          category: 'hotel',
          description: 'Hotel, two nights',
          amountCents: 60_000,
        },
      ],
    }),
  },
  {
    key: 'expense',
    lifecycle: 'scenarioExpenses',
    business: 'reimbursement',
    scenarios: '15',
    start: 'submit',
    sample: () => ({ amount: 680, purpose: 'Team lunch' }),
  },
  {
    key: 'payment',
    lifecycle: 'scenarioPayments',
    business: 'payment',
    scenarios: '27',
    start: 'submit',
    sample: () => ({
      title: 'Annual licence',
      payeeId: 'supplier',
      amountCents: 1_000_000,
      budgetCode: 'general',
      executionMode: 'scheduled',
      installments: 2,
    }),
  },
  {
    key: 'financeFirst',
    lifecycle: 'scenarioFinanceRequests',
    business: 'payment',
    scenarios: '5',
    start: 'submit',
    sample: () => ({ amount: 6_000, purpose: 'Conference tickets' }),
  },
  {
    key: 'financeAny',
    lifecycle: 'scenarioFinanceRequests',
    business: 'payment',
    scenarios: '5',
    start: 'submit',
    sample: () => ({ amount: 6_000, purpose: 'Booth rental' }),
  },
  {
    key: 'pool',
    lifecycle: 'scenarioPoolRequests',
    business: 'payment',
    scenarios: '24',
    start: 'submit',
    sample: () => ({ amount: 6_000, purpose: 'Agency invoice' }),
  },
  {
    key: 'paymentApproval',
    lifecycle: 'scenarioPaymentApprovals',
    business: 'payment',
    scenarios: '16',
    start: 'submit',
    sample: () => ({ amount: 6_000, purpose: 'Printer lease' }),
  },
  {
    key: 'grantRequest',
    lifecycle: 'scenarioGrantRequests',
    business: 'grant',
    scenarios: '28',
    start: 'submit',
    sample: () => ({
      subjectId: 'contract-42',
      subjectRevision: 1,
      matter: 'priceException',
      supersedes: '',
      limitCents: 100_000,
      maxUses: 3,
      validFrom: inDays(0),
      validUntil: inDays(90),
    }),
  },
  {
    key: 'supplier',
    lifecycle: 'scenarioSuppliers',
    business: 'supplier',
    scenarios: '18',
    start: 'submit',
    sample: () => ({ name: 'Acme Trading', registrationNo: 'ACME-001' }),
  },
  {
    key: 'onboarding',
    lifecycle: 'scenarioCoordinations',
    business: 'onboarding',
    scenarios: '19',
    start: 'start',
    sample: () => ({ employee: 'Nora Lin', remote: false }),
  },
  {
    key: 'launch',
    lifecycle: 'scenarioCoordinations',
    business: 'launch',
    scenarios: '10',
    start: 'start',
    sample: () => ({ product: 'Atlas', budget: 120_000 }),
  },
  {
    key: 'notice',
    lifecycle: 'scenarioNotices',
    business: 'notice',
    scenarios: '25',
    start: 'publish',
    sample: () => ({
      title: 'Travel policy 2027',
      mode: 'confirmAll',
      recipientIds: ['li', 'wang'],
    }),
  },
  {
    key: 'order',
    lifecycle: 'scenarioOrders',
    business: 'order',
    scenarios: '17',
    start: null,
    sample: () => ({ amountCents: 20_000 }),
  },
];

export function demo(key: string): Demo | undefined {
  return DEMOS.find((each) => each.key === key);
}

export interface CastMember {
  readonly id: string;
  /** A key under `cast`: what this person does in the business. */
  readonly role: string;
}

/** A business application of the center: its page, what can be started there, and who takes part. */
export interface Business {
  readonly key: BusinessKey;
  readonly path: string;
  /** The demos a person can start here, the first being the default. */
  readonly demos: readonly DemoKey[];
  /** Who to switch to while trying the business, in the order they act. */
  readonly cast: readonly CastMember[];
}

export const BUSINESSES: readonly Business[] = [
  {
    key: 'leave',
    path: '/approval-center/leave',
    demos: ['leave', 'ruledLeave', 'compensatory'],
    cast: [
      { id: 'zhang', role: 'applicant' },
      { id: 'li', role: 'manager' },
      { id: 'wang', role: 'departmentHead' },
      { id: 'hr', role: 'hr' },
    ],
  },
  {
    key: 'travel',
    path: '/approval-center/travel',
    demos: ['trip'],
    cast: [
      { id: 'zhang', role: 'traveller' },
      { id: 'assistant', role: 'proxy' },
      { id: 'li', role: 'manager' },
    ],
  },
  {
    key: 'purchase',
    path: '/approval-center/purchase',
    demos: ['purchaseChain', 'purchase', 'committee'],
    cast: [
      { id: 'zhang', role: 'applicant' },
      { id: 'li', role: 'manager' },
      { id: 'wang', role: 'departmentHead' },
      { id: 'vp', role: 'vp' },
      { id: 'ceo', role: 'ceo' },
      { id: 'itA', role: 'itReview' },
      { id: 'secA', role: 'securityReview' },
      { id: 'm1', role: 'committeeMember' },
      { id: 'm5', role: 'committeeChair' },
    ],
  },
  {
    key: 'contract',
    path: '/approval-center/contracts',
    demos: [
      'contract',
      'contractReview',
      'contractFullReview',
      'countersign',
      'legalReview',
      'counsel',
      'matter',
    ],
    cast: [
      { id: 'zhang', role: 'applicant' },
      { id: 'li', role: 'manager' },
      { id: 'legalA', role: 'legal' },
      { id: 'legalB', role: 'legal' },
      { id: 'legalLead', role: 'legalLead' },
      { id: 'lawyer', role: 'counsel' },
      { id: 'finA', role: 'finance' },
      { id: 'buyerA', role: 'procurement' },
      { id: 'ceo', role: 'ceo' },
      { id: 'wang', role: 'copied' },
    ],
  },
  {
    key: 'reimbursement',
    path: '/approval-center/reimbursements',
    demos: ['reimbursement', 'expense'],
    cast: [
      { id: 'zhang', role: 'applicant' },
      { id: 'finA', role: 'travelReview' },
      { id: 'facA', role: 'hotelReview' },
      { id: 'li', role: 'manager' },
    ],
  },
  {
    key: 'payment',
    path: '/approval-center/payments',
    demos: ['payment', 'financeFirst', 'financeAny', 'pool', 'paymentApproval'],
    cast: [
      { id: 'zhang', role: 'applicant' },
      { id: 'finA', role: 'financeApprover' },
      { id: 'finB', role: 'treasurer' },
      { id: 'finC', role: 'finance' },
      { id: 'sup', role: 'poolSupervisor' },
    ],
  },
  {
    key: 'grant',
    path: '/approval-center/grants',
    demos: ['grantRequest'],
    cast: [
      { id: 'zhang', role: 'applicant' },
      { id: 'li', role: 'contractApprover' },
      { id: 'finA', role: 'grantAuthority' },
    ],
  },
  {
    key: 'supplier',
    path: '/approval-center/suppliers',
    demos: ['supplier'],
    cast: [
      { id: 'zhang', role: 'supplierContact' },
      { id: 'legalA', role: 'legal' },
      { id: 'riskA', role: 'risk' },
      { id: 'riskLead', role: 'riskLead' },
      { id: 'opsA', role: 'supplierOps' },
      { id: 'admin', role: 'admin' },
    ],
  },
  {
    key: 'onboarding',
    path: '/approval-center/onboarding',
    demos: ['onboarding'],
    cast: [
      { id: 'zhang', role: 'hiringManager' },
      { id: 'itOpsA', role: 'itOps' },
      { id: 'facOpsA', role: 'facOps' },
      { id: 'hrA', role: 'hrOps' },
    ],
  },
  {
    key: 'launch',
    path: '/approval-center/launches',
    demos: ['launch'],
    cast: [
      { id: 'zhang', role: 'productOwner' },
      { id: 'secEng', role: 'security' },
      { id: 'secLead', role: 'securityLead' },
      { id: 'legalA', role: 'legal' },
      { id: 'legalLead', role: 'legalLead' },
      { id: 'finA', role: 'finance' },
      { id: 'opsA', role: 'operations' },
    ],
  },
  {
    key: 'notice',
    path: '/approval-center/notices',
    demos: ['notice'],
    cast: [
      { id: 'zhang', role: 'publisher' },
      { id: 'li', role: 'recipient' },
      { id: 'wang', role: 'recipient' },
    ],
  },
];

export function business(key: string): Business | undefined {
  return BUSINESSES.find((each) => each.key === key);
}

/** A work item's steps under one version of its definition. */
export interface WorkDefinition {
  readonly definition: string;
  readonly ownerRole: string;
  readonly steps: readonly { readonly key: string; readonly title: string }[];
}

/**
 * The definitions an onboarding's work items follow, with a later version an
 * operator may move a waiting item to.
 */
export const WORK_DEFINITIONS: Readonly<Record<string, WorkDefinition>> =
  Object.freeze({
    'itOnboarding@v3': {
      definition: 'itOnboarding@v3',
      ownerRole: 'itOps',
      steps: [
        { key: 'createAccount', title: 'Create the account' },
        { key: 'createMailbox', title: 'Create the mailbox' },
        { key: 'requestLaptop', title: 'Request a laptop' },
        { key: 'grantPermissions', title: 'Grant permissions' },
      ],
    },
    'itOnboarding@v4': {
      definition: 'itOnboarding@v4',
      ownerRole: 'itOps',
      steps: [
        { key: 'createAccount', title: 'Create the account' },
        { key: 'createMailbox', title: 'Create the mailbox' },
        { key: 'enrollMfa', title: 'Enroll MFA' },
        { key: 'requestLaptop', title: 'Request a laptop' },
        { key: 'grantPermissions', title: 'Grant permissions' },
      ],
    },
    'adminOnboarding@v1': {
      definition: 'adminOnboarding@v1',
      ownerRole: 'facOps',
      steps: [
        { key: 'assignDesk', title: 'Assign a desk' },
        { key: 'issueBadge', title: 'Issue a badge' },
      ],
    },
    'hrOnboarding@v1': {
      definition: 'hrOnboarding@v1',
      ownerRole: 'hrOps',
      steps: [
        { key: 'openPersonnelFile', title: 'Open the personnel file' },
        { key: 'enrollPayroll', title: 'Enroll in payroll' },
      ],
    },
  });
