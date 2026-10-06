import {
  APPROVAL_COLLECTIONS,
  choosePeople,
  isOpenRun,
  OPEN,
  toRunRow,
  toTaskRow,
  type Approval,
  type RunRow,
  type TaskRow,
} from '@nocobase/app-plugin-approval/server';
import {
  toMermaid,
  type JsonObject,
  type JsonValue,
  type Lifecycle,
  type LifecycleRecord,
  type LifecycleTypes,
} from '@nocobase/lifecycle';

import { demo, type DemoKey } from '../../shared/catalog.js';
import type {
  AdminAction,
  BranchView,
  InboxItem,
  Overview,
  Preview,
  PreviewStep,
  RecordDetail,
  RecordSummary,
  RunView,
  StageView,
} from '../../shared/types.js';
import {
  BRANCHES,
  branchViews,
  COORDINATIONS,
  coordinationNotes,
} from '../scenarios/coordination.js';
import {
  balance,
  GRANT_REQUESTS,
  GRANT_USAGES,
  GRANTS,
} from '../scenarios/grant.js';
import { ACKNOWLEDGEMENTS, NOTICES } from '../scenarios/notice.js';
import { ORDERS, paymentsOf } from '../scenarios/order.js';
import { PAYMENT_RESERVATIONS, PAYMENTS } from '../scenarios/payment.js';
import { REIMBURSEMENTS } from '../scenarios/reimbursement.js';
import { SUPPLIER_DEPOSITS, SUPPLIERS } from '../scenarios/supplier.js';
import { WORK_ITEMS } from '../scenarios/work-items.js';
import { APPROVAL_EXAMPLE_COLLECTIONS } from '../scope.js';
import {
  demoOf,
  LAB_APPROVALS,
  LAB_LIFECYCLES,
  lifecycleOf,
  newRecord,
  plannerOf,
} from './catalog.js';
import { ExampleError } from './errors.js';
import { key, scalar } from './records.js';
import type { ApprovalExampleService } from './service.js';

type AnyApproval = Approval<LifecycleTypes>;
type AnyLifecycle = Lifecycle<LifecycleTypes>;

/** Fields a lifecycle owns, which a list row does not show as facts. */
const OWNED = new Set(['id', 'status', 'statusChangedAt', 'lifecycleVersion']);

/**
 * Transitions that are someone's work rather than the applicant's own
 * steps: they put a record in that person's to-do list while allowed.
 */
const WORK_TRANSITIONS: Readonly<Record<string, readonly string[]>> = {
  scenarioLeaves: ['retryRegistration'],
  [SUPPLIERS]: ['verifyManually', 'retryAccount'],
  [PAYMENTS]: ['schedule', 'execute', 'retryExecution', 'reconcileAgain'],
  [ORDERS]: ['refund', 'honour'],
  [WORK_ITEMS]: ['retry'],
  [REIMBURSEMENTS]: ['resubmit', 'retryPayment'],
};

/** Who a record waits for in a state no approval decides: a role, or its applicant. */
const STATE_HANDLERS: Readonly<
  Record<string, Readonly<Record<string, string>>>
> = {
  scenarioLeaves: { registrationFailed: 'hr' },
  [SUPPLIERS]: {
    manualVerification: 'riskOfficer',
    accountFailed: 'supplierOps',
  },
  [PAYMENTS]: { executionFailed: 'treasurer', reconciling: 'treasurer' },
  [ORDERS]: { refundRequired: 'finance' },
  [REIMBURSEMENTS]: { paymentFailed: 'finance', returned: 'applicant' },
};

function object(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

function json(value: unknown): JsonObject {
  return JSON.parse(JSON.stringify(value ?? {})) as JsonObject;
}

function sameRecord(a: string, aId: string, b: string, bId: string): boolean {
  return a === b && aId === bId;
}

function approvalNamed(name: string): AnyApproval | undefined {
  return (LAB_APPROVALS as unknown as AnyApproval[]).find(
    (approval) => approval.name === name,
  );
}

/** The approvals a lifecycle waits on, from the states they provide. */
function approvalsOf(lifecycle: AnyLifecycle): AnyApproval[] {
  const names = [...lifecycle.stateInfo.values()]
    .map((state) => state.meta.approval)
    .filter((name): name is string => typeof name === 'string');
  return names
    .map(approvalNamed)
    .filter((approval): approval is AnyApproval => approval !== undefined);
}

/** Everything the lists are built from, read once per request. */
interface Snapshot {
  readonly records: Map<string, LifecycleRecord[]>;
  readonly runs: RunRow[];
  readonly tasks: TaskRow[];
  readonly branches: LifecycleRecord[];
  readonly acknowledgements: LifecycleRecord[];
  readonly created: Map<string, string>;
}

/**
 * The read model behind the pages: every record as its business shows it,
 * a person's to-do center, a request's detail and the route a new request
 * would take. It owns no data; every action goes through the lifecycle's
 * routes or `ApprovalExampleService`.
 */
export class ApprovalCenter {
  public constructor(private readonly lab: ApprovalExampleService) {}

  private async snapshot(): Promise<Snapshot> {
    const records = new Map<string, LifecycleRecord[]>();
    for (const lifecycle of LAB_LIFECYCLES)
      records.set(lifecycle.name, await this.lab.rows(lifecycle.collection));
    const created = new Map<string, string>();
    for (const entry of await this.lab.database
      .repository(APPROVAL_EXAMPLE_COLLECTIONS.transitions)
      .findMany({ filter: { transition: '$create' }, limit: 10_000 })) {
      const at = entry.at instanceof Date ? entry.at.toISOString() : entry.at;
      created.set(
        `${scalar(entry.lifecycle)}:${scalar(entry.recordId)}`,
        scalar(at),
      );
    }
    return {
      records,
      runs: (await this.lab.rows(APPROVAL_COLLECTIONS.runs)).map(toRunRow),
      tasks: (await this.lab.rows(APPROVAL_COLLECTIONS.tasks)).map(toTaskRow),
      branches: await this.lab.rows(BRANCHES),
      acknowledgements: await this.lab.rows(ACKNOWLEDGEMENTS),
      created,
    };
  }

  // ------------------------------------------------------------ summaries

  private parentOf(
    snapshot: Snapshot,
    lifecycle: string,
    record: LifecycleRecord,
  ): { lifecycle: string; id: string } | null {
    const id = String(record.id);
    const branch = snapshot.branches.find(
      (row) => row.childLifecycle === lifecycle && scalar(row.childId) === id,
    );
    if (branch)
      return { lifecycle: COORDINATIONS, id: String(branch.parentId) };
    if (lifecycle === GRANTS && str(record.requestId))
      return { lifecycle: GRANT_REQUESTS, id: String(record.requestId) };
    if (lifecycle === REIMBURSEMENTS && str(record.followUpOf))
      return { lifecycle: REIMBURSEMENTS, id: String(record.followUpOf) };
    return null;
  }

  private demoFor(
    snapshot: Snapshot,
    lifecycle: string,
    record: LifecycleRecord,
    depth = 0,
  ): DemoKey | null {
    const own = demoOf(lifecycle, record);
    if (own || depth > 3) return own;
    const parent = this.parentOf(snapshot, lifecycle, record);
    if (!parent) return null;
    const row = snapshot.records
      .get(parent.lifecycle)
      ?.find((each) => String(each.id) === parent.id);
    return row
      ? this.demoFor(snapshot, parent.lifecycle, row, depth + 1)
      : null;
  }

  private openRun(
    snapshot: Snapshot,
    lifecycle: string,
    id: string,
  ): RunRow | undefined {
    return snapshot.runs
      .filter((run) => sameRecord(run.lifecycle, run.recordId, lifecycle, id))
      .filter(isOpenRun)
      .at(-1);
  }

  private holders(role: string): string[] {
    const org = this.lab.directory();
    return org.holders(role).filter((person) => org.isActive(person));
  }

  private summary(
    snapshot: Snapshot,
    lifecycle: string,
    record: LifecycleRecord,
  ): RecordSummary {
    const id = String(record.id);
    const status = String(record.status);
    const run = this.openRun(snapshot, lifecycle, id);
    const applicantId =
      str(record.applicantId) ??
      str(record.customerId) ??
      str(record.publisherId) ??
      str(record.holderId);
    const handlers = new Set<string>();
    if (run)
      for (const task of snapshot.tasks)
        if (
          task.runId === run.id &&
          task.stage === run.status &&
          task.enteredVersion === run.lifecycleVersion &&
          task.kind !== 'copy' &&
          ['pending', 'claimed', 'candidate'].includes(task.status)
        )
          handlers.add(task.assigneeId);
    if (lifecycle === NOTICES && status === 'collecting')
      for (const ack of snapshot.acknowledgements)
        if (
          String(ack.noticeId) === id &&
          ack.kind === 'confirm' &&
          (ack.status === 'unread' || ack.status === 'read')
        )
          handlers.add(String(ack.recipientId));
    if (lifecycle === WORK_ITEMS && status === 'failed')
      for (const person of this.holders(String(record.ownerRole)))
        handlers.add(person);
    const waiting = STATE_HANDLERS[lifecycle]?.[status];
    if (waiting === 'applicant' && applicantId) handlers.add(applicantId);
    else if (waiting)
      for (const person of this.holders(waiting)) handlers.add(person);
    const lastRun = snapshot.runs
      .filter((each) =>
        sameRecord(each.lifecycle, each.recordId, lifecycle, id),
      )
      .at(-1);
    if (status === 'draft' && lastRun?.status === 'returned' && applicantId)
      handlers.add(applicantId);
    const facts: JsonObject = {};
    for (const [field, value] of Object.entries(record))
      if (!OWNED.has(field) && field !== 'details')
        facts[field] = (value ?? null) as JsonValue;
    if (object(record.details))
      for (const [field, value] of Object.entries(record.details))
        if (field !== 'demo' && field !== 'sample') facts[field] = value;
    const key = this.demoFor(snapshot, lifecycle, record);
    return {
      lifecycle,
      id,
      demo: key,
      business: key ? (demo(key)?.business ?? null) : null,
      title: str(record.title),
      status,
      applicantId,
      parent: this.parentOf(snapshot, lifecycle, record),
      createdAt: snapshot.created.get(`${lifecycle}:${id}`) ?? null,
      changedAt: str(record.statusChangedAt),
      handlers: [...handlers],
      stage: run?.status ?? null,
      facts,
    };
  }

  // -------------------------------------------------------------- overview

  public async overview(actor: string): Promise<Overview> {
    const snapshot = await this.snapshot();
    const summaries: RecordSummary[] = [];
    for (const [lifecycle, rows] of snapshot.records)
      for (const record of rows)
        summaries.push(this.summary(snapshot, lifecycle, record));
    summaries.sort((a, b) =>
      (b.createdAt ?? '').localeCompare(a.createdAt ?? ''),
    );
    const messages = await this.lab.database
      .repository(APPROVAL_EXAMPLE_COLLECTIONS.messages)
      .findMany({
        filter: { recipientId: actor },
        sort: (sort) => sort.field('id').desc(),
        limit: 100,
      });
    const operations = await this.lab.database
      .repository(APPROVAL_EXAMPLE_COLLECTIONS.operations)
      .findMany({ sort: (sort) => sort.field('id').desc(), limit: 100 });
    const instant = (value: unknown): string => scalar(value);
    return {
      people: this.lab.people(),
      records: summaries,
      inbox: await this.inbox(snapshot, summaries, actor),
      messages: messages.map((row) => ({
        id: scalar(row.id),
        recipientId: scalar(row.recipientId),
        subject: scalar(row.subject),
        createdAt: instant(row.createdAt),
      })),
      operations: operations.map((row) => ({
        id: scalar(row.id),
        kind: scalar(row.kind),
        key: scalar(row.key),
        input: json(row.input),
        result: json(row.result),
        createdAt: instant(row.createdAt),
      })),
      settings: this.lab.currentSettings(),
    };
  }

  private async inbox(
    snapshot: Snapshot,
    summaries: readonly RecordSummary[],
    actor: string,
  ): Promise<InboxItem[]> {
    const items: InboxItem[] = [];
    const org = this.lab.directory();
    const now = new Date().toISOString();
    const inStay = (task: TaskRow): boolean => {
      const run = snapshot.runs.find((each) => each.id === task.runId);
      return (
        run !== undefined &&
        isOpenRun(run) &&
        run.status === task.stage &&
        run.lifecycleVersion === task.enteredVersion
      );
    };
    const taskItem = (
      box: InboxItem['box'],
      task: TaskRow,
      action: string | null,
      onBehalfOf: string | null = null,
    ): InboxItem => ({
      box,
      lifecycle: task.lifecycle,
      recordId: task.recordId,
      source: 'task',
      taskId: task.id,
      action,
      detail: task.kind === 'decide' ? task.stage : task.kind,
      since: box === 'done' ? task.closedAt : task.createdAt,
      onBehalfOf,
    });
    for (const task of snapshot.tasks) {
      if (task.kind === 'copy') {
        if (task.assigneeId === actor && task.status !== 'voided')
          items.push(
            taskItem(
              'copiedToMe',
              task,
              task.status === 'pending' ? 'respond' : null,
            ),
          );
        continue;
      }
      if (
        task.assigneeId === actor &&
        ['pending', 'claimed', 'candidate'].includes(task.status) &&
        inStay(task)
      )
        items.push(
          taskItem(
            'toDo',
            task,
            task.status === 'candidate' ? 'claim' : 'respond',
          ),
        );
      if (
        task.status === 'completed' &&
        (task.actorId === actor ||
          (task.actorId === null && task.assigneeId === actor))
      )
        items.push(taskItem('done', task, null));
    }
    // Decisions others have delegated to the actor.
    for (const principal of org.delegatorsOf(actor, now))
      for (const task of snapshot.tasks) {
        if (
          task.assigneeId !== principal ||
          task.kind !== 'decide' ||
          !['pending', 'claimed'].includes(task.status) ||
          !inStay(task)
        )
          continue;
        const approval = approvalNamed(task.source);
        if (
          approval &&
          org.delegateOf(principal, approval.kind, now, task.createdAt)?.to ===
            actor
        )
          items.push(taskItem('toDo', task, 'respond', principal));
      }
    // A notice's copies.
    for (const ack of snapshot.acknowledgements) {
      if (ack.recipientId !== actor || ack.status === 'revoked') continue;
      const item = (
        box: InboxItem['box'],
        action: string | null,
      ): InboxItem => ({
        box,
        lifecycle: NOTICES,
        recordId: String(ack.noticeId),
        source: 'acknowledgement',
        taskId: String(ack.id),
        action,
        detail: String(ack.kind),
        since: str(ack.deliveredAt) ?? str(ack.readAt),
        onBehalfOf: null,
      });
      items.push(item('copiedToMe', null));
      if (ack.kind === 'confirm' && ack.status !== 'confirmed')
        items.push(item('toDo', 'confirm'));
      else if (ack.kind === 'receipt' && ack.status === 'unread')
        items.push(item('toDo', 'read'));
      if (ack.status === 'confirmed') items.push(item('done', null));
    }
    // Work the business itself waits for, which no approval task holds.
    for (const summary of summaries) {
      const work = WORK_TRANSITIONS[summary.lifecycle] ?? [];
      const lifecycle = lifecycleOf(summary.lifecycle);
      if (!lifecycle) continue;
      const returned =
        summary.status === 'draft' &&
        summary.applicantId === actor &&
        snapshot.runs
          .filter((run) =>
            sameRecord(
              run.lifecycle,
              run.recordId,
              summary.lifecycle,
              summary.id,
            ),
          )
          .at(-1)?.status === 'returned';
      const possible = work.filter((name) =>
        lifecycle.transitions.get(name)?.from.includes(summary.status),
      );
      if (!possible.length && !returned) continue;
      const available = await this.lab.runtime.available(
        summary.lifecycle,
        key(summary.id),
        { id: actor },
      );
      const start = summary.demo ? demo(summary.demo)?.start : null;
      for (const transition of available)
        if (
          transition.allowed &&
          (possible.includes(transition.name) ||
            (returned && transition.name === start))
        )
          items.push({
            box: 'toDo',
            lifecycle: summary.lifecycle,
            recordId: summary.id,
            source: 'transition',
            taskId: null,
            action: transition.name,
            detail: summary.status,
            since: summary.changedAt,
            onBehalfOf: null,
          });
    }
    // What the actor started.
    for (const summary of summaries)
      if (summary.parent === null && summary.applicantId === actor)
        items.push({
          box: 'mine',
          lifecycle: summary.lifecycle,
          recordId: summary.id,
          source: 'record',
          taskId: null,
          action: null,
          detail: summary.status,
          since: summary.createdAt,
          onBehalfOf: null,
        });
    // Business transitions the actor fired, other than starting their own.
    const seen = new Set(
      items
        .filter((item) => item.box === 'done')
        .map((item) => `${item.lifecycle}:${item.recordId}`),
    );
    const own = new Set(
      summaries
        .filter((summary) => summary.applicantId === actor)
        .map((summary) => `${summary.lifecycle}:${summary.id}`),
    );
    for (const entry of await this.lab.database
      .repository(APPROVAL_EXAMPLE_COLLECTIONS.transitions)
      .findMany({
        filter: { actorId: actor },
        sort: (sort) => sort.field('id').desc(),
        limit: 500,
      })) {
      const recordKey = `${scalar(entry.lifecycle)}:${scalar(entry.recordId)}`;
      if (
        seen.has(recordKey) ||
        own.has(recordKey) ||
        scalar(entry.lifecycle).startsWith('approval:') ||
        !summaries.some(
          (summary) => `${summary.lifecycle}:${summary.id}` === recordKey,
        )
      )
        continue;
      seen.add(recordKey);
      items.push({
        box: 'done',
        lifecycle: scalar(entry.lifecycle),
        recordId: scalar(entry.recordId),
        source: 'transition',
        taskId: null,
        action: scalar(entry.transition),
        detail: scalar(entry.to),
        since:
          entry.at instanceof Date ? entry.at.toISOString() : str(entry.at),
        onBehalfOf: null,
      });
    }
    return items;
  }

  // ---------------------------------------------------------------- detail

  public async detail(
    lifecycleName: string,
    id: string,
    actor: string,
  ): Promise<RecordDetail> {
    const lifecycle = lifecycleOf(lifecycleName);
    if (!lifecycle)
      throw new ExampleError('NOT_FOUND', 'lifecycle', 'Unknown lifecycle.');
    const { runtime, approvals } = this.lab;
    const view = await runtime.view(lifecycleName, key(id), { id: actor });
    const snapshot = await this.snapshot();
    const summary = this.summary(snapshot, lifecycleName, view.record);
    const runs: RunView[] = [];
    for (const run of snapshot.runs.filter((each) =>
      sameRecord(each.lifecycle, each.recordId, lifecycleName, summary.id),
    )) {
      const approval = approvalNamed(run.source);
      runs.push({
        run,
        stages: approval ? this.stages(approval, run, snapshot.tasks) : [],
        tasks: snapshot.tasks.filter((task) => task.runId === run.id),
        events: (await approvals.eventsFor(lifecycleName, summary.id)).filter(
          (event) => event.runId === run.id,
        ),
        history: (await runtime.history(`approval:${run.source}`, run.id))
          .transitions,
        returnTargets: approval ? this.returnTargets(approval, run) : [],
      });
    }
    const description = runtime.describe(lifecycleName);
    return {
      summary,
      record: view.record,
      state: view.state,
      version: view.version,
      available: view.available,
      history: view.history.transitions,
      runs,
      actions: await approvals.actionsFor(lifecycleName, summary.id, {
        id: actor,
      }),
      admin: this.adminActions(snapshot, summary, actor),
      branches:
        lifecycleName === COORDINATIONS
          ? (await branchViews(runtime, summary.id)).map(
              (branch): BranchView => ({
                key: branch.key,
                title: branch.title,
                kind: branch.kind,
                required: branch.required,
                status: branch.status,
                revision: branch.revision,
                because: branch.because,
                childLifecycle: branch.childLifecycle,
                childId: branch.childId,
                childStatus: scalar(branch.child?.status ?? branch.state),
              }),
            )
          : [],
      acknowledgements:
        lifecycleName === NOTICES
          ? (await this.lab.notices.list(summary.id)).map((ack) => ({
              id: ack.id,
              recipientId: ack.recipientId,
              kind: ack.kind,
              status: ack.status,
              readAt: ack.readAt,
              confirmedAt: ack.confirmedAt,
              comments: ack.comments,
            }))
          : [],
      extras: await this.extras(lifecycleName, summary.id),
      effects: await runtime.listEffectRuns({
        lifecycle: lifecycleName,
        recordId: summary.id,
      }),
      description,
      diagram: toMermaid(description),
    };
  }

  private stages(
    approval: AnyApproval,
    run: RunRow,
    tasks: readonly TaskRow[],
  ): StageView[] {
    const open = isOpenRun(run);
    const at = approval.flow.indexOf(run.status);
    return run.plan.map((entry): StageView => {
      const index = approval.flow.indexOf(entry.stage);
      const decided = tasks.some(
        (task) =>
          task.runId === run.id &&
          task.stage === entry.stage &&
          task.status === 'completed' &&
          task.kind === 'decide',
      );
      let state: StageView['state'];
      if (!entry.included) state = 'skipped';
      else if (open && entry.stage === run.status) state = 'current';
      else if (open) state = index < at ? 'done' : 'waiting';
      else state = decided ? 'done' : 'waiting';
      const definition = approval.isStage(entry.stage)
        ? approval.stage(entry.stage)
        : undefined;
      const policy = definition?.policy as
        { answers?(options: unknown): readonly string[] } | undefined;
      return {
        key: entry.stage,
        title: definition?.title ?? null,
        policy: definition?.policy.kind ?? '',
        included: entry.included,
        because: entry.because,
        state,
        canRevise: definition?.canRevise ?? [],
        answers: policy?.answers?.(definition?.options) ?? [],
      };
    });
  }

  /** Where the run's current stage may send the request back. */
  private returnTargets(approval: AnyApproval, run: RunRow): string[] {
    if (!isOpenRun(run)) return [];
    const { returns, exits } = approval.options;
    const at = approval.flow.indexOf(run.status);
    return [
      ...(returns?.earlier
        ? run.plan
            .filter(
              (entry) =>
                entry.included && approval.flow.indexOf(entry.stage) < at,
            )
            .map((entry) => entry.stage)
        : []),
      ...(exits.returned ? ['applicant'] : []),
    ];
  }

  private adminActions(
    snapshot: Snapshot,
    summary: RecordSummary,
    actor: string,
  ): AdminAction[] {
    const org = this.lab.directory();
    const run = this.openRun(snapshot, summary.lifecycle, summary.id);
    if (!run) return [];
    const approval = approvalNamed(run.source);
    if (!approval) return [];
    const stay = snapshot.tasks.filter(
      (task) =>
        task.runId === run.id &&
        task.stage === run.status &&
        task.enteredVersion === run.lifecycleVersion &&
        OPEN.includes(task.status),
    );
    const people = this.lab
      .people()
      .filter((person) => person.active && person.id !== run.applicantId)
      .map((person) => person.id);
    const actions: AdminAction[] = [];
    const { adminRole, supervisorRole, migrations } = approval.options;
    if (adminRole && org.hasRole(actor, adminRole)) {
      for (const task of stay)
        if (task.kind === 'decide')
          actions.push({
            action: 'reassign',
            taskId: task.id,
            approval: approval.name,
            assigneeId: task.assigneeId,
            candidates: people.filter((person) => person !== task.assigneeId),
          });
      if (!stay.length)
        actions.push({
          action: 'appoint',
          taskId: null,
          approval: approval.name,
          assigneeId: null,
          candidates: people,
        });
      if (migrations)
        actions.push({
          action: 'migrate',
          taskId: null,
          approval: approval.name,
          assigneeId: null,
          candidates: [],
        });
    }
    if (supervisorRole && org.hasRole(actor, supervisorRole)) {
      const pool = stay.filter((task) =>
        ['candidate', 'pending', 'claimed', 'suspended'].includes(task.status),
      );
      if (pool.length)
        actions.push({
          action: 'assign',
          taskId: pool[0].id,
          approval: approval.name,
          assigneeId: null,
          candidates: pool.map((task) => task.assigneeId),
        });
    }
    return actions;
  }

  private async extras(lifecycle: string, id: string): Promise<JsonObject> {
    const { runtime } = this.lab;
    const rowsWhere = async (
      collection: string,
      field: string,
    ): Promise<LifecycleRecord[]> =>
      (await this.lab.rows(collection)).filter(
        (row) => String(row[field]) === id,
      );
    switch (lifecycle) {
      case ORDERS:
        return { payments: json(await paymentsOf(runtime, key(id))) };
      case GRANTS:
        return {
          balance: json(await balance(runtime, key(id))),
          usages: json(await rowsWhere(GRANT_USAGES, 'grantId')),
        };
      case GRANT_REQUESTS:
        return {
          grants: json(
            (
              await rowsWhere(
                lifecycleOf(GRANTS)?.collection ?? GRANTS,
                'requestId',
              )
            ).map((row) => ({ id: scalar(row.id), status: row.status })),
          ),
        };
      case SUPPLIERS:
        return {
          deposits: json(await rowsWhere(SUPPLIER_DEPOSITS, 'supplierId')),
        };
      case COORDINATIONS:
        return { notes: await coordinationNotes(runtime, id) };
      case PAYMENTS:
        return {
          reservations: json(
            await rowsWhere(PAYMENT_RESERVATIONS, 'requestId'),
          ),
        };
      case REIMBURSEMENTS:
        return {
          followUps: json(
            (
              await rowsWhere(
                lifecycleOf(REIMBURSEMENTS)?.collection ?? REIMBURSEMENTS,
                'followUpOf',
              )
            ).map((row) => ({ id: scalar(row.id), status: row.status })),
          ),
        };
      default:
        return {};
    }
  }

  // --------------------------------------------------------------- preview

  /**
   * The route a request would take if it were submitted now, from the same
   * definitions and organization that will decide it.
   */
  public async preview(
    key: string,
    form: JsonObject,
    actor: string,
  ): Promise<Preview> {
    const item = demo(key);
    if (!item)
      throw new ExampleError('INVALID', 'demo', 'Choose a kind of request.');
    const applicantId =
      item.proxy && typeof form.applicantId === 'string'
        ? this.lab.actor(form.applicantId)
        : actor;
    let values: Record<string, unknown>;
    try {
      values = newRecord(item.key, form, actor, applicantId).values;
    } catch (error) {
      if (error instanceof ExampleError)
        return {
          mode: 'none',
          steps: [],
          problems: [error.message],
          notes: [],
        };
      throw error;
    }
    const services = this.lab.services();
    const record = { ...values, id: 'preview' } as LifecycleRecord;
    const lifecycle = lifecycleOf(item.lifecycle);
    if (!lifecycle) return { mode: 'none', steps: [], problems: [], notes: [] };
    if (item.lifecycle === COORDINATIONS) {
      const planner = plannerOf(String(values.kind));
      if (!planner) return { mode: 'none', steps: [], problems: [], notes: [] };
      const plan = planner.plan(values.content as JsonObject, {
        applicantId,
        services,
      });
      return {
        mode: 'branches',
        steps: plan.branches.map((branch): PreviewStep => ({
          key: branch.key,
          title: branch.title,
          kind: 'branch',
          rule: branch.kind,
          people: branch.review
            ? [
                ...branch.review.reviewers,
                ...(branch.review.lead ? [branch.review.lead] : []),
              ]
            : this.holders(branch.work?.ownerRole ?? ''),
          included: true,
          required: branch.required,
          because: branch.because ?? null,
        })),
        problems: [...plan.problems],
        notes: [...plan.notes],
      };
    }
    const [approval] = approvalsOf(lifecycle);
    if (!approval) return { mode: 'none', steps: [], problems: [], notes: [] };
    const parameters = this.lab.runtime.parameters(item.lifecycle) as never;
    const version = approval.version({ record, parameters });
    const notes: string[] = [];
    const steps: PreviewStep[] = [];
    for (const entry of approval.plan({ record, parameters, version })) {
      const definition = approval.stage(entry.stage);
      let people: string[] = [];
      if (entry.included) {
        const context = {
          record,
          parameters,
          version,
          applicantId,
          directory: approval.options.directory(services as never),
          services: services as never,
        };
        if (definition.subjects)
          people = [
            ...new Set(
              (await definition.subjects({ ...context, notes })).flatMap(
                (subject) => (subject.assignee ? [subject.assignee] : []),
              ),
            ),
          ];
        else {
          const chosen = await choosePeople(definition, context);
          people = chosen.people;
          notes.push(...chosen.notes);
        }
      }
      steps.push({
        key: entry.stage,
        title: definition.title ?? null,
        kind: 'stage',
        rule: definition.policy.kind,
        people,
        included: entry.included,
        required: entry.included,
        because: entry.because,
      });
    }
    return {
      mode: 'stages',
      steps,
      problems: steps.some((step) => step.included)
        ? []
        : approval.options.noStages
          ? []
          : ['No stage applies to this request.'],
      notes:
        approval.options.noStages && !steps.some((step) => step.included)
          ? [approval.options.noStages.because, ...notes]
          : notes,
    };
  }
}
