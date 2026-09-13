import type { WorkflowRunFunction } from '@nocobase/app-plugin-workflow';
export const run: WorkflowRunFunction = (input, options) => {
  options.signal.throwIfAborted();
  const result = (input as { result?: unknown } | null)?.result;
  if (
    !result ||
    typeof result !== 'object' ||
    (result as { completed?: unknown }).completed !== true
  )
    throw new Error('Operation did not complete.');
  options.logger.info('Diagnostic workflow completed');
  return result;
};
