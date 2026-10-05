import type { WorkflowRunFunction } from '@nocobase/app-plugin-workflow';

interface RecordReplenishmentArgs {
  sku?: unknown;
  quantity?: unknown;
}

export const run: WorkflowRunFunction = (rawArgs: unknown, runtime): null => {
  runtime.signal.throwIfAborted();
  const args = rawArgs as RecordReplenishmentArgs;
  if (typeof args.sku !== 'string' || args.sku.length === 0)
    throw new Error('sku is required.');
  if (typeof args.quantity !== 'number' || !Number.isInteger(args.quantity))
    throw new Error('quantity must be an integer.');

  runtime.logger.info('Inventory replenishment recommendation recorded');
  return null;
};
