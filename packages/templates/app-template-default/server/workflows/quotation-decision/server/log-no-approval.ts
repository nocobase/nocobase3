import type { WorkflowRunFunction } from '@nocobase/app-plugin-workflow';

interface LogNoApprovalArgs {
  quotationId?: unknown;
}

export const run: WorkflowRunFunction = (rawArgs: unknown, runtime): null => {
  runtime.signal.throwIfAborted();
  const args = rawArgs as LogNoApprovalArgs;
  if (typeof args.quotationId !== 'string' || args.quotationId.length === 0)
    throw new Error('quotationId is required.');

  runtime.logger.info('Quotation does not require approval', {
    quotationId: args.quotationId,
  });
  return null;
};
