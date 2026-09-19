import type { WorkflowRunFunction } from '@nocobase/app-plugin-workflow';

export const run: WorkflowRunFunction = (input, options) => {
  options.signal.throwIfAborted();
  const args = input as { route?: unknown; quotationId?: unknown } | null;
  if (
    !args ||
    typeof args.quotationId !== 'string' ||
    !['standard', 'manual-follow-up'].includes(String(args.route))
  )
    throw new Error('Invalid routing input.');
  // This demonstrates classification, not a durable human approval or wait node.
  const result = { quotationId: args.quotationId, route: String(args.route) };
  options.logger.info('Demonstration route selected', result);
  return result;
};
