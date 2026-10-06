import type { JsonObject } from '@nocobase/lifecycle';

import { demo, WORK_DEFINITIONS, type DemoKey } from '../../shared/catalog.js';
import { text as str } from '../../shared/text.js';
import type { FieldSpec } from './fields.js';

/**
 * How a person fills in each kind of request, and what each action asks of
 * them. A request form edits the values the create route takes; an action
 * form edits the input its transition or operation takes.
 */

const PURCHASE_CATEGORIES = [
  'server',
  'software',
  'customerData',
  'furniture',
  'stationery',
];

const reason: FieldSpec = { name: 'reason', kind: 'textarea', required: true };

const amountPurpose: readonly FieldSpec[] = [
  { name: 'amount', kind: 'money', required: true },
  { name: 'purpose', kind: 'text', required: true },
];

const REQUEST_FIELDS: Readonly<Record<DemoKey, readonly FieldSpec[]>> = {
  leave: [
    {
      name: 'leaveType',
      kind: 'select',
      group: 'leaveType',
      options: ['annual', 'personal', 'sick', 'compensatory'],
      required: true,
    },
    { name: 'days', kind: 'number', min: 1, required: true },
    { name: 'startDate', kind: 'date' },
    { name: 'endDate', kind: 'date' },
    { name: 'reason', kind: 'textarea', required: true },
  ],
  ruledLeave: [
    { name: 'days', kind: 'number', min: 1, required: true },
    { name: 'reason', kind: 'textarea' },
  ],
  compensatory: [
    {
      name: 'days',
      kind: 'number',
      min: 1,
      required: true,
      hint: 'form.compensatoryHint',
    },
    { name: 'reason', kind: 'textarea' },
  ],
  trip: [
    {
      name: 'applicantId',
      kind: 'person',
      required: true,
      hint: 'form.proxyHint',
    },
    { name: 'city', kind: 'text', required: true },
    { name: 'days', kind: 'number', min: 1 },
    { name: 'purpose', kind: 'textarea' },
  ],
  purchaseChain: [
    { name: 'item', kind: 'text', required: true },
    { name: 'amount', kind: 'money', required: true },
    { name: 'reason', kind: 'textarea' },
  ],
  purchase: [
    {
      name: 'items',
      kind: 'items',
      required: true,
      columns: [
        {
          name: 'category',
          kind: 'select',
          group: 'purchaseCategory',
          options: PURCHASE_CATEGORIES,
        },
        { name: 'name', kind: 'text' },
        { name: 'amount', kind: 'money' },
      ],
      create: () => ({ category: 'server', name: '', amount: 0 }),
    },
  ],
  committee: [
    { name: 'project', kind: 'text', required: true },
    { name: 'amount', kind: 'money', required: true },
  ],
  contract: [
    { name: 'title', kind: 'text', required: true },
    { name: 'amount', kind: 'money', required: true },
  ],
  contractReview: [
    { name: 'party', kind: 'text', required: true },
    { name: 'amount', kind: 'money', required: true },
    { name: 'terms', kind: 'textarea', required: true },
  ],
  contractFullReview: [
    { name: 'party', kind: 'text', required: true },
    { name: 'amount', kind: 'money', required: true },
    { name: 'terms', kind: 'textarea', required: true },
  ],
  countersign: [
    { name: 'subject', kind: 'text', required: true },
    { name: 'collect', kind: 'checkbox', hint: 'form.collectHint' },
  ],
  legalReview: [{ name: 'subject', kind: 'text', required: true }],
  counsel: [{ name: 'title', kind: 'text', required: true }],
  matter: [
    {
      name: 'subjectKey',
      kind: 'text',
      required: true,
      hint: 'form.subjectKeyHint',
    },
  ],
  reimbursement: [
    { name: 'title', kind: 'text', required: true },
    {
      name: 'lines',
      kind: 'items',
      required: true,
      columns: [
        {
          name: 'category',
          kind: 'select',
          group: 'lineCategory',
          options: ['travel', 'hotel'],
        },
        { name: 'description', kind: 'text' },
        { name: 'amountCents', kind: 'cents' },
      ],
      create: () => ({
        id: `line${Date.now()}`,
        category: 'travel',
        description: '',
        amountCents: 0,
      }),
    },
  ],
  expense: amountPurpose,
  payment: [
    { name: 'title', kind: 'text', required: true },
    { name: 'payeeId', kind: 'text', required: true },
    { name: 'amountCents', kind: 'cents', required: true },
    { name: 'budgetCode', kind: 'text', required: true },
    {
      name: 'executionMode',
      kind: 'select',
      group: 'executionMode',
      options: ['immediate', 'scheduled'],
      required: true,
    },
    { name: 'installments', kind: 'number', min: 1, required: true },
  ],
  financeFirst: amountPurpose,
  financeAny: amountPurpose,
  pool: amountPurpose,
  paymentApproval: amountPurpose,
  grantRequest: [
    { name: 'subjectId', kind: 'text', required: true },
    { name: 'subjectRevision', kind: 'number', min: 1, required: true },
    {
      name: 'matter',
      kind: 'select',
      group: 'matter',
      options: ['priceException', 'fixedPrice', 'budget'],
      required: true,
    },
    { name: 'supersedes', kind: 'text', hint: 'form.supersedesHint' },
    { name: 'limitCents', kind: 'cents' },
    { name: 'maxUses', kind: 'number', min: 1 },
    { name: 'validFrom', kind: 'date', required: true },
    { name: 'validUntil', kind: 'date', required: true },
  ],
  supplier: [
    { name: 'name', kind: 'text', required: true },
    { name: 'registrationNo', kind: 'text', required: true },
  ],
  onboarding: [
    { name: 'employee', kind: 'text', required: true },
    { name: 'remote', kind: 'checkbox', hint: 'form.remoteHint' },
  ],
  launch: [
    { name: 'product', kind: 'text', required: true },
    { name: 'budget', kind: 'money', required: true },
  ],
  notice: [
    { name: 'title', kind: 'text', required: true },
    {
      name: 'mode',
      kind: 'select',
      group: 'noticeMode',
      options: ['notify', 'receipt', 'confirmAll'],
      required: true,
    },
    { name: 'recipientIds', kind: 'people', required: true },
  ],
  order: [{ name: 'amountCents', kind: 'cents', required: true }],
};

/** The form a new request of `key` is filled in with. */
export function requestFields(key: DemoKey): readonly FieldSpec[] {
  return REQUEST_FIELDS[key];
}

/** What a new request starts as for `actor`: the demo's sample. */
export function initialForm(key: DemoKey, actor: string): JsonObject {
  const item = demo(key);
  const sample = item?.sample() ?? {};
  return item?.proxy
    ? { ...sample, applicantId: actor === 'assistant' ? 'zhang' : actor }
    : sample;
}

const COORDINATED: ReadonlySet<string> = new Set([
  'purchase',
  'launch',
  'onboarding',
]);

/** The fields a request's detail shows, as paths in its facts. */
export function displayFields(key: DemoKey | null): readonly FieldSpec[] {
  if (!key) return [];
  const specs = REQUEST_FIELDS[key].filter(
    (spec) =>
      spec.kind !== 'items' &&
      spec.name !== 'applicantId' &&
      spec.name !== 'title',
  );
  if (COORDINATED.has(key))
    return specs.map((spec) => ({ ...spec, name: `content.${spec.name}` }));
  if (key === 'grantRequest')
    return specs.map((spec) =>
      ['limitCents', 'maxUses', 'validFrom', 'validUntil'].includes(spec.name)
        ? { ...spec, name: `requested.${spec.name}` }
        : spec,
    );
  return specs;
}

// ---------------------------------------------------------------- actions

/** The input a business transition asks for, by lifecycle and name. */
const TRANSITION_FIELDS: Readonly<Record<string, readonly FieldSpec[]>> = {
  'scenarioOrders.refund': [
    { name: 'refundRef', kind: 'text', required: true },
  ],
  'scenarioSuppliers.verifyManually': [
    {
      name: 'risk',
      kind: 'select',
      group: 'risk',
      options: ['low', 'high'],
      required: true,
    },
    { name: 'evidence', kind: 'textarea', required: true },
  ],
  'scenarioSuppliers.recheck': [
    reason,
    { name: 'registrationNo', kind: 'text' },
  ],
  'scenarioSuppliers.abandon': [reason],
  'scenarioPayments.schedule': [
    { name: 'executeAt', kind: 'datetime', required: true },
  ],
  'scenarioPayments.requestReapproval': [reason],
  'scenarioPayments.terminate': [reason],
  'scenarioGrants.revoke': [reason],
  'scenarioCoordinations.cancel': [{ ...reason, required: false }],
  'scenarioWorkItems.cancel': [{ ...reason, required: false }],
  'scenarioWorkItems.compensate': [{ ...reason, required: false }],
  'scenarioWorkItems.upgrade': [
    {
      name: 'definition',
      kind: 'select',
      group: 'workDefinition',
      options: Object.keys(WORK_DEFINITIONS),
      labels: Object.fromEntries(
        Object.keys(WORK_DEFINITIONS).map((name) => [name, name]),
      ),
      required: true,
    },
  ],
  'scenarioNotices.addRecipients': [
    { name: 'recipientIds', kind: 'people', required: true },
  ],
  'scenarioContractReviews.edit': REQUEST_FIELDS.contractReview,
  'scenarioContractFullReviews.edit': REQUEST_FIELDS.contractFullReview,
  'scenarioReimbursements.resubmit': [
    {
      name: 'lines',
      kind: 'items',
      required: true,
      columns: [
        {
          name: 'category',
          kind: 'select',
          group: 'lineCategory',
          options: ['travel', 'hotel'],
        },
        { name: 'description', kind: 'text' },
        { name: 'amountCents', kind: 'cents' },
      ],
      create: () => ({
        id: `line${Date.now()}`,
        category: 'travel',
        description: '',
        amountCents: 0,
      }),
    },
  ],
};

export interface TransitionForm {
  readonly fields: readonly FieldSpec[];
  /** The form's starting values, from the record where it edits it. */
  readonly initial: JsonObject;
  /** The transition's input from the form's values. */
  readonly input: (form: JsonObject) => JsonObject;
}

function objectOf(value: unknown): JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

/** The form a business transition opens, or none when it takes no input. */
export function transitionForm(
  lifecycle: string,
  name: string,
  record: JsonObject,
  demoKey: DemoKey | null,
): TransitionForm | null {
  if (lifecycle === 'scenarioCoordinations' && name === 'revise' && demoKey) {
    const fields = REQUEST_FIELDS[demoKey];
    return {
      fields,
      initial: objectOf(record.content),
      input: (form) => ({ content: form }),
    };
  }
  const fields = TRANSITION_FIELDS[`${lifecycle}.${name}`];
  if (!fields) return null;
  if (name === 'edit')
    return {
      fields,
      initial: {
        party: record.party ?? '',
        amount: record.amount ?? 0,
        terms: record.terms ?? '',
      },
      input: (form) => form,
    };
  if (name === 'resubmit') {
    const decisions = objectOf(record.decisions);
    const lines = Array.isArray(record.lines) ? record.lines : [];
    return {
      fields,
      initial: {
        lines: lines.filter(
          (line) =>
            objectOf(decisions[str(objectOf(line).id)]).outcome === 'return',
        ),
      },
      input: (form) => ({ lines: form.lines ?? [] }),
    };
  }
  if (name === 'upgrade')
    return {
      fields,
      initial: { definition: '' },
      input: (form): JsonObject => {
        const chosen = WORK_DEFINITIONS[str(form.definition)];
        return chosen
          ? {
              definition: chosen.definition,
              steps: chosen.steps.map((step) => ({ ...step })),
            }
          : {};
      },
    };
  return { fields, initial: {}, input: (form) => form };
}

/** The input each task action asks for. */
export function taskFields(
  action: string,
  options: {
    readonly answers: readonly string[];
    readonly returnTargets: readonly string[];
    readonly revisable: readonly string[];
    readonly itemized: boolean;
  },
): readonly FieldSpec[] {
  switch (action) {
    case 'respond':
      return [
        ...(options.answers.length > 1
          ? [
              {
                name: 'answer',
                kind: 'select',
                group: 'answer',
                options: options.answers,
                required: true,
              } as const,
            ]
          : []),
        ...(options.itemized
          ? [
              {
                name: 'data.approvedCents',
                kind: 'cents',
                hint: 'form.approvedCentsHint',
              } as const,
            ]
          : []),
        { name: 'comment', kind: 'textarea' },
      ];
    case 'transfer':
      return [{ name: 'to', kind: 'person', required: true }, reason];
    case 'addSigner':
      return [
        { name: 'person', kind: 'person', required: true },
        {
          name: 'mode',
          kind: 'select',
          group: 'signerMode',
          options: ['before', 'after', 'alongside'],
          required: true,
        },
      ];
    case 'consult':
      return [
        { name: 'person', kind: 'person', required: true },
        { name: 'question', kind: 'textarea', required: true },
      ];
    case 'askMaterial':
      return [{ name: 'request', kind: 'textarea', required: true }];
    case 'returnTo':
      return [
        {
          name: 'to',
          kind: 'select',
          group: 'returnTarget',
          options: options.returnTargets,
          required: true,
        },
        reason,
        { name: 'resume', kind: 'checkbox', hint: 'form.resumeHint' },
      ];
    case 'revise':
      return [
        ...options.revisable.map((field): FieldSpec =>
          field === 'amount'
            ? { name: `values.${field}`, kind: 'money' }
            : field === 'terms'
              ? { name: `values.${field}`, kind: 'textarea' }
              : { name: `values.${field}`, kind: 'text' },
        ),
        reason,
      ];
    default:
      return [];
  }
}
