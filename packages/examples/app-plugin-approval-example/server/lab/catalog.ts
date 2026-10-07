import type { Approval } from '@nocobase/app-plugin-approval/server';
import type {
  JsonObject,
  Lifecycle,
  LifecycleRecord,
  LifecycleTypes,
} from '@nocobase/lifecycle';

import {
  demo,
  WORK_DEFINITIONS,
  type Demo,
  type DemoKey,
} from '../../shared/catalog.js';
import type { LabSettings } from '../../shared/types.js';
import {
  committeeApproval,
  committeeLifecycle,
  countersignApproval,
  countersignLifecycle,
  financeApproval,
  financeLifecycle,
  purchaseApproval,
  purchaseLifecycle,
} from '../scenarios/collaboration.js';
import {
  contractApproval,
  contractLifecycle,
  reviewFullApproval,
  reviewFullLifecycle,
  reviewKeepingApproval,
  reviewKeepingLifecycle,
} from '../scenarios/contract.js';
import {
  branchReviewApproval,
  branchReviewLifecycle,
  COORDINATIONS,
  coordinationValues,
  defineCoordinationLifecycle,
  launchPlanner,
  onboardingPlanner,
  purchasePlanner,
  workItemLifecycle,
  type CoordinationPlanner,
  type DepartmentReview,
} from '../scenarios/coordination.js';
import {
  grantApproval,
  grantLifecycle,
  grantRequestLifecycle,
  GRANT_REQUESTS,
} from '../scenarios/grant.js';
import {
  compensatoryApproval,
  compensatoryLifecycle,
  leaveApproval,
  leaveLifecycle,
} from '../scenarios/leave.js';
import { noticeLifecycle } from '../scenarios/notice.js';
import { orderLifecycle } from '../scenarios/order.js';
import type { OrgSnapshot } from '../scenarios/org.js';
import {
  counselApproval,
  counselLifecycle,
  matterApproval,
  matterLifecycle,
  poolApproval,
  poolLifecycle,
  tripApproval,
  tripLifecycle,
} from '../scenarios/participation.js';
import {
  paymentApproval as executionApproval,
  paymentLifecycle,
} from '../scenarios/payment.js';
import {
  reimbursementApproval,
  reimbursementLifecycle,
  REIMBURSEMENTS,
} from '../scenarios/reimbursement.js';
import {
  expenseApproval,
  expenseLifecycle,
  legalReviewApproval,
  legalReviewLifecycle,
  paymentApproval as qualifiedApproval,
  paymentApprovalLifecycle,
} from '../scenarios/responsibility.js';
import {
  ruledLeaveApproval,
  ruledLeaveLifecycle,
} from '../scenarios/ruled-leave.js';
import {
  supplierLegalApproval,
  supplierLifecycle,
  supplierRiskApproval,
} from '../scenarios/supplier.js';
import { ExampleError } from './errors.js';

/**
 * The organization every scenario resolves people in. zhang → li → wang →
 * vp → ceo is the management chain; the rest are teams and the roles the
 * scenarios ask for by name. An administrator changes it from the lab.
 */
export const LAB_ORG: OrgSnapshot = Object.freeze({
  people: [
    'zhang',
    'assistant',
    'li',
    'zhao',
    'wang',
    'vp',
    'ceo',
    'hr',
    'hrA',
    'finA',
    'finB',
    'finC',
    'sup',
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
    'itA',
    'itOpsA',
    'secA',
    'secEng',
    'secLead',
    'facA',
    'facOpsA',
    'opsA',
    'riskA',
    'riskLead',
    'buyerA',
    'buyerB',
    'admin',
  ],
  managers: {
    zhang: 'li',
    assistant: 'li',
    li: 'wang',
    zhao: 'wang',
    wang: 'vp',
    vp: 'ceo',
    secEng: 'secLead',
    riskA: 'riskLead',
    legalA: 'legalLead',
    legalB: 'legalLead',
    legalC: 'legalLead',
    finA: 'sup',
    finB: 'sup',
    finC: 'sup',
  },
  roles: {
    hr: ['hr'],
    vp: ['vp'],
    ceo: ['ceo'],
    finance: ['finA', 'finB', 'finC'],
    financeApprover: ['finA'],
    treasurer: ['finB'],
    poolSupervisor: ['sup'],
    legal: ['legalA', 'legalB', 'legalC'],
    legalLead: ['legalLead'],
    lawyer: ['lawyer'],
    committee: ['m1', 'm2', 'm3', 'm4', 'm5'],
    procurement: ['buyerA', 'buyerB'],
    contractApprover: ['li'],
    grantAuthority: ['finA'],
    it: ['itA'],
    security: ['secA'],
    secLead: ['secLead'],
    facilities: ['facA'],
    ops: ['opsA'],
    itOps: ['itOpsA'],
    facOps: ['facOpsA'],
    hrOps: ['hrA'],
    riskOfficer: ['riskA'],
    riskHead: ['riskLead'],
    supplierOps: ['opsA'],
    approvalAdmin: ['admin'],
  },
  proxies: { assistant: ['zhang'] },
});

/** The departments that review a purchase, by the category of an item. */
const PURCHASE_CATEGORIES: ReadonlyMap<string, DepartmentReview> = new Map([
  ['server', { department: 'it', title: 'IT', reviewers: 'it' }],
  [
    'software',
    {
      department: 'security',
      title: 'Information security',
      reviewers: 'security',
    },
  ],
  [
    'customerData',
    {
      department: 'legal',
      title: 'Legal',
      reviewers: ['legalA'],
      lead: 'legalLead',
    },
  ],
  [
    'furniture',
    {
      department: 'facilities',
      title: 'Administration',
      reviewers: 'facilities',
    },
  ],
]);

/** Categories bought without a department review. */
const EXEMPT_CATEGORIES: ReadonlySet<string> = new Set(['stationery']);

/** The purchase categories a form offers. */
export const PURCHASE_CATEGORY_KEYS: readonly string[] = [
  ...PURCHASE_CATEGORIES.keys(),
  ...EXEMPT_CATEGORIES,
];

const PLANNERS: Readonly<Record<string, CoordinationPlanner>> = {
  purchase: purchasePlanner(PURCHASE_CATEGORIES, EXEMPT_CATEGORIES),
  launch: launchPlanner(),
  onboarding: onboardingPlanner({
    it: WORK_DEFINITIONS['itOnboarding@v3'],
    admin: WORK_DEFINITIONS['adminOnboarding@v1'],
    hr: WORK_DEFINITIONS['hrOnboarding@v1'],
  }),
};

/** The planner a coordinated request of `kind` is planned by. */
export function plannerOf(kind: string): CoordinationPlanner | undefined {
  return PLANNERS[kind];
}

type AnyLifecycle = Lifecycle<LifecycleTypes>;

/** Every business lifecycle of the example, children included. */
export const LAB_LIFECYCLES: readonly AnyLifecycle[] = [
  leaveLifecycle,
  compensatoryLifecycle,
  ruledLeaveLifecycle,
  financeLifecycle,
  countersignLifecycle,
  committeeLifecycle,
  purchaseLifecycle,
  defineCoordinationLifecycle(PLANNERS),
  branchReviewLifecycle,
  workItemLifecycle,
  contractLifecycle,
  reviewKeepingLifecycle,
  reviewFullLifecycle,
  legalReviewLifecycle,
  expenseLifecycle,
  paymentApprovalLifecycle,
  orderLifecycle,
  supplierLifecycle,
  tripLifecycle,
  poolLifecycle,
  counselLifecycle,
  matterLifecycle,
  reimbursementLifecycle,
  noticeLifecycle,
  paymentLifecycle,
  grantRequestLifecycle,
  grantLifecycle,
] as unknown as readonly AnyLifecycle[];

/** Every approval the businesses wait on. */
export const LAB_APPROVALS: readonly Approval<never>[] = [
  leaveApproval,
  compensatoryApproval,
  ruledLeaveApproval,
  financeApproval,
  countersignApproval,
  committeeApproval,
  purchaseApproval,
  branchReviewApproval,
  contractApproval,
  reviewKeepingApproval,
  reviewFullApproval,
  legalReviewApproval,
  expenseApproval,
  qualifiedApproval,
  supplierLegalApproval,
  supplierRiskApproval,
  tripApproval,
  poolApproval,
  counselApproval,
  matterApproval,
  reimbursementApproval,
  executionApproval,
  grantApproval,
] as unknown as readonly Approval<never>[];

export function lifecycleOf(name: string): AnyLifecycle | undefined {
  return LAB_LIFECYCLES.find((lifecycle) => lifecycle.name === name);
}

/**
 * The parameters a lifecycle runs under in the lab: the versioned leave
 * follows the administrator's rule version, reimbursement lines go to the
 * team of their category, and two grant matters exclude each other.
 */
export function parametersOf(
  name: string,
  settings: () => LabSettings,
): (() => object) | undefined {
  switch (name) {
    case ruledLeaveLifecycle.name:
      return () => ({ ruleVersion: settings().ruleVersion ?? 1 });
    case REIMBURSEMENTS:
      return () => ({
        routing: 'byCategory',
        categoryRoles: { travel: 'finance', hotel: 'facilities' },
      });
    case GRANT_REQUESTS:
      return () => ({
        conflictingMatters: [['priceException', 'fixedPrice']],
      });
    default:
      return undefined;
  }
}

// ---------------------------------------------------------------- forms

function invalid(field: string, message: string): never {
  throw new ExampleError('INVALID', field, message);
}

function textOf(form: JsonObject, field: string, required = true): string {
  const value = form[field];
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (required) invalid(field, `Fill in "${field}".`);
  return '';
}

function count(form: JsonObject, field: string, min = 1): number {
  const value = form[field];
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min)
    invalid(field, `"${field}" must be a whole number of at least ${min}.`);
  return value;
}

function choice<T extends string>(
  form: JsonObject,
  field: string,
  options: readonly T[],
): T {
  const value = form[field];
  if (
    typeof value !== 'string' ||
    !(options as readonly string[]).includes(value)
  )
    invalid(field, `Choose one of ${options.join(', ')} for "${field}".`);
  return value as T;
}

function objects(form: JsonObject, field: string): JsonObject[] {
  const value = form[field];
  if (
    !Array.isArray(value) ||
    !value.length ||
    value.some(
      (item) =>
        typeof item !== 'object' || item === null || Array.isArray(item),
    )
  )
    invalid(field, `"${field}" needs at least one item.`);
  return value as JsonObject[];
}

function instant(form: JsonObject, field: string): string {
  const value = textOf(form, field);
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) invalid(field, `"${field}" must be a date.`);
  return new Date(parsed).toISOString();
}

/** The form fields a record keeps for display only, beside what its lifecycle reads. */
function details(
  item: Demo,
  form: JsonObject,
  fields: readonly string[],
): JsonObject {
  const kept: JsonObject = { demo: item.key };
  for (const field of fields)
    if (form[field] !== undefined) kept[field] = form[field];
  return kept;
}

export interface NewRecord {
  readonly values: Record<string, unknown>;
}

/**
 * The record a demo's form creates, with only the fields its lifecycle
 * expects: a caller cannot set a state, a decision or a reference.
 */
export function newRecord(
  key: DemoKey,
  form: JsonObject,
  actor: string,
  applicantId: string,
): NewRecord {
  const item = demo(key);
  if (!item) invalid('demo', 'Choose a kind of request.');
  const title =
    typeof form.title === 'string' && form.title.trim()
      ? form.title.trim()
      : null;
  const base = { title, applicantId };
  const keep = (fields: readonly string[]): JsonObject =>
    details(item, form, fields);
  switch (key) {
    case 'leave':
      return {
        values: {
          ...base,
          days: count(form, 'days'),
          reason: textOf(form, 'reason'),
          registrationRef: null,
          details: keep(['leaveType', 'startDate', 'endDate']),
        },
      };
    case 'ruledLeave':
    case 'compensatory':
      return {
        values: {
          ...base,
          days: count(form, 'days'),
          details: keep(['reason']),
        },
      };
    case 'trip':
      return {
        values: {
          ...base,
          createdBy: actor,
          submittedBy: null,
          city: textOf(form, 'city'),
          details: keep(['days', 'purpose']),
        },
      };
    case 'purchaseChain':
      return {
        values: {
          ...base,
          amount: count(form, 'amount'),
          details: keep(['item', 'reason']),
        },
      };
    case 'committee':
    case 'expense':
    case 'pool':
    case 'paymentApproval':
    case 'legalReview':
      return {
        values: {
          ...base,
          details: keep(['project', 'amount', 'purpose', 'subject']),
        },
      };
    case 'financeFirst':
    case 'financeAny':
      return {
        values: {
          ...base,
          mode: key === 'financeFirst' ? 'first' : 'any',
          details: keep(['amount', 'purpose']),
        },
      };
    case 'countersign':
      return {
        values: {
          ...base,
          reviewers: null,
          collect: form.collect === true,
          details: keep(['subject']),
        },
      };
    case 'contract':
      return {
        values: {
          ...base,
          title: textOf(form, 'title'),
          amount: count(form, 'amount'),
          details: keep([]),
        },
      };
    case 'contractReview':
    case 'contractFullReview':
      return {
        values: {
          ...base,
          submittedBy: null,
          party: textOf(form, 'party'),
          amount: count(form, 'amount'),
          terms: textOf(form, 'terms'),
          details: keep([]),
        },
      };
    case 'counsel':
      return {
        values: { ...base, title: textOf(form, 'title'), details: keep([]) },
      };
    case 'matter':
      return {
        values: {
          ...base,
          subjectKey: textOf(form, 'subjectKey'),
          details: keep([]),
        },
      };
    case 'reimbursement':
      return {
        values: {
          ...base,
          title: textOf(form, 'title'),
          lines: objects(form, 'lines').map((line, index) => ({
            id: textOf(line, 'id', false) || `line${index + 1}`,
            category: choice(line, 'category', ['travel', 'hotel']),
            description: textOf(line, 'description'),
            amountCents: count(line, 'amountCents'),
          })),
          decisions: null,
          approvedTotalCents: 0,
          payments: null,
          paymentError: null,
          followUpOf: null,
          details: keep([]),
        },
      };
    case 'payment':
      return {
        values: {
          ...base,
          title: textOf(form, 'title'),
          payeeId: textOf(form, 'payeeId'),
          amountCents: count(form, 'amountCents'),
          budgetCode: textOf(form, 'budgetCode'),
          executionMode: choice(form, 'executionMode', [
            'immediate',
            'scheduled',
          ]),
          installments: count(form, 'installments'),
          details: keep([]),
        },
      };
    case 'grantRequest': {
      const supersedes = textOf(form, 'supersedes', false);
      return {
        values: {
          ...base,
          subjectId: textOf(form, 'subjectId'),
          subjectRevision: count(form, 'subjectRevision'),
          matter: textOf(form, 'matter'),
          requested: {
            limitCents:
              form.limitCents === null ? null : count(form, 'limitCents'),
            maxUses: form.maxUses === null ? null : count(form, 'maxUses'),
            validFrom: instant(form, 'validFrom'),
            validUntil: instant(form, 'validUntil'),
          },
          supersedes: supersedes || null,
          approved: null,
          grantId: null,
          details: keep([]),
        },
      };
    }
    case 'supplier':
      return {
        values: {
          ...base,
          name: textOf(form, 'name'),
          registrationNo: textOf(form, 'registrationNo'),
          verificationRound: 0,
          riskLevel: null,
          verificationError: null,
          legalApprovedBy: null,
          approvedAt: null,
          approvalBasis: null,
          depositRef: null,
          account: null,
          accountError: null,
          details: keep([]),
        },
      };
    case 'purchase':
      return {
        values: {
          ...coordinationValues({
            kind: 'purchase',
            title: title ?? 'Purchase',
            applicantId,
            content: {
              items: objects(form, 'items').map((line) => ({
                category: choice(line, 'category', PURCHASE_CATEGORY_KEYS),
                name: textOf(line, 'name'),
                amount: count(line, 'amount'),
              })),
            },
          }),
          details: keep([]),
        },
      };
    case 'onboarding':
      return {
        values: {
          ...coordinationValues({
            kind: 'onboarding',
            title: title ?? `Onboarding: ${textOf(form, 'employee')}`,
            applicantId,
            content: {
              employee: textOf(form, 'employee'),
              remote: form.remote === true,
            },
          }),
          details: keep([]),
        },
      };
    case 'launch':
      return {
        values: {
          ...coordinationValues({
            kind: 'launch',
            title: title ?? `Launch: ${textOf(form, 'product')}`,
            applicantId,
            content: {
              product: textOf(form, 'product'),
              budget: count(form, 'budget'),
            },
          }),
          details: keep([]),
        },
      };
    case 'notice':
      return {
        values: {
          title: textOf(form, 'title'),
          publisherId: actor,
          mode: choice(form, 'mode', ['notify', 'receipt', 'confirmAll']),
          recipientIds: Array.isArray(form.recipientIds)
            ? form.recipientIds.filter(
                (person): person is string => typeof person === 'string',
              )
            : [],
          publishedAt: null,
          effectiveAt: null,
          details: keep([]),
        },
      };
    case 'order':
      return {
        values: {
          title,
          customerId: actor,
          amountCents: count(form, 'amountCents'),
          payBy: null,
          paymentRef: null,
          shipmentNo: null,
          refundRef: null,
          details: keep([]),
        },
      };
  }
}

/** The demo a record was started as, from what it keeps of its form. */
export function demoOf(
  lifecycle: string,
  record: LifecycleRecord,
): DemoKey | null {
  const kept: unknown = record.details;
  if (
    typeof kept === 'object' &&
    kept !== null &&
    !Array.isArray(kept) &&
    'demo' in kept &&
    typeof kept.demo === 'string' &&
    demo(kept.demo)
  )
    return kept.demo as DemoKey;
  if (lifecycle === COORDINATIONS && typeof record.kind === 'string')
    return demo(record.kind)?.key ?? null;
  return null;
}
