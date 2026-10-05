import { text as str } from '../../shared/text.js';
import type { JsonObject } from '@nocobase/lifecycle';

import { APPROVAL_DEMOS } from '../../shared/approval-lab.js';
import type { FieldSpec } from './fields.js';

/**
 * How a person fills in each kind of request, and how a submitted one is
 * shown. A form edits a draft of the values the create route takes.
 */
export interface RequestTypeSpec {
  readonly key: string;
  readonly lifecycle: string;
  readonly fields: (actor: string) => readonly FieldSpec[];
  readonly initial: (actor: string) => JsonObject;
  /** The create route's body. */
  readonly values: (form: JsonObject) => JsonObject;
  /** The content a preview plans the flow from; none shows a fixed flow. */
  readonly previewContent?: (form: JsonObject) => JsonObject;
}

const today = (): string => new Date().toISOString().slice(0, 10);
const inDays = (days: number): string =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

function daysBetween(start: unknown, end: unknown): number {
  const from = Date.parse(typeof start === 'string' ? start : '');
  const to = Date.parse(typeof end === 'string' ? end : '');
  if (Number.isNaN(from) || Number.isNaN(to) || to < from) return 0;
  return Math.round((to - from) / 86_400_000) + 1;
}

function content(form: JsonObject): JsonObject {
  const value = form.content;
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
}

/** Approval requests and coordinated requests: a title and free content. */
function contentRequest(
  key: string,
  lifecycle: 'approvalRequests' | 'coordinations',
  fields: readonly FieldSpec[],
  initialContent: () => JsonObject,
  options: {
    readonly title?: (content: JsonObject) => string;
    readonly derive?: (content: JsonObject) => JsonObject;
    readonly proxy?: boolean;
  } = {},
): RequestTypeSpec {
  const derive = options.derive ?? ((value: JsonObject) => value);
  return {
    key,
    lifecycle,
    fields: () => [
      ...(options.proxy
        ? [
            {
              name: 'applicantId',
              kind: 'person',
              required: true,
              hint: 'center.form.proxyHint',
            } as const,
          ]
        : []),
      ...fields,
    ],
    initial: (actor) => ({
      applicantId: options.proxy && actor === 'assistant' ? 'zhang' : actor,
      content: initialContent(),
    }),
    values: (form) => {
      const derived = derive(content(form));
      return {
        ...(options.title ? { title: options.title(derived) } : {}),
        ...(typeof form.applicantId === 'string' && form.applicantId
          ? { applicantId: form.applicantId }
          : {}),
        content: derived,
      };
    },
    previewContent: (form) => derive(content(form)),
  };
}

const leaveFields: readonly FieldSpec[] = [
  {
    name: 'content.leaveType',
    kind: 'select',
    group: 'leaveType',
    options: ['annual', 'personal', 'sick', 'compensatory'],
    required: true,
  },
  {
    name: 'content.days',
    kind: 'number',
    min: 1,
    required: true,
    hint: 'center.form.daysHint',
  },
  { name: 'content.startDate', kind: 'date', required: true },
  { name: 'content.endDate', kind: 'date', required: true },
  { name: 'content.handover', kind: 'person' },
  { name: 'content.reason', kind: 'textarea', required: true },
];

function withLeaveDays(value: JsonObject): JsonObject {
  const days = daysBetween(value.startDate, value.endDate);
  return days > 0 ? { ...value, days } : value;
}

const purchaseItem = (): JsonObject => ({
  category: 'hardware',
  name: '',
  amount: 0,
});

export const REQUEST_TYPES: readonly RequestTypeSpec[] = [
  contentRequest(
    'leaveTiered',
    'approvalRequests',
    leaveFields,
    () => ({
      leaveType: 'annual',
      startDate: inDays(7),
      endDate: inDays(8),
      days: 2,
      handover: null,
      reason: '',
    }),
    { derive: withLeaveDays },
  ),
  contentRequest(
    'travel',
    'approvalRequests',
    [
      { name: 'content.destination', kind: 'text', required: true },
      {
        name: 'content.days',
        kind: 'number',
        min: 1,
        required: true,
        hint: 'center.form.daysHint',
      },
      { name: 'content.startDate', kind: 'date', required: true },
      { name: 'content.endDate', kind: 'date', required: true },
      { name: 'content.budget', kind: 'money' },
      {
        name: 'content.transport',
        kind: 'select',
        group: 'transport',
        options: ['train', 'flight', 'car'],
      },
      { name: 'content.purpose', kind: 'textarea', required: true },
    ],
    () => ({
      destination: '',
      startDate: inDays(3),
      endDate: inDays(5),
      days: 3,
      budget: 3000,
      transport: 'train',
      purpose: '',
    }),
    { derive: withLeaveDays, proxy: true },
  ),
  contentRequest(
    'purchaseChain',
    'approvalRequests',
    [
      { name: 'content.item', kind: 'text', required: true },
      { name: 'content.quantity', kind: 'number', min: 1 },
      {
        name: 'content.amount',
        kind: 'money',
        required: true,
        hint: 'center.form.purchaseAmountHint',
      },
      { name: 'content.supplier', kind: 'text' },
      { name: 'content.reason', kind: 'textarea', required: true },
    ],
    () => ({ item: '', quantity: 1, amount: 0, supplier: '', reason: '' }),
  ),
  contentRequest(
    'purchase',
    'coordinations',
    [
      {
        name: 'content.items',
        kind: 'items',
        required: true,
        create: purchaseItem,
        columns: [
          {
            name: 'category',
            kind: 'select',
            group: 'purchaseCategory',
            options: ['hardware', 'office'],
          },
          { name: 'name', kind: 'text', label: 'center.fields.itemName' },
          { name: 'amount', kind: 'money' },
        ],
      },
      { name: 'content.reason', kind: 'textarea', required: true },
    ],
    () => ({
      items: [
        { category: 'hardware', name: '', amount: 0 },
        { category: 'office', name: '', amount: 0 },
      ],
      reason: '',
    }),
  ),
  contentRequest(
    'committee',
    'approvalRequests',
    [
      { name: 'content.project', kind: 'text', required: true },
      { name: 'content.amount', kind: 'money', required: true },
      { name: 'content.reason', kind: 'textarea', required: true },
    ],
    () => ({ project: '', amount: 200000, reason: '' }),
  ),
  contentRequest(
    'contract',
    'approvalRequests',
    [
      { name: 'content.party', kind: 'text', required: true },
      { name: 'content.amount', kind: 'money', required: true },
      {
        name: 'content.terms',
        kind: 'text',
        required: true,
        hint: 'center.form.termsHint',
      },
      { name: 'content.summary', kind: 'textarea' },
    ],
    () => ({ party: '', amount: 0, terms: 'Net 30', summary: '' }),
  ),
  contentRequest(
    'contractCountersign',
    'approvalRequests',
    [
      { name: 'content.party', kind: 'text', required: true },
      { name: 'content.amount', kind: 'money', required: true },
      {
        name: 'content.collect',
        kind: 'checkbox',
        hint: 'center.form.collectHint',
      },
      { name: 'content.summary', kind: 'textarea' },
    ],
    () => ({ party: '', amount: 0, collect: false, summary: '' }),
  ),
  contentRequest(
    'legalReview',
    'approvalRequests',
    [
      { name: 'content.party', kind: 'text', required: true },
      { name: 'content.terms', kind: 'text', required: true },
      { name: 'content.summary', kind: 'textarea' },
    ],
    () => ({ party: '', terms: '', summary: '' }),
  ),
  contentRequest(
    'consulted',
    'approvalRequests',
    [
      { name: 'content.party', kind: 'text', required: true },
      { name: 'content.terms', kind: 'text', required: true },
      { name: 'content.summary', kind: 'textarea' },
    ],
    () => ({ party: '', terms: '', summary: '' }),
  ),
  {
    key: 'reimbursement',
    lifecycle: 'reimbursements',
    fields: () => [
      {
        name: 'title',
        kind: 'text',
        required: true,
        label: 'center.fields.reimbursementTitle',
      },
      {
        name: 'lines',
        kind: 'items',
        required: true,
        create: () => ({ category: 'travel', description: '', amountCents: 0 }),
        columns: [
          {
            name: 'category',
            kind: 'select',
            group: 'expenseCategory',
            options: ['travel', 'hotel'],
          },
          { name: 'description', kind: 'text' },
          { name: 'amountCents', kind: 'cents' },
        ],
      },
    ],
    initial: () => ({
      title: '',
      lines: [
        { category: 'travel', description: '', amountCents: 0 },
        { category: 'hotel', description: '', amountCents: 0 },
      ],
    }),
    values: (form) => ({
      title: form.title ?? '',
      lines: (Array.isArray(form.lines) ? form.lines : []).map(
        (line, index) => ({
          ...(line as JsonObject),
          id: `line${index + 1}`,
          approverId: null,
          contentHash: null,
          decision: null,
        }),
      ),
    }),
  },
  {
    key: 'payment',
    lifecycle: 'paymentRequests',
    fields: () => [
      {
        name: 'title',
        kind: 'text',
        required: true,
        label: 'center.fields.paymentTitle',
      },
      { name: 'payeeId', kind: 'text', required: true },
      { name: 'amountCents', kind: 'cents', required: true },
      {
        name: 'budgetCode',
        kind: 'select',
        group: 'budgetCode',
        options: ['general', 'marketing'],
      },
      {
        name: 'executionMode',
        kind: 'select',
        group: 'executionMode',
        options: ['immediate', 'scheduled'],
      },
      {
        name: 'installments',
        kind: 'number',
        min: 1,
        hint: 'center.form.installmentsHint',
      },
    ],
    initial: () => ({
      title: '',
      payeeId: '',
      amountCents: 1000000,
      budgetCode: 'general',
      executionMode: 'scheduled',
      installments: 1,
    }),
    values: (form) => form,
  },
  contentRequest(
    'financePool',
    'approvalRequests',
    [
      { name: 'content.amount', kind: 'money', required: true },
      { name: 'content.returnDate', kind: 'date' },
      { name: 'content.purpose', kind: 'textarea', required: true },
    ],
    () => ({ amount: 5000, returnDate: inDays(30), purpose: '' }),
  ),
  {
    key: 'authorization',
    lifecycle: 'authorizationRequests',
    fields: () => [
      {
        name: 'title',
        kind: 'text',
        required: true,
        label: 'center.fields.authorizationTitle',
      },
      { name: 'subjectId', kind: 'text', required: true },
      {
        name: 'matter',
        kind: 'select',
        group: 'matter',
        options: ['budget', 'priceException', 'paymentTerms'],
      },
      { name: 'requested.limitCents', kind: 'cents', required: true },
      { name: 'requested.maxUses', kind: 'number', min: 1 },
      { name: 'requested.validFrom', kind: 'date', required: true },
      { name: 'requested.validUntil', kind: 'date', required: true },
      { name: 'supersedes', kind: 'text', hint: 'center.form.supersedesHint' },
    ],
    initial: () => ({
      title: '',
      subjectId: 'HT-2026-042',
      subjectRevision: 1,
      matter: 'budget',
      supersedes: '',
      requested: {
        limitCents: 5000000,
        maxUses: 3,
        validFrom: today(),
        validUntil: inDays(90),
      },
    }),
    values: (form) => {
      const requested = (form.requested ?? {}) as JsonObject;
      const instant = (value: unknown): string =>
        typeof value === 'string' && value.length === 10
          ? `${value}T00:00:00.000Z`
          : str(value);
      return {
        ...form,
        requested: {
          ...requested,
          validFrom: instant(requested.validFrom),
          validUntil: instant(requested.validUntil),
        },
      };
    },
  },
  {
    key: 'supplier',
    lifecycle: 'supplierOnboardings',
    fields: () => [
      {
        name: 'name',
        kind: 'text',
        required: true,
        label: 'center.fields.supplierName',
      },
      { name: 'registrationNo', kind: 'text', required: true },
    ],
    initial: () => ({ name: '', registrationNo: '' }),
    values: (form) => ({ ...form, title: form.name ?? '' }),
  },
  contentRequest(
    'onboarding',
    'coordinations',
    [
      { name: 'content.employee', kind: 'text', required: true },
      { name: 'content.position', kind: 'text', required: true },
      { name: 'content.startDate', kind: 'date', required: true },
      {
        name: 'content.remote',
        kind: 'checkbox',
        hint: 'center.form.remoteHint',
      },
    ],
    () => ({
      employee: '',
      position: '',
      startDate: inDays(14),
      remote: false,
    }),
    {
      title: (value) => str(value.employee),
    },
  ),
  contentRequest(
    'launch',
    'coordinations',
    [
      { name: 'content.product', kind: 'text', required: true },
      { name: 'content.version', kind: 'text' },
      { name: 'content.launchDate', kind: 'date', required: true },
      { name: 'content.budget', kind: 'money', required: true },
      { name: 'content.summary', kind: 'textarea' },
    ],
    () => ({
      product: '',
      version: '1.0',
      launchDate: inDays(30),
      budget: 120000,
      summary: '',
    }),
  ),
  {
    key: 'notice',
    lifecycle: 'notices',
    fields: () => [
      {
        name: 'title',
        kind: 'text',
        required: true,
        label: 'center.fields.noticeTitle',
      },
      {
        name: 'mode',
        kind: 'select',
        group: 'noticeMode',
        options: ['confirmAll', 'receipt', 'notify'],
      },
      { name: 'recipientIds', kind: 'people', required: true },
    ],
    initial: () => ({
      title: '',
      mode: 'confirmAll',
      recipientIds: ['li', 'wang'],
    }),
    values: (form) => form,
  },
];

export function requestType(key: string | null): RequestTypeSpec | undefined {
  return REQUEST_TYPES.find((spec) => spec.key === key);
}

/** The lifecycle a demo key creates records of. */
export function lifecycleOfType(key: string): string | undefined {
  return APPROVAL_DEMOS.find((demo) => demo.key === key)?.lifecycle;
}

/** The fields a request of this kind shows, by path into the record. */
export const DISPLAY: Readonly<Record<string, readonly FieldSpec[]>> = (() => {
  const leave: readonly FieldSpec[] = [
    {
      name: 'content.leaveType',
      kind: 'select',
      group: 'leaveType',
      options: [],
    },
    { name: 'content.days', kind: 'number' },
    { name: 'content.startDate', kind: 'date' },
    { name: 'content.endDate', kind: 'date' },
    { name: 'content.handover', kind: 'person' },
    { name: 'content.reason', kind: 'textarea' },
  ];
  const contract: readonly FieldSpec[] = [
    { name: 'content.party', kind: 'text' },
    { name: 'content.amount', kind: 'money' },
    { name: 'content.terms', kind: 'text' },
    { name: 'content.summary', kind: 'textarea' },
  ];
  const finance: readonly FieldSpec[] = [
    { name: 'content.amount', kind: 'money' },
    { name: 'content.returnDate', kind: 'date' },
    { name: 'content.purpose', kind: 'textarea' },
  ];
  const branch: readonly FieldSpec[] = [
    { name: 'content.amount', kind: 'money' },
    { name: 'content.product', kind: 'text' },
    { name: 'content.budget', kind: 'money' },
  ];
  return {
    leaveTiered: leave,
    leaveVersioned: leave,
    leaveAtSubmit: leave,
    leave: [
      { name: 'days', kind: 'number' },
      { name: 'reason', kind: 'textarea' },
    ],
    travel: [
      { name: 'content.destination', kind: 'text' },
      { name: 'content.days', kind: 'number' },
      { name: 'content.startDate', kind: 'date' },
      { name: 'content.endDate', kind: 'date' },
      { name: 'content.budget', kind: 'money' },
      {
        name: 'content.transport',
        kind: 'select',
        group: 'transport',
        options: [],
      },
      { name: 'content.purpose', kind: 'textarea' },
    ],
    purchaseChain: [
      { name: 'content.item', kind: 'text' },
      { name: 'content.quantity', kind: 'number' },
      { name: 'content.amount', kind: 'money' },
      { name: 'content.supplier', kind: 'text' },
      { name: 'content.reason', kind: 'textarea' },
    ],
    committee: [
      { name: 'content.project', kind: 'text' },
      { name: 'content.amount', kind: 'money' },
      { name: 'content.reason', kind: 'textarea' },
    ],
    purchase: [{ name: 'content.reason', kind: 'textarea' }],
    itReview: branch,
    facilitiesReview: branch,
    contract,
    contractCountersign: [
      ...contract,
      {
        name: 'content.collect',
        kind: 'checkbox',
        hint: 'center.form.collectHint',
      },
    ],
    contractFullReview: contract,
    legalReview: contract,
    consulted: contract,
    contractMatter: [
      { name: 'subjectKey', kind: 'text' },
      { name: 'content.amount', kind: 'money' },
    ],
    financeFirst: finance,
    financeAny: finance,
    financeSingle: finance,
    financePool: finance,
    launchSecurity: branch,
    launchLegal: branch,
    launchFinance: branch,
    launch: [
      { name: 'content.product', kind: 'text' },
      { name: 'content.version', kind: 'text' },
      { name: 'content.launchDate', kind: 'date' },
      { name: 'content.budget', kind: 'money' },
      { name: 'content.summary', kind: 'textarea' },
    ],
    onboarding: [
      { name: 'content.employee', kind: 'text' },
      { name: 'content.position', kind: 'text' },
      { name: 'content.startDate', kind: 'date' },
      { name: 'content.remote', kind: 'checkbox' },
    ],
    payment: [
      { name: 'payeeId', kind: 'text' },
      { name: 'amountCents', kind: 'cents' },
      { name: 'budgetCode', kind: 'select', group: 'budgetCode', options: [] },
      {
        name: 'executionMode',
        kind: 'select',
        group: 'executionMode',
        options: [],
      },
      { name: 'installments', kind: 'number' },
      { name: 'executeAt', kind: 'datetime' },
    ],
    authorization: [
      { name: 'subjectId', kind: 'text' },
      { name: 'matter', kind: 'select', group: 'matter', options: [] },
      { name: 'requested.limitCents', kind: 'cents' },
      { name: 'requested.maxUses', kind: 'number' },
      { name: 'requested.validFrom', kind: 'date' },
      { name: 'requested.validUntil', kind: 'date' },
      { name: 'supersedes', kind: 'text' },
    ],
    grant: [
      { name: 'subjectId', kind: 'text' },
      { name: 'matter', kind: 'select', group: 'matter', options: [] },
      { name: 'limitCents', kind: 'cents' },
      { name: 'maxUses', kind: 'number' },
      { name: 'validFrom', kind: 'date' },
      { name: 'validUntil', kind: 'date' },
    ],
    supplier: [
      { name: 'name', kind: 'text', label: 'center.fields.supplierName' },
      { name: 'registrationNo', kind: 'text' },
      { name: 'riskLevel', kind: 'select', group: 'risk', options: [] },
      { name: 'account', kind: 'text' },
    ],
    notice: [
      { name: 'mode', kind: 'select', group: 'noticeMode', options: [] },
      { name: 'publishedAt', kind: 'datetime' },
      { name: 'effectiveAt', kind: 'datetime' },
    ],
    reimbursement: [],
  };
})();

/** The fixed path of the request kinds whose route does not depend on content. */
export const STATIC_FLOWS: Readonly<Record<string, readonly string[]>> = {
  reimbursement: ['submit', 'lineReview', 'payment', 'finished'],
  payment: ['submit', 'financeApproval', 'treasurerPayment', 'finished'],
  authorization: ['submit', 'contractApproval', 'grantActive'],
  supplier: [
    'submit',
    'legalReview',
    'registryCheck',
    'riskReview',
    'deposit',
    'account',
    'admitted',
  ],
  notice: ['publish', 'confirmation', 'effective'],
};
