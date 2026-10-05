// The organization, policies and helpers the coordinated scenarios (9, 10,
// 19) share: a parent `coordinations` record over child approval requests
// and work items.
import {
  LifecycleError,
  type JsonObject,
  type Lifecycle,
  type LifecycleRecord,
  type LifecycleTypes,
} from '@nocobase/lifecycle';
import { expect } from 'vitest';

import {
  approvalLifecycle,
  type ApprovalRequest,
} from '../../server/approval-scenarios/approval/lifecycle.js';
import type { ApprovalPolicy } from '../../server/approval-scenarios/approval/policy.js';
import {
  coordinationValues,
  defineCoordinationLifecycle,
  type Branch,
  type Coordination,
  type CoordinationPlanner,
  type CoordinationStrategy,
} from '../../server/approval-scenarios/coordination.js';
import type { OrgSnapshot } from '../../server/approval-scenarios/org.js';
import { stages, type Stage } from './approval-fixtures.js';
import {
  workItemLifecycle,
  type WorkItem,
} from '../../server/approval-scenarios/work-item.js';
import { createHarness, type Harness } from './harness.js';

export const ORG: OrgSnapshot = {
  people: [
    'zhang',
    'li',
    'wang',
    'itA',
    'secA',
    'facA',
    'legalA',
    'legalB',
    'legalLead',
    'secEng',
    'secLead',
    'finA',
    'opsA',
    'itOpsA',
    'facOpsA',
    'hrA',
    'admin',
    'newHire',
  ],
  managers: { zhang: 'li', li: 'wang', secEng: 'secLead' },
  roles: {
    it: ['itA'],
    security: ['secA'],
    facilities: ['facA'],
    legal: ['legalA', 'legalB'],
    legalLead: ['legalLead'],
    secLead: ['secLead'],
    ops: ['opsA'],
    itOps: ['itOpsA'],
    facOps: ['facOpsA'],
    hrOps: ['hrA'],
    approvalAdmin: ['admin'],
  },
};

export function setup(
  planners: Readonly<Record<string, CoordinationPlanner>>,
  policies: Readonly<Record<string, ApprovalPolicy>> = {},
  parameters: Readonly<Record<string, Record<string, unknown>>> = {},
): Harness {
  return createHarness({
    org: ORG,
    policies,
    parameters,
    lifecycles: [
      approvalLifecycle as unknown as Lifecycle<LifecycleTypes>,
      workItemLifecycle as unknown as Lifecycle<LifecycleTypes>,
      defineCoordinationLifecycle(
        planners,
      ) as unknown as Lifecycle<LifecycleTypes>,
    ],
  });
}

/** Creates a coordinated request and starts it as its applicant. */
export async function started(
  h: Harness,
  kind: string,
  content: JsonObject,
  options: {
    applicantId?: string;
    strategy?: CoordinationStrategy;
    actor?: string | { id: string; system: true };
  } = {},
): Promise<Coordination> {
  const applicantId = options.applicantId ?? 'zhang';
  const record = await h.create(
    'coordinations',
    coordinationValues({
      kind,
      title: `${kind} of ${applicantId}`,
      applicantId,
      content,
      ...(options.strategy ? { strategy: options.strategy } : {}),
    }),
    applicantId,
  );
  return (await h.fire(
    'coordinations',
    record.id,
    'start',
    {},
    options.actor ?? applicantId,
  )) as Coordination;
}

export function parent(h: Harness, id: LifecycleRecord['id']): Coordination {
  return h.get('coordinations', id) as Coordination;
}

export function branch(record: Coordination, key: string): Branch {
  const found = record.branches.find((candidate) => candidate.key === key);
  if (!found) throw new Error(`No branch "${key}" on ${String(record.id)}.`);
  return found;
}

export function approvalChild(
  h: Harness,
  record: Coordination,
  key: string,
): ApprovalRequest {
  return h.get('approvalRequests', branch(record, key).id) as ApprovalRequest;
}

/** A child approval's stages, read from its rows. */
export function approvalStages(
  h: Harness,
  record: Coordination,
  key: string,
): Promise<Stage[]> {
  return stages(h, branch(record, key).id);
}

export function workChild(
  h: Harness,
  record: Coordination,
  key: string,
): WorkItem {
  return h.get('workItems', branch(record, key).id) as WorkItem;
}

/** Approves the active stage of a branch's approval request as `actor`. */
export async function decideBranch(
  h: Harness,
  record: Coordination,
  key: string,
  actor: string,
  decision: 'approve' | 'reject' = 'approve',
): Promise<ApprovalRequest> {
  return (await h.fire(
    'approvalRequests',
    branch(record, key).id,
    'decide',
    { decision, comment: decision === 'reject' ? 'Not acceptable.' : 'OK' },
    actor,
  )) as ApprovalRequest;
}

export async function refusal(
  promise: Promise<unknown>,
): Promise<LifecycleError> {
  const error = await promise.then(
    () => undefined,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(LifecycleError);
  return error as LifecycleError;
}
