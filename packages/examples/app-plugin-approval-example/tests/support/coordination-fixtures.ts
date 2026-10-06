// The coordinated scenarios (9, 10, 19): a coordinated request,
// its branch rows, and child department reviews and work items.
import type { JsonObject, LifecycleRecord } from '@nocobase/lifecycle';

import type { OrgSnapshot } from '../../server/scenarios/org.js';
import {
  BRANCH_REVIEWS,
  branchReviewApproval,
  branchReviewLifecycle,
  branchViews,
  COORDINATIONS,
  coordinationValues,
  defineCoordinationLifecycle,
  workItemLifecycle,
  type BranchView,
  type Coordination,
  type CoordinationPlanner,
  type CoordinationStrategy,
} from '../../server/scenarios/coordination.js';
import {
  WORK_ITEMS,
  type WorkItem,
} from '../../server/scenarios/work-items.js';
import { createHarness, type Harness } from './harness.js';

export { BRANCH_REVIEWS, COORDINATIONS, WORK_ITEMS };

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
  parameters: Readonly<Record<string, Record<string, unknown>>> = {},
): Harness {
  return createHarness({
    org: ORG,
    parameters,
    lifecycles: [
      branchReviewLifecycle as never,
      workItemLifecycle as never,
      defineCoordinationLifecycle(planners) as never,
    ],
    approvals: [branchReviewApproval as never],
  });
}

export async function started(
  h: Harness,
  kind: string,
  content: JsonObject,
  options: {
    applicantId?: string;
    strategy?: CoordinationStrategy;
    actor?: string | { id: string; system: true };
  } = {},
): Promise<string> {
  const applicantId = options.applicantId ?? 'zhang';
  const record = await h.create(
    COORDINATIONS,
    coordinationValues({
      kind,
      title: `${kind} of ${applicantId}`,
      applicantId,
      content,
      ...(options.strategy ? { strategy: options.strategy } : {}),
    }),
    applicantId,
  );
  await h.fire(
    COORDINATIONS,
    record.id,
    'start',
    {},
    options.actor ?? applicantId,
  );
  return String(record.id);
}

export function parent(h: Harness, id: string): Coordination {
  return h.get(COORDINATIONS, id) as Coordination;
}

export function branches(h: Harness, id: string): Promise<BranchView[]> {
  return branchViews(h.runtime, id);
}

/** The active branch of a key, or the one of a given revision. */
export async function branch(
  h: Harness,
  id: string,
  key: string,
  revision?: number,
): Promise<BranchView> {
  const found = (await branches(h, id)).filter(
    (each) =>
      each.key === key &&
      (revision === undefined
        ? each.status === 'active'
        : each.revision === revision),
  )[0];
  if (!found) throw new Error(`No branch "${key}" on ${id}.`);
  return found;
}

export async function child(
  h: Harness,
  id: string,
  key: string,
): Promise<LifecycleRecord> {
  const found = await branch(h, id, key);
  return h.get(found.childLifecycle, found.childId);
}

export async function work(
  h: Harness,
  id: string,
  key: string,
): Promise<WorkItem> {
  return (await child(h, id, key)) as WorkItem;
}

/** `person` answers the open task of a branch's department review. */
export async function decideBranch(
  h: Harness,
  id: string,
  key: string,
  person: string,
  answer: 'approve' | 'reject' = 'approve',
): Promise<void> {
  const found = await branch(h, id, key);
  await h.answer(
    BRANCH_REVIEWS,
    found.childId,
    person,
    answer,
    answer === 'reject' ? 'Not acceptable.' : undefined,
  );
}
