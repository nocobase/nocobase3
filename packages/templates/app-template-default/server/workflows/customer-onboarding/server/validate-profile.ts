import type {
  WorkflowRunFunction,
  WorkflowRunJsonValue,
} from '@nocobase/app-plugin-workflow';

interface ValidateProfileArgs {
  customerId?: unknown;
  name?: unknown;
  email?: unknown;
}

export const run: WorkflowRunFunction = (
  rawArgs: unknown,
  runtime,
): WorkflowRunJsonValue => {
  runtime.signal.throwIfAborted();
  const args = rawArgs as ValidateProfileArgs;
  if (typeof args.customerId !== 'string' || args.customerId.length === 0)
    throw new Error('customerId is required.');

  const missingFields: string[] = [];
  if (typeof args.name !== 'string' || args.name.trim().length === 0)
    missingFields.push('name');
  if (typeof args.email !== 'string' || args.email.trim().length === 0)
    missingFields.push('email');

  runtime.logger.info('Customer profile validated');
  return { complete: missingFields.length === 0, missingFields };
};
