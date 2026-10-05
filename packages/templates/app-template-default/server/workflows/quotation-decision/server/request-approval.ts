import type { WorkflowRunFunction } from '@nocobase/app-plugin-workflow';

export const run: WorkflowRunFunction = (rawArgs: unknown, runtime): null => {
  runtime.signal.throwIfAborted();
  const quotationId = (rawArgs as { quotationId?: unknown }).quotationId;
  if (typeof quotationId !== 'string' || quotationId.length === 0)
    throw new Error('quotationId is required.');

  runtime.logger.info('Quotation approval requested');
  return null;
};
