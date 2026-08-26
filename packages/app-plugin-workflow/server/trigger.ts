import type {
  JsonObject,
  WorkflowEventOptions,
  WorkflowTriggerReceipt,
} from './engine/index.js';
import type { AppWorkflowRuntime } from './runtime/runtime.js';

export function trigger(
  runtime: AppWorkflowRuntime,
  workflowKey: string,
  context: JsonObject,
  options: WorkflowEventOptions = {},
): Promise<WorkflowTriggerReceipt> {
  return runtime.trigger(workflowKey, context, options);
}
