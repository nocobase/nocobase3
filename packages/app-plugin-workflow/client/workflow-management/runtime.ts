import { createAppClient, type AppClient } from '@nocobase/app-sdk';

let workflowClient: AppClient | undefined;

export function configureWorkflowClient(appClient: AppClient): AppClient {
  workflowClient = appClient;
  return appClient;
}

export function getWorkflowClient(): AppClient {
  workflowClient ??= createAppClient();
  return workflowClient;
}
