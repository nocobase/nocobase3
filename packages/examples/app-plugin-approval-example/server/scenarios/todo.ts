import type { LifecycleRuntime, LifecycleTypes } from '@nocobase/lifecycle';

import type { OrgDirectory } from './org.js';
import {
  APPROVAL_COLLECTIONS,
  rowsOf,
  toRunRow,
  type Approval,
  type ApprovalService,
  type TaskRow,
} from '@nocobase/app-plugin-approval/server';

// Scenario 20: the to-do center reads the task table, one
// person's rows at a time, with an index on (assignee, status) doing the
// work. Every approval writes the same rows, so a new kind of request joins
// the center without a source of its own. Items that are not approval tasks
// — an order to ship, a payment to schedule — stay with their businesses;
// whether they join this table is a product decision, and nothing in the
// table would have to change if they did.

export type TodoBox = 'toDo' | 'done' | 'mine' | 'copiedToMe';

export interface TodoItem {
  readonly source: string;
  readonly lifecycle: string;
  readonly recordId: string;
  readonly taskId: string | null;
  /** `respond`, `claim`, `read` or `view`. */
  readonly action: string;
  /** The stage, and for whom when it is delegated work. */
  readonly detail: string;
  readonly at: string;
}

export interface TodoQuery {
  readonly person: string;
  readonly box: TodoBox;
  readonly limit?: number;
  readonly offset?: number;
}

function page<T>(items: T[], query: TodoQuery): T[] {
  const offset = query.offset ?? 0;
  return items.slice(
    offset,
    query.limit === undefined ? undefined : offset + query.limit,
  );
}

export async function todosFor(
  service: ApprovalService,
  runtime: LifecycleRuntime,
  org: OrgDirectory,
  approvals: readonly Approval<never>[],
  query: TodoQuery,
  now: Date,
): Promise<TodoItem[]> {
  const byName = new Map(
    approvals.map((approval) => [
      approval.name,
      approval as unknown as Approval<LifecycleTypes>,
    ]),
  );
  const title = (task: TaskRow): string => {
    const approval = byName.get(task.source);
    if (!approval || !approval.isStage(task.stage)) return task.stage;
    return approval.stage(task.stage).title ?? task.stage;
  };
  const item = (task: TaskRow, action: string, detail: string): TodoItem => ({
    source: task.source,
    lifecycle: task.lifecycle,
    recordId: task.recordId,
    taskId: task.id,
    action,
    detail,
    at: task.createdAt,
  });
  const { person } = query;
  switch (query.box) {
    case 'toDo': {
      const own = (await service.tasksOf(person)).filter(
        (task) => task.kind !== 'copy',
      );
      const delegated: TodoItem[] = [];
      for (const principal of org.delegatorsOf(person, now.toISOString()))
        for (const task of await service.tasksOf(principal, [
          'pending',
          'claimed',
        ])) {
          const approval = byName.get(task.source);
          if (task.kind !== 'decide' || !approval) continue;
          const delegation = org.delegateOf(
            principal,
            approval.kind,
            now.toISOString(),
            task.createdAt,
          );
          if (delegation?.to === person)
            delegated.push(
              item(task, 'respond', `${title(task)}, for ${principal}`),
            );
        }
      return page(
        [
          ...own.map((task) =>
            item(
              task,
              task.status === 'candidate' ? 'claim' : 'respond',
              task.kind === 'decide'
                ? title(task)
                : `${task.kind}: ${task.note ?? ''}`,
            ),
          ),
          ...delegated,
        ].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0)),
        query,
      );
    }
    case 'done':
      return page(
        (await service.tasksOf(person, ['completed']))
          .filter((task) => task.kind !== 'copy')
          .map((task) => item(task, 'view', task.answer ?? '')),
        query,
      );
    case 'copiedToMe':
      return page(
        (await service.tasksOf(person, ['pending', 'completed']))
          .filter((task) => task.kind === 'copy')
          .map((task) =>
            item(
              task,
              task.status === 'pending' ? 'read' : 'view',
              title(task),
            ),
          ),
        query,
      );
    case 'mine': {
      const runs = await runtime.transaction(async (tx) =>
        (await rowsOf(tx.handle).find(APPROVAL_COLLECTIONS.runs, {}))
          .map(toRunRow)
          .filter(
            (run) =>
              byName.has(run.source) &&
              (run.applicantId === person || run.startedBy === person),
          ),
      );
      return page(
        runs.map((run) => ({
          source: run.source,
          lifecycle: run.lifecycle,
          recordId: run.recordId,
          taskId: null,
          action: 'view',
          detail: run.status,
          at: run.startedAt,
        })),
        query,
      );
    }
  }
}
