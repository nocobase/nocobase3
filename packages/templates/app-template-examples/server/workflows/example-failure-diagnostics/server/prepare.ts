import type { WorkflowRunFunction } from '@nocobase/app-plugin-workflow';
export const run: WorkflowRunFunction = (input, options) => {
  options.signal.throwIfAborted();
  const reference = (input as { reference?: unknown } | null)?.reference;
  if (typeof reference !== 'string' || !reference.trim())
    throw new Error('Diagnostic reference is required.');
  options.logger.info('Diagnostic run prepared', { reference });
  return { reference };
};
