import type {
  WorkflowRunFunction,
  WorkflowRunJsonValue,
} from '@nocobase/app-plugin-workflow';

export const run: WorkflowRunFunction = async (
  rawArgs: unknown,
): Promise<WorkflowRunJsonValue> => {
  const args = rawArgs as { amount: number };
  return { score: args.amount };
};
