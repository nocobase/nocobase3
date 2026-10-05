import type { WorkflowRunFunction } from '@nocobase/app-plugin-workflow';

interface RecordOnboardingRejectedArgs {
  customerId?: unknown;
  missingFields?: unknown;
}

export const run: WorkflowRunFunction = (rawArgs: unknown, runtime): null => {
  runtime.signal.throwIfAborted();
  const args = rawArgs as RecordOnboardingRejectedArgs;
  if (typeof args.customerId !== 'string' || args.customerId.length === 0)
    throw new Error('customerId is required.');
  if (
    !Array.isArray(args.missingFields) ||
    !args.missingFields.every((field) => typeof field === 'string')
  )
    throw new Error('missingFields must be a string array.');

  runtime.logger.info('Customer onboarding rejection recorded');
  return null;
};
