import type { JsonObject, LifecycleRecord } from '@nocobase/lifecycle';
import type { AvailableTransition } from '@nocobase/lifecycle/react';

import {
  assigneeTasks,
  candidatesOf,
  currentStage,
  type ApprovalStageView,
  type ApprovalTrail,
} from '../../shared/approval-trail.js';
import { text as str } from '../../shared/text.js';
import type { FieldSpec } from './fields.js';
import type { CenterText } from './format.js';
import { randomId } from './random.js';
import { requestType } from './types.js';

export interface ActionContext {
  readonly lifecycle: string;
  readonly record: LifecycleRecord;
  readonly actor: string;
  /** The server's form defaults, such as the content hash a decision is made on. */
  readonly defaults: Readonly<Record<string, JsonObject>>;
  /** A staged approval's stages and to-dos; null for other records. */
  readonly trail: ApprovalTrail | null;
  readonly text: CenterText;
}

export type Tone = 'primary' | 'danger' | 'outline';

export interface ActionSpec {
  /** The transition fired; the key may name a variant, such as `decide:reject`. */
  readonly transition: string;
  readonly tone: Tone;
  readonly fields?: (context: ActionContext) => readonly FieldSpec[];
  readonly initial?: (context: ActionContext) => JsonObject;
  readonly input?: (form: JsonObject, context: ActionContext) => JsonObject;
  /** Refusals that depend only on what is typed into the form. */
  readonly inputOnly?: readonly string[];
  /** Whether to show it at all for this record, beyond the guards. */
  readonly when?: (context: ActionContext) => boolean;
  /** A primary action of the record, shown as a button rather than under "more". */
  readonly main?: boolean;
}

const comment = (required = false): FieldSpec => ({
  name: 'comment',
  kind: 'textarea',
  required,
  label: required
    ? 'center.actions.form.reasonRequired'
    : 'center.actions.form.comment',
});
const reason = (required = true): FieldSpec => ({
  name: 'reason',
  kind: 'textarea',
  required,
  label: 'center.actions.form.reason',
});
const PERSON_CODES = [
  'noPerson',
  'inactive',
  'selfApproval',
  'alreadyAssigned',
];

function activeStage(context: ActionContext): ApprovalStageView | undefined {
  return context.trail ? currentStage(context.trail) : undefined;
}

function decide(
  decision: 'approve' | 'reject' | 'abstain',
  tone: Tone,
): ActionSpec {
  return {
    transition: 'decide',
    tone,
    main: true,
    fields: () => [comment(decision === 'reject')],
    input: (form, context) => ({
      decision,
      comment: form.comment ?? '',
      contentHash: context.defaults.decide?.contentHash ?? '',
    }),
    inputOnly: decision === 'abstain' ? [] : ['noAbstention'],
    when: (context) =>
      decision !== 'abstain' || activeStage(context)?.rule.kind === 'threshold',
  };
}

function contentFields(context: ActionContext): readonly FieldSpec[] {
  const kind =
    typeof context.record.kind === 'string' ? context.record.kind : null;
  return (
    requestType(kind)
      ?.fields(context.actor)
      .filter((spec) => spec.name.startsWith('content.')) ?? []
  );
}

/** What each business action asks for, by `<lifecycle>.<key>`; `*` for every lifecycle. */
const ACTIONS: Readonly<Record<string, ActionSpec>> = {
  'approvalRequests.decide:approve': decide('approve', 'primary'),
  'approvalRequests.decide:reject': decide('reject', 'danger'),
  'approvalRequests.decide:abstain': decide('abstain', 'outline'),
  'approvalRequests.claim': {
    transition: 'claim',
    tone: 'primary',
    main: true,
  },
  'approvalRequests.supplyMaterials': {
    transition: 'supplyMaterials',
    tone: 'primary',
    main: true,
    fields: () => [
      {
        name: 'answer',
        kind: 'textarea',
        required: true,
        label: 'center.actions.form.answer',
      },
      {
        name: 'attachments',
        kind: 'text',
        label: 'center.actions.form.attachments',
        hint: 'center.actions.form.attachmentsHint',
      },
    ],
    input: (form) => ({
      answer: form.answer ?? '',
      attachments: str(form.attachments)
        .split(/[,，\s]+/)
        .filter(Boolean),
    }),
  },
  'approvalRequests.answerConsultation': {
    transition: 'answerConsultation',
    tone: 'primary',
    main: true,
    fields: () => [
      {
        name: 'opinion',
        kind: 'textarea',
        required: true,
        label: 'center.actions.form.opinion',
      },
    ],
    input: (form, context) => ({
      id: context.defaults.answerConsultation?.id ?? '',
      opinion: form.opinion ?? '',
    }),
  },
  'approvalRequests.submit': {
    transition: 'submit',
    tone: 'primary',
    main: true,
  },
  'approvalRequests.returnTo': {
    transition: 'returnTo',
    tone: 'outline',
    fields: (context) => {
      const current = activeStage(context);
      const earlier = current
        ? (context.trail?.stages ?? []).filter(
            (stage) => stage.position < current.position,
          )
        : [];
      return [
        {
          name: 'target',
          kind: 'select',
          group: 'returnTarget',
          options: ['applicant', ...earlier.map((stage) => stage.key)],
          labels: Object.fromEntries<string>([
            ['applicant', context.text.t('center.actions.form.applicant')],
            ...earlier.map((stage): [string, string] => [
              stage.key,
              context.text.stage(stage.key, stage.title),
            ]),
          ]),
          label: 'center.actions.form.returnTarget',
        },
        reason(),
      ];
    },
    initial: () => ({ target: 'applicant', reason: '' }),
    inputOnly: ['badTarget'],
  },
  'approvalRequests.transfer': {
    transition: 'transfer',
    tone: 'outline',
    fields: () => [
      {
        name: 'to',
        kind: 'person',
        required: true,
        label: 'center.actions.form.transferTo',
      },
      reason(false),
    ],
    inputOnly: PERSON_CODES,
  },
  'approvalRequests.addSigner': {
    transition: 'addSigner',
    tone: 'outline',
    fields: () => [
      {
        name: 'userId',
        kind: 'person',
        required: true,
        label: 'center.actions.form.signer',
      },
      {
        name: 'mode',
        kind: 'select',
        group: 'signerMode',
        options: ['before', 'after', 'parallel'],
        label: 'center.actions.form.signerMode',
      },
    ],
    initial: () => ({ userId: '', mode: 'after' }),
    inputOnly: [...PERSON_CODES, 'badMode'],
  },
  'approvalRequests.consult': {
    transition: 'consult',
    tone: 'outline',
    fields: () => [
      {
        name: 'expertId',
        kind: 'person',
        required: true,
        label: 'center.actions.form.expert',
      },
      {
        name: 'question',
        kind: 'textarea',
        required: true,
        label: 'center.actions.form.question',
      },
    ],
    inputOnly: PERSON_CODES,
  },
  'approvalRequests.requestMaterials': {
    transition: 'requestMaterials',
    tone: 'outline',
    fields: () => [
      {
        name: 'request',
        kind: 'textarea',
        required: true,
        label: 'center.actions.form.request',
      },
    ],
  },
  'approvalRequests.revise': {
    transition: 'revise',
    tone: 'outline',
    fields: contentFields,
    initial: (context) => ({
      content: (context.record.content ?? {}) as JsonObject,
    }),
    input: (form) => ({ content: form.content ?? {} }),
  },
  'approvalRequests.release': { transition: 'release', tone: 'outline' },
  'approvalRequests.assign': {
    transition: 'assign',
    tone: 'outline',
    fields: (context) => [
      {
        name: 'to',
        kind: 'person',
        required: true,
        people: (() => {
          const stage = activeStage(context);
          return stage ? candidatesOf(stage) : [];
        })(),
        label: 'center.actions.form.assignTo',
      },
    ],
    inputOnly: ['notCandidate'],
  },
  'approvalRequests.reassign': {
    transition: 'reassign',
    tone: 'outline',
    fields: (context) => {
      const stage = activeStage(context);
      const holders = !stage
        ? []
        : stage.rule.kind === 'claim'
          ? candidatesOf(stage)
          : assigneeTasks(stage).map((task) => task.assigneeId);
      return [
        {
          name: 'from',
          kind: 'person',
          people: holders,
          label: 'center.actions.form.reassignFrom',
        },
        {
          name: 'to',
          kind: 'person',
          required: true,
          label: 'center.actions.form.reassignTo',
        },
        reason(),
        {
          name: 'override',
          kind: 'checkbox',
          hint: 'center.actions.form.override',
        },
      ];
    },
    initial: (context) => ({ ...(context.defaults.reassign ?? {}) }),
    inputOnly: [...PERSON_CODES, 'notHolder', 'unqualified'],
  },
  'approvalRequests.withdraw': { transition: 'withdraw', tone: 'outline' },
  'approvalRequests.cancel': {
    transition: 'cancel',
    tone: 'danger',
    fields: (context) => [reason(context.record.status !== 'draft')],
    inputOnly: ['reasonRequired'],
  },
  'leaveRequests.submit': { transition: 'submit', tone: 'primary', main: true },
  'leaveRequests.approve': {
    transition: 'approve',
    tone: 'primary',
    main: true,
    fields: () => [comment()],
  },
  'leaveRequests.reject': {
    transition: 'reject',
    tone: 'danger',
    main: true,
    fields: () => [comment(true)],
  },
  'leaveRequests.retryRegistration': {
    transition: 'retryRegistration',
    tone: 'primary',
    main: true,
  },
  'coordinations.start': { transition: 'start', tone: 'primary', main: true },
  'coordinations.cancel': {
    transition: 'cancel',
    tone: 'danger',
    fields: () => [reason(false)],
    inputOnly: ['reasonRequired'],
  },
  'workItems.retry': { transition: 'retry', tone: 'primary', main: true },
  'workItems.compensate': { transition: 'compensate', tone: 'outline' },
  'workItems.cancel': { transition: 'cancel', tone: 'danger' },
  'acknowledgements.read': { transition: 'read', tone: 'primary', main: true },
  'acknowledgements.confirm': {
    transition: 'confirm',
    tone: 'primary',
    main: true,
    fields: () => [comment()],
  },
  'acknowledgements.comment': {
    transition: 'comment',
    tone: 'outline',
    fields: () => [
      {
        name: 'comment',
        kind: 'textarea',
        required: true,
        label: 'center.actions.form.comment',
      },
    ],
  },
  'notices.publish': { transition: 'publish', tone: 'primary', main: true },
  'notices.addRecipients': {
    transition: 'addRecipients',
    tone: 'outline',
    fields: () => [{ name: 'recipientIds', kind: 'people', required: true }],
    initial: () => ({ recipientIds: [] }),
  },
  'notices.becomeEffective': { transition: 'becomeEffective', tone: 'outline' },
  'notices.withdraw': { transition: 'withdraw', tone: 'danger' },
  'supplierOnboardings.legalApprove': {
    transition: 'legalApprove',
    tone: 'primary',
    main: true,
  },
  'supplierOnboardings.legalReject': {
    transition: 'legalReject',
    tone: 'danger',
    main: true,
    fields: () => [reason()],
  },
  'supplierOnboardings.verifyManually': {
    transition: 'verifyManually',
    tone: 'primary',
    main: true,
    fields: () => [
      {
        name: 'risk',
        kind: 'select',
        group: 'risk',
        options: ['low', 'high'],
        label: 'center.fields.riskLevel',
      },
      reason(),
    ],
    initial: () => ({ risk: 'low', reason: '' }),
  },
  'supplierOnboardings.riskApprove': {
    transition: 'riskApprove',
    tone: 'primary',
    main: true,
    fields: () => [comment()],
  },
  'supplierOnboardings.riskReject': {
    transition: 'riskReject',
    tone: 'danger',
    main: true,
    fields: () => [reason()],
  },
  'supplierOnboardings.recheck': {
    transition: 'recheck',
    tone: 'outline',
    fields: () => [{ name: 'registrationNo', kind: 'text', required: true }],
    initial: (context) => ({
      registrationNo: str(context.record.registrationNo),
    }),
  },
  'supplierOnboardings.escalateRiskReview': {
    transition: 'escalateRiskReview',
    tone: 'outline',
  },
  'supplierOnboardings.retryAccount': {
    transition: 'retryAccount',
    tone: 'primary',
    main: true,
  },
  'supplierOnboardings.abandon': {
    transition: 'abandon',
    tone: 'danger',
    fields: () => [reason(false)],
  },
  'supplierOnboardings.withdraw': {
    transition: 'withdraw',
    tone: 'danger',
    fields: () => [reason(false)],
  },
  'reimbursements.submit': {
    transition: 'submit',
    tone: 'primary',
    main: true,
  },
  'reimbursements.decideLine': {
    transition: 'decideLine',
    tone: 'primary',
    main: true,
    fields: (context) => {
      const lines = pendingLines(context);
      return [
        {
          name: 'lineId',
          kind: 'select',
          group: 'line',
          options: lines.map((line) => line.id),
          labels: Object.fromEntries(
            lines.map((line) => [
              line.id,
              `${line.description || context.text.option('expenseCategory', line.category)} · ${context.text.cents(line.amountCents)}`,
            ]),
          ),
          label: 'center.actions.form.line',
        },
        {
          name: 'outcome',
          kind: 'select',
          group: 'lineOutcomeChoice',
          options: ['approved', 'rejected', 'returned'],
          label: 'center.actions.form.outcome',
        },
        {
          name: 'approvedCents',
          kind: 'cents',
          label: 'center.actions.form.approvedAmount',
          hint: 'center.actions.form.approvedAmountHint',
        },
        comment(),
      ];
    },
    initial: (context) => {
      const line = pendingLines(context)[0];
      return {
        lineId: line?.id ?? '',
        outcome: 'approved',
        approvedCents: line?.amountCents ?? 0,
        comment: '',
      };
    },
    input: (form, context) => {
      const line = pendingLines(context).find(
        (each) => each.id === form.lineId,
      );
      return {
        lineId: form.lineId ?? '',
        outcome: form.outcome ?? 'approved',
        contentHash: line?.contentHash ?? '',
        comment: form.comment ?? '',
        ...(form.outcome === 'approved' &&
        typeof form.approvedCents === 'number'
          ? { approvedCents: form.approvedCents }
          : {}),
      };
    },
    inputOnly: ['unknownLine', 'notYourLine'],
  },
  'reimbursements.resubmit': {
    transition: 'resubmit',
    tone: 'primary',
    main: true,
    fields: () => [
      {
        name: 'lines',
        kind: 'items',
        create: () => ({
          id: `line${Date.now()}`,
          category: 'travel',
          description: '',
          amountCents: 0,
        }),
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
    initial: (context) => ({ lines: context.defaults.resubmit?.lines ?? [] }),
    input: (form, context) => {
      // Only returned lines may change; the rest are sent as they were.
      const returned = new Set(
        (
          (context.record.lines ?? []) as readonly {
            id: string;
            decision: { outcome: string } | null;
          }[]
        )
          .filter((line) => line.decision?.outcome === 'returned')
          .map((line) => line.id),
      );
      const lines = (
        Array.isArray(form.lines) ? form.lines : []
      ) as JsonObject[];
      return { lines: lines.filter((line) => returned.has(str(line.id))) };
    },
  },
  'reimbursements.withdraw': { transition: 'withdraw', tone: 'danger' },
  'reimbursements.retryPayment': {
    transition: 'retryPayment',
    tone: 'primary',
    main: true,
  },
  'paymentRequests.submit': {
    transition: 'submit',
    tone: 'primary',
    main: true,
  },
  'paymentRequests.approve': {
    transition: 'approve',
    tone: 'primary',
    main: true,
  },
  'paymentRequests.reject': {
    transition: 'reject',
    tone: 'danger',
    main: true,
    fields: () => [reason()],
  },
  'paymentRequests.execute': {
    transition: 'execute',
    tone: 'primary',
    main: true,
  },
  'paymentRequests.schedule': {
    transition: 'schedule',
    tone: 'outline',
    fields: () => [{ name: 'executeAt', kind: 'datetime', required: true }],
    initial: (context) => ({ ...(context.defaults.schedule ?? {}) }),
  },
  'paymentRequests.retryExecution': {
    transition: 'retryExecution',
    tone: 'primary',
    main: true,
  },
  'paymentRequests.requestReapproval': {
    transition: 'requestReapproval',
    tone: 'outline',
    fields: () => [reason()],
  },
  'paymentRequests.terminate': {
    transition: 'terminate',
    tone: 'danger',
    fields: () => [reason()],
  },
  'paymentRequests.withdraw': { transition: 'withdraw', tone: 'danger' },
  'authorizationRequests.submit': {
    transition: 'submit',
    tone: 'primary',
    main: true,
  },
  'authorizationRequests.approve': {
    transition: 'approve',
    tone: 'primary',
    main: true,
    fields: () => [
      {
        name: 'limitCents',
        kind: 'cents',
        required: true,
        label: 'center.actions.form.approvedLimit',
        hint: 'center.actions.form.approvedLimitHint',
      },
    ],
    initial: (context) => ({ ...(context.defaults.approve ?? {}) }),
  },
  'authorizationRequests.reject': {
    transition: 'reject',
    tone: 'danger',
    main: true,
    fields: () => [reason()],
  },
  'authorizationRequests.withdraw': { transition: 'withdraw', tone: 'danger' },
  'budgetGrants.consume': {
    transition: 'consume',
    tone: 'primary',
    main: true,
    fields: () => [
      {
        name: 'amountCents',
        kind: 'cents',
        required: true,
        label: 'center.actions.form.useAmount',
      },
    ],
    initial: (context) => ({ ...(context.defaults.consume ?? {}) }),
    input: (form) => ({ ...form, usageKey: randomId() }),
  },
  'budgetGrants.revoke': {
    transition: 'revoke',
    tone: 'danger',
    fields: () => [reason()],
  },
};

interface Line {
  readonly id: string;
  readonly category: string;
  readonly description: string;
  readonly amountCents: number;
  readonly approverId: string | null;
  readonly contentHash: string | null;
  readonly decision: unknown;
}

function pendingLines(context: ActionContext): Line[] {
  return ((context.record.lines ?? []) as readonly Line[]).filter(
    (line) => line.approverId === context.actor && line.decision === null,
  );
}

/** Events an administrator may simulate in the demo, which the system fires in production. */
export const SIMULATED: Readonly<
  Record<string, readonly { transition: string; input: () => JsonObject }[]>
> = {
  supplierOnboardings: [
    {
      transition: 'depositReceived',
      input: () => ({
        depositRef: `DEMO-DEPOSIT-${randomId()}`,
        amountCents: 1000000,
      }),
    },
  ],
  approvalRequests: [
    { transition: 'escalate', input: () => ({}) },
    { transition: 'unclaimStale', input: () => ({}) },
  ],
};

export interface VisibleAction {
  readonly key: string;
  readonly spec: ActionSpec;
  readonly available: AvailableTransition;
}

/** The actions this person can take on the record, guards permitting. */
export function visibleActions(
  context: ActionContext,
  available: readonly AvailableTransition[],
): VisibleAction[] {
  const result: VisibleAction[] = [];
  for (const [key, spec] of Object.entries(ACTIONS)) {
    const [lifecycle] = key.split('.');
    if (lifecycle !== context.lifecycle) continue;
    const transition = available.find((item) => item.name === spec.transition);
    if (!transition) continue;
    const usable =
      transition.allowed ||
      (transition.blockers.length > 0 &&
        transition.blockers.every((blocker) =>
          spec.inputOnly?.includes(blocker.code),
        ));
    if (!usable || (spec.when && !spec.when(context))) continue;
    result.push({ key, spec, available: transition });
  }
  return result;
}

/** An action's button label: a decision variant, or the transition's business name. */
export function actionLabel(
  text: CenterText,
  lifecycle: string,
  key: string,
): string {
  const name = key.slice(key.indexOf('.') + 1);
  if (name.startsWith('decide:'))
    return text.t(`center.decisionActions.${name.slice(7)}`);
  return text.action(lifecycle, name);
}
