import type {
  WorkflowRunFunction,
  WorkflowRunJsonValue,
} from '@nocobase/app-plugin-workflow';

interface CalculateRiskArgs {
  quotationId?: unknown;
  amount?: unknown;
}

export const run: WorkflowRunFunction = (
  rawArgs: unknown,
  runtime,
): WorkflowRunJsonValue => {
  runtime.signal.throwIfAborted();
  const args = rawArgs as CalculateRiskArgs;
  if (typeof args.quotationId !== 'string' || args.quotationId.length === 0)
    throw new Error('quotationId is required.');
  if (typeof args.amount !== 'number' || !Number.isFinite(args.amount))
    throw new Error('amount must be a finite number.');

  runtime.logger.info('Quotation risk calculated');
  return { score: args.amount };
};
