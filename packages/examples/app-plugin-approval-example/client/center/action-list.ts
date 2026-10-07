import type { JsonObject } from '@nocobase/lifecycle';

import type { RecordDetail } from '../../shared/types.js';
import type { ExampleApi } from '../lib/api.js';
import type { Text } from '../lib/text.js';
import type { FieldSpec } from './fields.js';
import { taskFields, transitionForm } from './forms.js';

export type Tone = 'primary' | 'danger' | 'outline';

/** One thing the person can do here, as a button and, when it asks for input, a form. */
export interface Action {
  readonly key: string;
  readonly label: string;
  readonly group: 'task' | 'record' | 'admin' | 'simulate';
  readonly tone: Tone;
  /** A main action is a large button; the rest sit under "More". */
  readonly main: boolean;
  readonly fields: readonly FieldSpec[];
  readonly initial: JsonObject;
  /** Whether it needs a confirmation even without fields. */
  readonly confirm: boolean;
  run(form: JsonObject): Promise<unknown>;
}

const DANGER = new Set([
  'reject',
  'withdraw',
  'cancel',
  'terminate',
  'abandon',
  'revoke',
]);

const PRIMARY = new Set([
  'approve',
  'submit',
  'start',
  'publish',
  'execute',
  'resubmit',
  'confirm',
  'claim',
]);

function tone(name: string): Tone {
  if (DANGER.has(name)) return 'danger';
  return PRIMARY.has(name) ? 'primary' : 'outline';
}

/** Every action `actor` may take on the record now, in the order a page offers them. */
export function actionsOf(
  text: Text,
  detail: RecordDetail,
  actor: string,
  api: ExampleApi,
): Action[] {
  const { summary } = detail;
  const { lifecycle, id } = summary;
  const actions: Action[] = [];
  // The approval layer's tasks.
  for (const { task, actions: allowed, onBehalfOf } of detail.actions) {
    const view = detail.runs.find((each) => each.run.id === task.runId);
    const stage = view?.stages.find((each) => each.key === task.stage);
    const where =
      detail.actions.length > 1
        ? ` · ${task.kind === 'decide' ? text.stage(task.stage, stage?.title) : text.t(`taskKind.${task.kind}`)}${task.subject ? ` · ${task.subject}` : ''}`
        : '';
    const behalf = onBehalfOf
      ? ` · ${text.t('inbox.onBehalf', { name: text.name(onBehalfOf) })}`
      : '';
    const send =
      (action: string, extra: JsonObject = {}) =>
      (form: JsonObject): Promise<unknown> =>
        api.task(
          task.id,
          action,
          {
            ...form,
            ...extra,
            ...(action === 'respond' && view
              ? { contentHash: view.run.contentHash }
              : {}),
          },
          actor,
        );
    for (const action of allowed) {
      if (action === 'respond') {
        const answers =
          task.kind === 'decide'
            ? ['approve', 'reject', ...(stage?.answers ?? [])]
            : task.kind === 'consult'
              ? ['opinion']
              : task.kind === 'material'
                ? ['provided']
                : ['read'];
        const itemized = stage?.policy === 'itemized';
        for (const answer of answers) {
          const needsWords =
            answer === 'reject' ||
            answer === 'return' ||
            answer === 'opinion' ||
            answer === 'provided';
          actions.push({
            key: `${task.id}:${answer}`,
            label: `${text.lookup([`answers.${answer}`], answer)}${where}${behalf}`,
            group: 'task',
            tone: tone(answer),
            main: true,
            fields: [
              ...(itemized && answer === 'approve'
                ? taskFields('respond', {
                    answers: [],
                    returnTargets: [],
                    revisable: [],
                    itemized: true,
                  }).filter((spec) => spec.name !== 'comment')
                : []),
              ...(needsWords || itemized
                ? [
                    {
                      name: 'comment',
                      kind: 'textarea',
                      required: needsWords,
                    } as const,
                  ]
                : []),
            ],
            initial: {},
            confirm: false,
            run: send('respond', { answer }),
          });
        }
        continue;
      }
      actions.push({
        key: `${task.id}:${action}`,
        label: `${text.t(`taskActions.${action}`)}${where}`,
        group: 'task',
        tone: tone(action),
        main: action === 'claim',
        fields: taskFields(action, {
          answers: [],
          returnTargets: view?.returnTargets ?? [],
          revisable: stage?.canRevise ?? [],
          itemized: false,
        }),
        initial:
          action === 'revise'
            ? {
                values: Object.fromEntries(
                  (stage?.canRevise ?? []).map((field) => [
                    field,
                    view?.run.content[field] ?? null,
                  ]),
                ),
              }
            : action === 'addSigner'
              ? { mode: 'after' }
              : {},
        confirm: false,
        run: send(action),
      });
    }
  }
  // The record's own transitions the person may fire.
  for (const transition of detail.available.filter((each) => each.allowed)) {
    const form = transitionForm(
      lifecycle,
      transition.name,
      detail.record as JsonObject,
      summary.demo,
    );
    actions.push({
      key: `transition:${transition.name}`,
      label: text.transition(lifecycle, transition.name),
      group: 'record',
      tone: tone(transition.name),
      main: PRIMARY.has(transition.name),
      fields: form?.fields ?? [],
      initial: form?.initial ?? {},
      confirm: DANGER.has(transition.name),
      run: (values) =>
        api.fire(
          lifecycle,
          id,
          transition.name,
          form ? form.input(values) : values,
          actor,
          detail.version,
        ),
    });
  }
  // A notice's copy, a grant's use, a reimbursement's rejected lines.
  const record = (
    action: string,
    fields: readonly FieldSpec[] = [],
    main = false,
  ): void => {
    actions.push({
      key: `record:${action}`,
      label: text.t(`recordActions.${action}`),
      group: 'record',
      tone: tone(action),
      main,
      fields,
      initial: {},
      confirm: false,
      run: (form) => api.record(lifecycle, id, action, form, actor),
    });
  };
  const ack = detail.acknowledgements.find(
    (each) => each.recipientId === actor && each.status !== 'revoked',
  );
  if (ack) {
    if (ack.status === 'unread') record('read', [], ack.kind !== 'confirm');
    if (ack.kind === 'confirm' && ack.status !== 'confirmed')
      record('confirm', [{ name: 'comment', kind: 'textarea' }], true);
    record('comment', [{ name: 'comment', kind: 'textarea', required: true }]);
  }
  if (
    lifecycle === 'scenarioGrants' &&
    detail.state === 'active' &&
    detail.record.holderId === actor
  )
    record(
      'useGrant',
      [
        { name: 'amountCents', kind: 'cents', required: true },
        { name: 'usageKey', kind: 'text', hint: 'form.usageKeyHint' },
      ],
      true,
    );
  const decisions = detail.record.decisions;
  if (
    lifecycle === 'scenarioReimbursements' &&
    detail.record.applicantId === actor &&
    typeof decisions === 'object' &&
    decisions !== null &&
    Object.values(decisions).some(
      (decision) =>
        typeof decision === 'object' &&
        decision !== null &&
        (decision as JsonObject).outcome === 'reject',
    ) &&
    ['partiallyApproved', 'paid', 'rejected'].includes(detail.state)
  )
    record('askAgain');
  // What an administrator or a supervisor may do.
  for (const admin of detail.admin) {
    const people: FieldSpec = {
      name: 'to',
      kind: 'person',
      people: admin.candidates,
      required: true,
    };
    const fields: readonly FieldSpec[] =
      admin.action === 'assign'
        ? [people]
        : admin.action === 'migrate'
          ? [
              { name: 'version', kind: 'number', min: 1, required: true },
              { name: 'reason', kind: 'textarea', required: true },
            ]
          : [
              people,
              { name: 'reason', kind: 'textarea', required: true },
              ...(admin.action === 'reassign'
                ? [
                    {
                      name: 'override',
                      kind: 'checkbox',
                      hint: 'form.overrideHint',
                    } as const,
                  ]
                : []),
            ];
    actions.push({
      key: `admin:${admin.action}:${admin.taskId ?? ''}`,
      label: `${text.t(`adminActions.${admin.action}`)}${admin.assigneeId ? ` · ${text.name(admin.assigneeId)}` : ''}`,
      group: 'admin',
      tone: 'outline',
      main: false,
      fields,
      initial: {},
      confirm: false,
      run: (form) =>
        admin.taskId && admin.action !== 'appoint' && admin.action !== 'migrate'
          ? api.task(admin.taskId, admin.action, form, actor)
          : api.record(
              lifecycle,
              id,
              admin.action,
              { ...form, approval: admin.approval },
              actor,
            ),
    });
  }
  return actions;
}

/** Events the administrator can make the outside world send to this record. */
export function simulatedOf(
  text: Text,
  detail: RecordDetail,
  actor: string,
  isAdmin: boolean,
  api: ExampleApi,
): Action[] {
  if (!isAdmin) return [];
  const { lifecycle, id } = detail.summary;
  const events: string[] = [];
  if (lifecycle === 'scenarioOrders') {
    if (detail.state === 'created') events.push('orderReady');
    if (['created', 'awaitingPayment', 'expired'].includes(detail.state))
      events.push('orderPayment');
  }
  if (lifecycle === 'scenarioSuppliers' && detail.state === 'awaitingDeposit')
    events.push('supplierDeposit');
  return events.map((event) => ({
    key: `simulate:${event}`,
    label: text.t(`simulated.${event}`),
    group: 'simulate',
    tone: 'outline',
    main: false,
    fields: [],
    initial: {},
    confirm: false,
    run: () => api.simulate(event, id, {}, actor),
  }));
}
