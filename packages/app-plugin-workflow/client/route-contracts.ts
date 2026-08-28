export interface WorkflowRouteIds {
  readonly workflowDetail: string;
  readonly workflowList: string;
  readonly workflowRunDetail: string;
  readonly workflowRunList: string;
}

export const WORKFLOW_ROUTE_IDS: WorkflowRouteIds = Object.freeze({
  workflowDetail: '@nocobase/app-plugin-workflow:workflow-detail',
  workflowList: '@nocobase/app-plugin-workflow:workflow-list',
  workflowRunDetail: '@nocobase/app-plugin-workflow:workflow-run-detail',
  workflowRunList: '@nocobase/app-plugin-workflow:workflow-run-list',
});
