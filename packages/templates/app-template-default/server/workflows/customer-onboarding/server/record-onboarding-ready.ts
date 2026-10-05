import type { WorkflowRunFunction } from '@nocobase/app-plugin-workflow';

export const run: WorkflowRunFunction = (rawArgs: unknown, runtime): null => {
  runtime.signal.throwIfAborted();
  const customerId = (rawArgs as { customerId?: unknown }).customerId;
  if (typeof customerId !== 'string' || customerId.length === 0)
    throw new Error('customerId is required.');

  runtime.logger.info('Customer onboarding readiness recorded');
  return null;
};
