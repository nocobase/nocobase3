import type {
  JsonObject,
  JsonValue,
  LifecycleRecord,
} from '@nocobase/lifecycle';

import {
  businessOfKind,
  type CenterBox,
  type CenterBusinessKey,
  type CenterInboxItem,
  type CenterOverview,
  type CenterPreview,
  type CenterPreviewStep,
  type CenterRecord,
} from '../../shared/approval-center.js';
import { APPROVAL_DEMOS } from '../../shared/approval-lab.js';
import { text } from '../../shared/text.js';
import {
  kindOf,
  type Acknowledgement,
} from '../approval-scenarios/acknowledgement.js';
import {
  APPROVAL_TABLES,
  type ApprovalStageRow,
} from '../../shared/approval-trail.js';
import type { ApprovalRequest } from '../approval-scenarios/approval/lifecycle.js';
import { choosePeople } from '../approval-scenarios/approval/model.js';
import { approvalRows } from '../approval-scenarios/approval/records.js';
import type { Coordination } from '../approval-scenarios/coordination.js';
import type { BudgetGrant } from '../approval-scenarios/grant.js';
import type { Notice } from '../approval-scenarios/notice.js';
import type { OrgDirectory } from '../approval-scenarios/org.js';
import type { PaymentRequest } from '../approval-scenarios/payment.js';
import type { Reimbursement } from '../approval-scenarios/reimbursement.js';
import type { SupplierOnboarding } from '../approval-scenarios/supplier.js';
import {
  acknowledgementTodoSource,
  approvalTodoSource,
} from '../approval-scenarios/todo.js';
import type { WorkItem } from '../approval-scenarios/work-item.js';
import { LIFECYCLE_EXAMPLE_COLLECTIONS } from '../scope.js';
import { ExampleError } from '../services/lifecycle-example.js';
import { LAB_LIFECYCLES, LAB_PLANNERS } from '../approval-lab/definitions.js';
import type { ApprovalLabService } from '../approval-lab/service.js';

/**
 * The transitions that mean work for the person who may fire them. Other
 * transitions a person may fire — withdrawing their own request, editing a
 * draft — are possibilities, not to-dos.
 */
const WORK: Readonly<Record<string, readonly string[]>> = {
  leaveRequests: ['approve', 'retryRegistration'],
  workItems: ['retry'],
  supplierOnboardings: [
    'legalApprove',
    'verifyManually',
    'riskApprove',
    'retryAccount',
  ],
  reimbursements: ['decideLine', 'resubmit', 'retryPayment'],
  paymentRequests: ['approve', 'execute', 'retryExecution'],
  authorizationRequests: ['approve'],
};

/** What the people a lifecycle is waiting for did, never counted as done work. */
const NOT_DONE: ReadonlySet<string> = new Set([
  '$create',
  'submit',
  'start',
  'publish',
  'editDraft',
  'withdraw',
  'cancel',
]);

const FINAL: Readonly<Record<string, readonly string[]>> = {
  leaveRequests: ['registered', 'rejected'],
  approvalRequests: ['approved', 'rejected', 'cancelled'],
  coordinations: ['completed', 'failed', 'cancelled'],
  workItems: ['done', 'rolledBack', 'cancelled'],
  acknowledgements: ['confirmed', 'revoked'],
  notices: ['effective', 'withdrawn'],
  orders: ['fulfilled', 'expired', 'refunded'],
  supplierOnboardings: ['active', 'rejected', 'withdrawn', 'cancelled'],
  reimbursements: ['paid', 'rejected', 'withdrawn'],
  paymentRequests: ['executed', 'rejected', 'withdrawn', 'terminated'],
  authorizationRequests: ['approved', 'rejected', 'withdrawn'],
  budgetGrants: ['exhausted', 'expired', 'revoked', 'superseded'],
};

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function number(value: unknown): number {
  return typeof value === 'number' ? value : Number(value ?? 0) || 0;
}

function json(value: unknown): JsonValue {
  return (value ?? null) as JsonValue;
}

function activeHolders(org: OrgDirectory, role: string): string[] {
  return org.holders(role).filter((person) => org.isActive(person));
}

interface Row {
  readonly lifecycle: string;
  readonly record: LifecycleRecord;
}

/** The approval rows the center summarizes requests from. */
interface ApprovalIndex {
  readonly stages: ReadonlyMap<string, ApprovalStageRow>;
  readonly stagesOf: ReadonlyMap<string, readonly ApprovalStageRow[]>;
  /** Who each stage waits for: its open tasks, a pool nobody took included. */
  readonly waiting: ReadonlyMap<string, readonly string[]>;
  /** Who a request waiting for material waits for. */
  readonly supplying: ReadonlyMap<string, string>;
}

/**
 * The approval center's read model over the approval lab: every scenario
 * record as a business request, and each person's to-do center. It owns no
 * data; it reads the records, their lifecycles and the transition log.
 */
export class ApprovalCenterService {
  public constructor(private readonly lab: ApprovalLabService) {}

  private async rows(): Promise<Row[]> {
    const services = this.lab.scenario();
    const rows: Row[] = [];
    for (const lifecycle of LAB_LIFECYCLES)
      for (const record of await services.records.list(
        lifecycle.collection,
        () => true,
      ))
        rows.push({ lifecycle: lifecycle.name, record });
    return rows;
  }

  private async approvals(): Promise<ApprovalIndex> {
    const { records } = this.lab.scenario();
    const stages = new Map<string, ApprovalStageRow>();
    const stagesOf = new Map<string, ApprovalStageRow[]>();
    for (const row of await records.list(APPROVAL_TABLES.stages, () => true)) {
      const stage = approvalRows.stage(row);
      stages.set(stage.id, stage);
      stagesOf.set(stage.requestId, [
        ...(stagesOf.get(stage.requestId) ?? []),
        stage,
      ]);
    }
    const waiting = new Map<string, string[]>();
    const supplying = new Map<string, string>();
    for (const status of ['pending', 'claimed'])
      for (const row of await records.find(APPROVAL_TABLES.tasks, { status })) {
        const task = approvalRows.task(row);
        if (task.kind === 'supply')
          supplying.set(task.requestId, task.assigneeId);
        if (task.kind !== 'decide' || task.stageId === null) continue;
        waiting.set(task.stageId, [
          ...(waiting.get(task.stageId) ?? []),
          task.assigneeId,
        ]);
      }
    return { stages, stagesOf, waiting, supplying };
  }

  public async overview(actor: string): Promise<CenterOverview> {
    const org = this.lab.directory();
    const rows = await this.rows();
    const approvals = await this.approvals();
    const byKey = new Map(
      rows.map((row) => [`${row.lifecycle}:${text(row.record.id)}`, row]),
    );
    const entries = await this.lab.database
      .repository(LIFECYCLE_EXAMPLE_COLLECTIONS.transitions)
      .findMany({
        sort: (sort) => sort.field('id').asc(),
        limit: 50000,
      });
    const created = new Map<string, string>();
    const done = new Map<string, string>();
    for (const entry of entries) {
      const key = `${text(entry.lifecycle)}:${text(entry.recordId)}`;
      const at =
        entry.at instanceof Date ? entry.at.toISOString() : text(entry.at);
      if (text(entry.transition) === '$create') created.set(key, at);
      else if (
        text(entry.actorId) === actor &&
        !NOT_DONE.has(text(entry.transition)) &&
        text(entry.lifecycle) !== 'acknowledgements'
      )
        done.set(key, at);
    }
    const records = rows.map((row) =>
      this.summarize(row, rows, byKey, org, created, approvals),
    );
    return {
      records,
      inbox: await this.inbox(actor, rows, records, done),
      people: this.lab.overviewPeople(),
    };
  }

  private businessOf(
    row: Row,
    byKey: ReadonlyMap<string, Row>,
    depth: number = 0,
  ): CenterBusinessKey | null {
    const { lifecycle, record } = row;
    const own = businessOfKind(
      lifecycle,
      typeof record.kind === 'string' ? record.kind : null,
    );
    if (own !== null || depth > 3) return own;
    const parent =
      lifecycle === 'acknowledgements'
        ? byKey.get(`${text(record.sourceLifecycle)}:${text(record.sourceId)}`)
        : byKey.get(`${text(record.parentLifecycle)}:${text(record.parentId)}`);
    return parent ? this.businessOf(parent, byKey, depth + 1) : null;
  }

  private summarize(
    row: Row,
    rows: readonly Row[],
    byKey: ReadonlyMap<string, Row>,
    org: OrgDirectory,
    created: ReadonlyMap<string, string>,
    approvals: ApprovalIndex,
  ): CenterRecord {
    const { lifecycle, record } = row;
    const id = text(record.id);
    const status = text(record.status);
    const open = !(FINAL[lifecycle] ?? []).includes(status);
    let handlers: string[] = [];
    let step: string | null = null;
    let facts: JsonObject = {};
    let applicantId = text(record.applicantId ?? '');
    let kind: string | null =
      typeof record.kind === 'string' ? record.kind : null;
    let parent: CenterRecord['parent'] = null;
    switch (lifecycle) {
      case 'leaveRequests':
        kind = 'leave';
        if (status === 'pending') {
          handlers = strings([record.approverId]);
          step = 'manager';
        } else if (status === 'registrationFailed') {
          handlers = activeHolders(org, 'hr');
          step = 'registration';
        }
        facts = { days: json(record.days), reason: json(record.reason) };
        break;
      case 'approvalRequests': {
        const request = record as ApprovalRequest;
        const stage =
          request.currentStageId === null
            ? undefined
            : approvals.stages.get(request.currentStageId);
        if (request.status === 'inReview' && stage) {
          handlers = [...(approvals.waiting.get(stage.id) ?? [])];
          step = stage.key;
        } else if (request.status === 'awaitingMaterials') {
          handlers = [
            approvals.supplying.get(id) ??
              request.submittedBy ??
              request.applicantId,
          ];
          step = 'materials';
        }
        if (request.parentId !== null && request.parentLifecycle !== null)
          parent = { lifecycle: request.parentLifecycle, id: request.parentId };
        const round = (approvals.stagesOf.get(id) ?? []).filter(
          (each) =>
            each.round === number(request.round) &&
            each.status !== 'superseded',
        );
        facts = {
          ...request.content,
          round: request.round,
          stagesDone: round.filter(
            (each) => each.status === 'approved' || each.status === 'skipped',
          ).length,
          stagesTotal: round.length,
        };
        break;
      }
      case 'coordinations': {
        const request = record as Coordination;
        const settled = request.branches.filter((branch) =>
          ['approved', 'done', 'rejected', 'failed', 'cancelled'].includes(
            branch.state ?? '',
          ),
        ).length;
        if (request.status === 'running') {
          step = 'branches';
          for (const branch of request.branches) {
            const child = byKey.get(`${branch.lifecycle}:${branch.id}`);
            if (child)
              handlers.push(
                ...this.summarize(child, rows, byKey, org, created, approvals)
                  .handlers,
              );
          }
        }
        facts = {
          ...request.content,
          branchesDone: settled,
          branchesTotal: request.branches.length,
        };
        break;
      }
      case 'workItems': {
        const item = record as WorkItem;
        kind = item.branchKey;
        if (item.parentId !== null && item.parentLifecycle !== null)
          parent = { lifecycle: item.parentLifecycle, id: item.parentId };
        if (item.status === 'failed') {
          handlers = activeHolders(org, item.ownerRole);
          step = item.steps[item.cursor ?? 0]?.key ?? null;
        } else if (item.status === 'running')
          step = item.steps[item.cursor ?? 0]?.key ?? null;
        facts = {
          stepsDone: item.steps.filter((each) => each.status === 'done').length,
          stepsTotal: item.steps.length,
          ownerRole: item.ownerRole,
        };
        const coordination = parent
          ? byKey.get(`${parent.lifecycle}:${parent.id}`)
          : undefined;
        applicantId = text(coordination?.record.applicantId ?? '');
        break;
      }
      case 'acknowledgements': {
        const copy = record as Acknowledgement;
        applicantId = copy.recipientId;
        kind = kindOf(copy);
        parent = { lifecycle: copy.sourceLifecycle, id: copy.sourceId };
        if (
          (kind === 'confirm' && status !== 'confirmed') ||
          (kind === 'receipt' &&
            (status === 'unread' || status === 'delivered'))
        )
          handlers = status === 'revoked' ? [] : [copy.recipientId];
        facts = { source: copy.sourceLifecycle };
        break;
      }
      case 'notices': {
        const notice = record as Notice;
        applicantId = notice.publisherId;
        kind = 'notice';
        const copies = rows
          .filter(
            (each) =>
              each.lifecycle === 'acknowledgements' &&
              each.record.sourceLifecycle === 'notices' &&
              text(each.record.sourceId) === id,
          )
          .map((each) => each.record as Acknowledgement);
        const confirmed = copies.filter(
          (copy) => copy.status === 'confirmed',
        ).length;
        const read = copies.filter((copy) =>
          ['read', 'confirmed'].includes(copy.status),
        ).length;
        if (notice.status === 'collecting') {
          handlers = notice.recipientIds.filter(
            (person) =>
              !copies.some(
                (copy) =>
                  copy.recipientId === person && copy.status === 'confirmed',
              ),
          );
          step = 'confirmation';
        }
        facts = {
          mode: notice.mode,
          recipients: notice.recipientIds.length,
          confirmed,
          read,
        };
        break;
      }
      case 'supplierOnboardings': {
        const supplier = record as SupplierOnboarding;
        kind = 'supplier';
        step = open ? status : null;
        handlers =
          status === 'legalReview'
            ? activeHolders(org, 'legal')
            : status === 'manualVerification'
              ? activeHolders(org, 'riskOfficer')
              : status === 'riskReview' || status === 'riskReviewOverdue'
                ? strings([supplier.riskReviewerId])
                : status === 'accountFailed'
                  ? activeHolders(org, 'supplierOps')
                  : status === 'awaitingDeposit'
                    ? [supplier.applicantId]
                    : [];
        facts = {
          name: supplier.name,
          registrationNo: supplier.registrationNo,
          riskLevel: json(supplier.riskLevel),
        };
        break;
      }
      case 'reimbursements': {
        const sheet = record as Reimbursement;
        kind = 'reimbursement';
        if (status === 'inReview') {
          handlers = [
            ...new Set(
              sheet.lines
                .filter((line) => line.decision === null && line.approverId)
                .map((line) => text(line.approverId)),
            ),
          ];
          step = 'lines';
        } else if (status === 'returned') {
          handlers = [sheet.applicantId];
          step = 'returned';
        } else if (status === 'paymentFailed') {
          handlers = activeHolders(org, 'finance');
          step = 'payment';
        } else if (status === 'approved' || status === 'partiallyApproved')
          step = 'payment';
        facts = {
          totalCents: sheet.lines.reduce(
            (sum, line) => sum + number(line.amountCents),
            0,
          ),
          approvedTotalCents: json(sheet.approvedTotalCents),
          lines: sheet.lines.length,
        };
        break;
      }
      case 'paymentRequests': {
        const payment = record as PaymentRequest;
        kind = 'payment';
        if (status === 'pendingApproval') {
          handlers = strings([payment.approverId]);
          step = 'approval';
        } else if (status === 'approved' || status === 'executionFailed') {
          handlers = activeHolders(org, 'treasurer');
          step = 'execution';
        } else if (status === 'executing' || status === 'reconciling')
          step = 'execution';
        facts = {
          payeeId: payment.payeeId,
          amountCents: payment.amountCents,
          installments: json(payment.installments),
          paidCents: json(payment.paidCents),
          executionMode: json(payment.executionMode),
        };
        break;
      }
      case 'authorizationRequests':
        kind = 'authorization';
        if (status === 'pending') {
          handlers = strings([record.approverId]);
          step = 'approval';
        }
        facts = {
          subjectId: json(record.subjectId),
          matter: json(record.matter),
          limitCents: json((record.requested as JsonObject).limitCents),
        };
        break;
      case 'budgetGrants': {
        const grant = record as BudgetGrant;
        kind = 'grant';
        applicantId = grant.holderId;
        parent = { lifecycle: 'authorizationRequests', id: grant.requestId };
        facts = {
          subjectId: grant.subjectId,
          limitCents: grant.limitCents,
          usedCents: grant.usedCents,
          uses: grant.uses,
          maxUses: grant.maxUses,
          validUntil: grant.validUntil,
        };
        break;
      }
      default:
        applicantId = text(record.customerId ?? applicantId);
    }
    return {
      lifecycle,
      id,
      business: this.businessOf(row, byKey),
      kind,
      title: text(record.title ?? record.name ?? record.subjectId ?? id),
      status,
      applicantId,
      parent,
      createdAt: created.get(`${lifecycle}:${id}`) ?? null,
      updatedAt: text(record.statusChangedAt),
      handlers: open ? [...new Set(handlers)] : [],
      step: open ? step : null,
      facts,
    };
  }

  private async inbox(
    actor: string,
    rows: readonly Row[],
    records: readonly CenterRecord[],
    done: ReadonlyMap<string, string>,
  ): Promise<CenterInboxItem[]> {
    const services = this.lab.scenario();
    const runtime = this.lab.runtime;
    const now = new Date();
    const items: CenterInboxItem[] = [];
    const push = (
      box: CenterBox,
      lifecycle: string,
      recordId: string,
      action: string | null,
      detail: string,
      since: string,
      onBehalfOf: string | null = null,
    ): void => {
      items.push({
        box,
        lifecycle,
        recordId,
        action,
        detail,
        since,
        onBehalfOf,
      });
    };
    // The approval and copy to-dos come from their own rows, found by person.
    for (const item of await approvalTodoSource.collect(
      actor,
      'toDo',
      services,
      now,
    ))
      push(
        'toDo',
        item.lifecycle,
        item.recordId,
        item.action,
        item.action === 'answerConsultation' ||
          item.action === 'supplyMaterials'
          ? item.detail
          : '',
        item.since,
        item.onBehalfOf,
      );
    for (const box of ['toDo', 'copiedToMe'] as const)
      for (const item of await acknowledgementTodoSource.collect(
        actor,
        box,
        services,
        now,
      ))
        push(
          item.box,
          item.lifecycle,
          item.recordId,
          item.action,
          '',
          item.since,
        );
    for (const row of rows) {
      const id = text(row.record.id);
      const since = text(row.record.statusChangedAt);
      if (row.lifecycle === 'approvalRequests') {
        const request = row.record as ApprovalRequest;
        if (
          request.status === 'draft' &&
          request.round > 0 &&
          (actor === request.applicantId || actor === request.submittedBy)
        )
          push('toDo', row.lifecycle, id, 'submit', 'returned', since);
        continue;
      }
      if (row.lifecycle === 'acknowledgements') continue;
      const work = WORK[row.lifecycle];
      if (
        !work ||
        (FINAL[row.lifecycle] ?? []).includes(text(row.record.status))
      )
        continue;
      const available = await runtime.available(row.lifecycle, id, {
        id: actor,
      });
      const action = available.find(
        (each) => each.allowed && work.includes(each.name),
      );
      if (action) push('toDo', row.lifecycle, id, action.name, '', since);
    }
    for (const record of records) {
      if (record.parent !== null || record.lifecycle === 'acknowledgements')
        continue;
      if (record.applicantId === actor)
        push(
          'mine',
          record.lifecycle,
          record.id,
          null,
          '',
          record.createdAt ?? record.updatedAt,
        );
    }
    for (const [key, at] of done) {
      const separator = key.indexOf(':');
      push(
        'done',
        key.slice(0, separator),
        key.slice(separator + 1),
        null,
        '',
        at,
      );
    }
    return items.sort((a, b) => (a.since < b.since ? 1 : -1));
  }

  /**
   * Who a request would go to if it were submitted now with this content.
   * Approval stages resolved on entry may still change before they are
   * reached; the preview says who it would be today.
   */
  public preview(
    key: string,
    content: JsonObject,
    applicantId: string,
  ): CenterPreview {
    const demo = APPROVAL_DEMOS.find((item) => item.key === key);
    if (!demo)
      throw new ExampleError('INVALID', 'scenario', 'Unknown request type.');
    const org = this.lab.directory();
    const policies = this.lab.policyRegistry();
    const approvalSteps = (kind: string): CenterPreviewStep[] => {
      if (!policies.has(kind)) return [];
      const policy = policies.get(kind);
      return policies
        .plan(kind, policy.currentVersion, content, applicantId)
        .map((plan) => {
          const chosen = choosePeople(plan, {
            org,
            applicantId,
            now: new Date().toISOString(),
          });
          return {
            key: plan.key,
            title: plan.title,
            kind: 'approval' as const,
            people: [...chosen.people],
            rule: plan.rule as unknown as JsonValue,
            required: true,
            notes: [...chosen.notes],
          };
        });
    };
    if (demo.lifecycle === 'approvalRequests')
      return { mode: 'sequential', steps: approvalSteps(key), problems: [] };
    if (demo.lifecycle === 'coordinations') {
      const planner = LAB_PLANNERS[key];
      if (!planner) return { mode: 'parallel', steps: [], problems: [] };
      const plan = planner.plan(content, applicantId);
      return {
        mode: 'parallel',
        problems: [...plan.problems],
        steps: plan.branches.map((branch) => {
          const stages = branch.approvalKind
            ? approvalSteps(branch.approvalKind)
            : [];
          return {
            key: branch.key,
            title: branch.title,
            kind: branch.kind === 'approval' ? 'approval' : 'work',
            people: branch.work
              ? activeHolders(org, branch.work.ownerRole)
              : [...new Set(stages.flatMap((stage) => stage.people))],
            rule: branch.work
              ? branch.work.steps.map((step) => step.key)
              : stages.map((stage) => stage.key),
            required: branch.required,
            notes: branch.because ? [branch.because] : [],
          };
        }),
      };
    }
    return { mode: 'sequential', steps: [], problems: [] };
  }
}
