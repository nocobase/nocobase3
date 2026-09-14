import type { QueryAdapter, Row } from '@nocobase/db';

import { WORKFLOW_COLLECTIONS } from '../collections/names.js';
import type {
  WorkflowId,
  WorkflowTerminalEvent,
  WorkflowTerminalObserver,
} from './types.js';
import { serializeJson } from './utils.js';

export interface FinalizeWorkflowRunOptions {
  readonly query: QueryAdapter;
  readonly runId: WorkflowId;
  readonly expectedStatus: number | null;
  readonly status: number;
  readonly reason: string | null;
  readonly output: unknown;
  readonly finishedAt?: string;
  readonly observer?: WorkflowTerminalObserver;
}

export async function finalizeWorkflowRun(
  options: FinalizeWorkflowRunOptions,
): Promise<WorkflowTerminalEvent | null> {
  const finishedAt = options.finishedAt ?? new Date().toISOString();
  const result = await options.query
    .updateTable(WORKFLOW_COLLECTIONS.runs)
    .set({
      status: options.status,
      output: serializeJson(options.output),
      reason: options.reason,
      finishedAt,
    })
    .where('id', '=', options.runId)
    .where(
      'status',
      options.expectedStatus === null ? 'is' : '=',
      options.expectedStatus,
    )
    .execute();
  if ((result.updatedCount ?? 0) === 0) return null;
  const row = await options.query
    .selectFrom(WORKFLOW_COLLECTIONS.runs)
    .select(['sourceType', 'sourceId'])
    .where('id', '=', options.runId)
    .executeTakeFirst<Row>();
  const event: WorkflowTerminalEvent = {
    runId: options.runId,
    status: options.status,
    reason: options.reason,
    output: options.output,
    finishedAt,
    sourceType: typeof row?.sourceType === 'string' ? row.sourceType : null,
    sourceId: typeof row?.sourceId === 'string' ? row.sourceId : null,
  };
  if (options.status !== 0) {
    try {
      await options.observer?.(event);
    } catch (error) {
      // The authoritative Workflow terminal state must survive an optional
      // projection observer being temporarily unavailable. Scheduler repairs
      // a missed fast-path notification through its persisted observer.
      console.error('Workflow terminal observer failed', {
        runId: options.runId,
        sourceType: event.sourceType,
        sourceId: event.sourceId,
        error,
      });
    }
  }
  return event;
}
