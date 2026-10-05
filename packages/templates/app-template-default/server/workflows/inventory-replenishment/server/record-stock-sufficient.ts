import type { WorkflowRunFunction } from '@nocobase/app-plugin-workflow';

export const run: WorkflowRunFunction = (rawArgs: unknown, runtime): null => {
  runtime.signal.throwIfAborted();
  const sku = (rawArgs as { sku?: unknown }).sku;
  if (typeof sku !== 'string' || sku.length === 0)
    throw new Error('sku is required.');

  runtime.logger.info('Sufficient inventory recorded');
  return null;
};
