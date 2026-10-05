import type {
  WorkflowRunFunction,
  WorkflowRunJsonValue,
} from '@nocobase/app-plugin-workflow';

interface RecordStepArgs {
  caseId?: unknown;
  step?: unknown;
  suiteLabel?: unknown;
}

export const run: WorkflowRunFunction = (
  rawArgs: unknown,
  runtime,
): WorkflowRunJsonValue => {
  runtime.signal.throwIfAborted();
  const args = rawArgs as RecordStepArgs;
  if (
    typeof args.caseId !== 'string' ||
    typeof args.step !== 'string' ||
    typeof args.suiteLabel !== 'string'
  ) {
    throw new Error('caseId, step, and suiteLabel must be strings.');
  }

  const result: WorkflowRunJsonValue = {
    caseId: args.caseId,
    step: args.step,
    suiteLabel: args.suiteLabel,
  };
  runtime.logger.info('Workflow coverage step completed', {
    caseId: args.caseId,
    step: args.step,
  });
  return result;
};
