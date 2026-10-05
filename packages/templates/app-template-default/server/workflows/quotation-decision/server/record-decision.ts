import type { WorkflowRunFunction } from '@nocobase/app-plugin-workflow';

interface RecordDecisionArgs {
  quotationId?: unknown;
  needsApproval?: unknown;
}

export const run: WorkflowRunFunction = (rawArgs: unknown, runtime): null => {
  runtime.signal.throwIfAborted();
  const args = rawArgs as RecordDecisionArgs;
  if (typeof args.quotationId !== 'string' || args.quotationId.length === 0)
    throw new Error('quotationId is required.');
  if (typeof args.needsApproval !== 'boolean')
    throw new Error('needsApproval must be boolean.');

  runtime.logger.info('Quotation decision recorded');
  return null;
};
