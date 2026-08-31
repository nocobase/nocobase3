import type {
  WorkflowRunFunction,
  WorkflowRunJsonValue,
} from '@nocobase/app-plugin-workflow';

export const run: WorkflowRunFunction =
  async (): Promise<WorkflowRunJsonValue> => ({
    backordered: true,
  });
