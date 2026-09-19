import type { WorkflowRunFunction } from '@nocobase/app-plugin-workflow';
export const run: WorkflowRunFunction = (input, options) => {
  options.signal.throwIfAborted();
  const args = input as {
    reference?: unknown;
    simulateFailure?: unknown;
  } | null;
  if (
    !args ||
    typeof args.reference !== 'string' ||
    typeof args.simulateFailure !== 'boolean'
  )
    throw new Error('Invalid diagnostic input.');
  options.logger.info('Controlled operation started', {
    reference: args.reference,
    simulateFailure: args.simulateFailure,
  });
  if (args.simulateFailure)
    throw new Error(
      'Intentional example failure. Start a new run with simulateFailure=false to complete the workflow.',
    );
  return { reference: args.reference, completed: true };
};
