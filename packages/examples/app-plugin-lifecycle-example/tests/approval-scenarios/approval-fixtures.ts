// The organization and the approval policies the generic staged approval
// scenarios run against, and readers for the rows an approval keeps.
import type { JsonObject, LifecycleRecord } from '@nocobase/lifecycle';

import {
  APPROVAL_TABLES,
  assigneeTasks,
  candidatesOf,
  claimantOf,
  currentStage,
  votesOf,
  voidedVotesOf,
  type ApprovalLogRow,
  type ApprovalStageView,
  type ApprovalTaskRow,
  type ApprovalTrail,
  type AssignedVia,
} from '../../shared/approval-trail.js';
import {
  approvalLifecycle,
  draftValues,
  type ApprovalRequest,
} from '../../server/approval-scenarios/approval/lifecycle.js';
import {
  approvalRows,
  approvalTrail,
} from '../../server/approval-scenarios/approval/records.js';
import { createHarness, type Harness, type HarnessOptions } from './harness.js';

export {
  ORG,
  policies,
} from '../../server/approval-scenarios/demo-policies.js';
import {
  ORG,
  policies,
} from '../../server/approval-scenarios/demo-policies.js';

export function approvalHarness(extra: Partial<HarnessOptions> = {}): Harness {
  return createHarness({
    org: ORG,
    policies: policies(),
    ...extra,
    lifecycles: [approvalLifecycle as never, ...(extra.lifecycles ?? [])],
  });
}

export async function draft(
  h: Harness,
  kind: string,
  content: JsonObject,
  applicantId = 'zhang',
  extra: { createdBy?: string; subjectKey?: string } = {},
): Promise<ApprovalRequest> {
  return (await h.create(
    'approvalRequests',
    draftValues({
      kind,
      title: `${kind} of ${applicantId}`,
      applicantId,
      content,
      ...extra,
    }),
    extra.createdBy ?? applicantId,
  )) as ApprovalRequest;
}

export async function submitted(
  h: Harness,
  kind: string,
  content: JsonObject,
  applicantId = 'zhang',
): Promise<ApprovalRequest> {
  const request = await draft(h, kind, content, applicantId);
  return (await h.fire(
    'approvalRequests',
    request.id,
    'submit',
    {},
    applicantId,
  )) as ApprovalRequest;
}

export function request(
  h: Harness,
  id: LifecycleRecord['id'],
): ApprovalRequest {
  return h.get('approvalRequests', id) as ApprovalRequest;
}

export function trail(
  h: Harness,
  id: LifecycleRecord['id'],
): Promise<ApprovalTrail> {
  return approvalTrail(h.services.records, request(h, id));
}

/** A decision, as the scenarios talk about it. */
export interface Vote {
  readonly userId: string;
  readonly actorId: string;
  readonly decision: string;
  readonly comment: string;
  readonly round: number;
  readonly revision: number;
  readonly contentHash: string;
}

/** A responsibility someone holds on a stage. */
export interface Assignee {
  readonly userId: string;
  readonly via: AssignedVia;
  readonly note: string | null;
  readonly assignedAt: string;
}

/** A stage with its task rows read as the people and decisions they stand for. */
export interface Stage extends ApprovalStageView {
  readonly assignees: readonly Assignee[];
  readonly candidates: readonly string[];
  readonly claimedBy: string | null;
  readonly votes: readonly Vote[];
  readonly voidedVotes: readonly Vote[];
}

function vote(task: ApprovalTaskRow): Vote {
  return {
    userId: task.assigneeId,
    actorId: task.actorId ?? task.assigneeId,
    decision: task.decision ?? '',
    comment: task.comment ?? '',
    round: task.round,
    revision: task.revision ?? 0,
    contentHash: task.contentHash ?? '',
  };
}

export function stageOf(view: ApprovalStageView): Stage {
  return {
    ...view,
    assignees:
      view.rule.kind === 'claim'
        ? []
        : assigneeTasks(view).map((task) => ({
            userId: task.assigneeId,
            via: task.via,
            note: task.note,
            assignedAt: task.createdAt,
          })),
    candidates: candidatesOf(view),
    claimedBy: claimantOf(view),
    votes: votesOf(view).map(vote),
    voidedVotes: voidedVotesOf(view).map(vote),
  };
}

/** The current round's stages, in order. */
export async function stages(
  h: Harness,
  id: LifecycleRecord['id'],
): Promise<Stage[]> {
  return (await trail(h, id)).stages.map(stageOf);
}

/** The stage waiting for decisions. */
export async function active(
  h: Harness,
  id: LifecycleRecord['id'],
): Promise<Stage | undefined> {
  const stage = currentStage(await trail(h, id));
  return stage ? stageOf(stage) : undefined;
}

export async function assignees(
  h: Harness,
  id: LifecycleRecord['id'],
): Promise<string[]> {
  return (await active(h, id))?.assignees.map((each) => each.userId) ?? [];
}

/** Every task row of a request, oldest first. */
export async function tasks(
  h: Harness,
  id: LifecycleRecord['id'],
): Promise<ApprovalTaskRow[]> {
  return (
    await h.services.records.find(APPROVAL_TABLES.tasks, {
      requestId: String(id),
    })
  )
    .map(approvalRows.task)
    .sort((a, b) => a.seq - b.seq);
}

export async function logs(
  h: Harness,
  id: LifecycleRecord['id'],
): Promise<ApprovalLogRow[]> {
  return (await trail(h, id)).logs;
}

export function decide(
  h: Harness,
  id: LifecycleRecord['id'],
  actor: string,
  decision: 'approve' | 'reject' | 'abstain' = 'approve',
  comment = decision === 'reject' ? 'No.' : 'OK',
  options: { version?: number; contentHash?: string; requestId?: string } = {},
): Promise<ApprovalRequest> {
  return h.fire(
    'approvalRequests',
    id,
    'decide',
    {
      decision,
      comment,
      ...(options.contentHash ? { contentHash: options.contentHash } : {}),
    },
    actor,
    {
      ...(options.version === undefined
        ? {}
        : { expect: { version: options.version } }),
      ...(options.requestId === undefined
        ? {}
        : { requestId: options.requestId }),
    },
  ) as Promise<ApprovalRequest>;
}

export function versionOf(record: ApprovalRequest): number {
  return Number(record.lifecycleVersion);
}
