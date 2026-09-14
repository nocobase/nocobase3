import type { WorkflowRunFunction } from '@nocobase/app-plugin-workflow';

export function calculateQuotation(input: unknown): {
  quotationId: string;
  totalCents: number;
} {
  const args = input as { quotationId?: unknown; amountCents?: unknown } | null;
  if (
    !args ||
    typeof args.quotationId !== 'string' ||
    !args.quotationId.trim() ||
    args.quotationId.length > 64 ||
    typeof args.amountCents !== 'number' ||
    !Number.isSafeInteger(args.amountCents) ||
    args.amountCents < 0 ||
    args.amountCents > 100000000
  )
    throw new Error('Invalid quotation input.');
  return { quotationId: args.quotationId, totalCents: args.amountCents };
}
export const run: WorkflowRunFunction = (args, options) => {
  options.signal.throwIfAborted();
  const result = calculateQuotation(args);
  options.logger.info('Quotation calculated', result);
  return result;
};
