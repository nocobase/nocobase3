// Scenario 20, one to-do center over every kind of request. The staged
// approval keeps a row per to-do, so its part of the center is a query on
// the assignee; a business without such rows contributes what its records
// say. Either way an entry can be checked against the lifecycle's own
// guards before it is shown.
import type {
  LifecycleRecord,
  LifecycleRuntime,
  RecordId,
} from '@nocobase/lifecycle';

import {
  APPROVAL_TABLES,
  type ApprovalTaskRow,
} from '../../shared/approval-trail.js';
import type { Acknowledgement } from './acknowledgement.js';
import { kindOf } from './acknowledgement.js';
import type { ApprovalRequest } from './approval/lifecycle.js';
import { approvalRows } from './approval/records.js';
import { SCENARIO_COLLECTIONS, type ScenarioServices } from './services.js';

/** The four boxes of the center: to do, done by me, started by me, copied to me. */
export type TodoBox = 'toDo' | 'done' | 'mine' | 'copiedToMe';

export interface TodoItem {
  readonly box: TodoBox;
  readonly lifecycle: string;
  readonly recordId: string;
  readonly title: string;
  /** What the person would do here: a transition name, or null to only look. */
  readonly action: string | null;
  readonly detail: string;
  /** Whose to-do a delegate is looking at; null for the person's own. */
  readonly onBehalfOf: string | null;
  /** Pass back as `expect.version` from the card's button. */
  readonly version: number;
  readonly since: string;
}

/**
 * How one business contributes: the person's entries in one box, found by
 * queries on the business's own rows.
 */
export interface TodoSource {
  readonly lifecycle: string;
  collect(
    person: string,
    box: TodoBox,
    services: ScenarioServices,
    now: Date,
  ): Promise<TodoItem[]>;
}

function base(
  lifecycle: string,
  record: LifecycleRecord,
  title: string,
): Pick<
  TodoItem,
  'lifecycle' | 'recordId' | 'title' | 'version' | 'since' | 'onBehalfOf'
> {
  return {
    lifecycle,
    recordId: String(record.id),
    title,
    version: Number(record.lifecycleVersion ?? 0),
    since: String(record.statusChangedAt),
    onBehalfOf: null,
  };
}

async function openTasksOf(
  services: ScenarioServices,
  person: string,
): Promise<ApprovalTaskRow[]> {
  const rows = [
    ...(await services.records.find(APPROVAL_TABLES.tasks, {
      assigneeId: person,
      status: 'pending',
    })),
    ...(await services.records.find(APPROVAL_TABLES.tasks, {
      assigneeId: person,
      status: 'claimed',
    })),
  ];
  return rows.map(approvalRows.task);
}

/** Reads each request once, however many of its tasks are listed. */
function requestReader(
  services: ScenarioServices,
): (id: RecordId) => Promise<ApprovalRequest | undefined> {
  const cache = new Map<string, Promise<LifecycleRecord | undefined>>();
  return async (id) => {
    let pending = cache.get(String(id));
    if (!pending) {
      pending = services.records.get(SCENARIO_COLLECTIONS.approvalRequests, id);
      cache.set(String(id), pending);
    }
    return (await pending) as ApprovalRequest | undefined;
  };
}

async function approvalToDo(
  person: string,
  services: ScenarioServices,
  now: Date,
): Promise<TodoItem[]> {
  const request = requestReader(services);
  const at = now.toISOString();
  const found: { task: ApprovalTaskRow; principal: string | null }[] = (
    await openTasksOf(services, person)
  ).map((task) => ({ task, principal: null }));
  // A delegate also sees the decisions their principals' delegations cover.
  for (const principal of services.org.delegatorsOf(person, at))
    for (const task of await openTasksOf(services, principal))
      if (task.kind === 'decide') found.push({ task, principal });
  const items: TodoItem[] = [];
  for (const { task, principal } of found) {
    const record = await request(task.requestId);
    if (
      !record ||
      (record.status !== 'inReview' && record.status !== 'awaitingMaterials')
    )
      continue;
    if (
      principal !== null &&
      (person === record.applicantId ||
        services.org.delegateOf(principal, record.kind, at, task.createdAt)
          ?.to !== person)
    )
      continue;
    const common = {
      ...base('approvalRequests', record, record.title),
      since: task.createdAt,
      onBehalfOf: principal,
    };
    if (task.kind === 'consult') {
      items.push({
        ...common,
        box: 'toDo',
        action: 'answerConsultation',
        detail: task.prompt ?? '',
      });
      continue;
    }
    if (task.kind === 'supply') {
      items.push({
        ...common,
        box: 'toDo',
        action: 'supplyMaterials',
        detail: task.prompt ?? '',
      });
      continue;
    }
    const row = task.stageId
      ? await services.records.get(APPROVAL_TABLES.stages, task.stageId)
      : undefined;
    const stage = row ? approvalRows.stage(row) : undefined;
    const pooled = stage?.rule.kind === 'claim' && task.status === 'pending';
    const title = stage?.title ?? '';
    items.push({
      ...common,
      box: 'toDo',
      action: pooled ? 'claim' : 'decide',
      detail: pooled
        ? `${title} (pool)`
        : principal === null
          ? title
          : `${title}, for ${principal}`,
    });
  }
  return items;
}

export const approvalTodoSource: TodoSource = {
  lifecycle: 'approvalRequests',
  collect: async (person, box, services, now) => {
    if (box === 'toDo') return approvalToDo(person, services, now);
    if (box === 'done') {
      // Every decision the person made, including those later made void.
      const request = requestReader(services);
      const decided = (
        await services.records.find(APPROVAL_TABLES.tasks, { actorId: person })
      )
        .map(approvalRows.task)
        .filter((task) => task.kind === 'decide');
      const items = new Map<string, TodoItem>();
      for (const task of decided) {
        const record = await request(task.requestId);
        if (!record) continue;
        items.set(task.requestId, {
          ...base('approvalRequests', record, record.title),
          box: 'done',
          action: null,
          detail: record.status,
        });
      }
      return [...items.values()];
    }
    if (box === 'mine') {
      const mine = new Map<string, LifecycleRecord>();
      for (const field of ['applicantId', 'submittedBy', 'createdBy'])
        for (const row of await services.records.find(
          SCENARIO_COLLECTIONS.approvalRequests,
          { [field]: person },
        ))
          mine.set(String(row.id), row);
      return [...mine.values()].map((row) => {
        const record = row as ApprovalRequest;
        return {
          ...base('approvalRequests', record, record.title),
          box: 'mine',
          action: null,
          detail: record.status,
        };
      });
    }
    return [];
  },
};

export const acknowledgementTodoSource: TodoSource = {
  lifecycle: 'acknowledgements',
  collect: async (person, box, services) => {
    const items: TodoItem[] = [];
    for (const row of await services.records.find(
      SCENARIO_COLLECTIONS.acknowledgements,
      { recipientId: person },
    )) {
      const record = row as Acknowledgement;
      if (record.status === 'revoked') continue;
      const common = base('acknowledgements', record, record.title);
      if (box === 'copiedToMe')
        items.push({
          ...common,
          box: 'copiedToMe',
          action: null,
          detail: record.status,
        });
      if (box !== 'toDo') continue;
      const kind = kindOf(record);
      if (
        kind === 'receipt' &&
        (record.status === 'unread' || record.status === 'delivered')
      )
        items.push({
          ...common,
          box: 'toDo',
          action: 'read',
          detail: 'Read it',
        });
      if (kind === 'confirm' && record.status !== 'confirmed')
        items.push({
          ...common,
          box: 'toDo',
          action: record.status === 'read' ? 'confirm' : 'read',
          detail: 'Read and confirm',
        });
    }
    return items;
  },
};

export interface TodoQuery {
  readonly person: string;
  readonly box: TodoBox;
  /**
   * Ask the lifecycle's own guards before listing a to-do, so an entry is
   * never shown that its button would refuse — a guard added by another
   * plugin included. Costs one guard evaluation per entry.
   */
  readonly verify?: boolean;
  readonly limit?: number;
  readonly offset?: number;
}

export async function todosFor(
  sources: readonly TodoSource[],
  services: ScenarioServices,
  runtime: LifecycleRuntime,
  query: TodoQuery,
  now: Date,
): Promise<TodoItem[]> {
  const found: TodoItem[] = [];
  for (const source of sources)
    found.push(
      ...(await source.collect(query.person, query.box, services, now)),
    );
  let items = found;
  if (query.verify && query.box === 'toDo') {
    items = [];
    for (const item of found) {
      const check = await runtime.can(
        item.lifecycle,
        item.recordId,
        item.action ?? '',
        {
          id: query.person,
        },
      );
      if (check.allowed) items.push(item);
    }
  }
  items.sort((a, b) => (a.since < b.since ? -1 : a.since > b.since ? 1 : 0));
  const offset = query.offset ?? 0;
  return items.slice(offset, offset + (query.limit ?? items.length));
}
