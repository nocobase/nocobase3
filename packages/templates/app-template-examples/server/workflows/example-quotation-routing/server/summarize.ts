import type { WorkflowRunFunction } from '@nocobase/app-plugin-workflow';

export const run: WorkflowRunFunction = (input, options) => {
  options.signal.throwIfAborted();
  const args = input as {
    quotationId?: unknown;
    totalCents?: unknown;
    needsFollowUp?: unknown;
  } | null;
  if (
    !args ||
    typeof args.quotationId !== 'string' ||
    typeof args.totalCents !== 'number' ||
    typeof args.needsFollowUp !== 'boolean'
  )
    throw new Error('Invalid quotation result.');
  return {
    quotationId: args.quotationId,
    totalCents: args.totalCents,
    route: args.needsFollowUp ? 'manual-follow-up' : 'standard',
  };
};
