import type { WorkflowStore } from '../collections/store.js';
import type {
  WorkflowId,
  WorkflowLogger,
  WorkflowTerminalEvent,
  WorkflowTerminalObserver,
} from './types.js';
import { asIdFilter, nowInstant, serializeJson } from './utils.js';

export interface FinalizeWorkflowRunOptions {
  readonly store: WorkflowStore;
  readonly runId: WorkflowId;
  readonly expectedStatus: number | null;
  readonly status: number;
  readonly reason: string | null;
  readonly output: unknown;
  readonly finishedAt?: string;
  readonly observer?: WorkflowTerminalObserver;
  readonly logger?: WorkflowLogger;
}

export async function finalizeWorkflowRun(
  options: FinalizeWorkflowRunOptions,
): Promise<WorkflowTerminalEvent | null> {
  const finishedAt = options.finishedAt ?? nowInstant();
  const result = await options.store.runs.updateMany({
    filter: {
      id: asIdFilter(options.runId),
      status: options.expectedStatus,
    },
    values: {
      status: options.status,
      output: serializeJson(options.output),
      reason: options.reason,
      finishedAt,
    },
  });
  if (result.updatedCount === 0) return null;
  const row = await options.store.runs.findOne({
    filter: { id: asIdFilter(options.runId) },
    select: (select) => select.fields('sourceType', 'sourceId'),
  });
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
      options.logger?.error('Workflow terminal observer failed', {
        runId: options.runId,
        sourceType: event.sourceType,
        sourceId: event.sourceId,
        error,
      });
    }
  }
  return event;
}
