export interface WorkflowRouteIds {
  readonly workflowDetail: string;
  readonly workflowRunDetail: string;
}

export const WORKFLOW_ROUTE_IDS: WorkflowRouteIds = Object.freeze({
  workflowDetail: '@nocobase/app-plugin-workflow:workflow-detail',
  workflowRunDetail: '@nocobase/app-plugin-workflow:workflow-run-detail',
});

export interface WorkflowSettingPaths {
  readonly workflows: string;
  readonly workflowRuns: string;
}

export const WORKFLOW_SETTING_PATHS: WorkflowSettingPaths = Object.freeze({
  workflows: '/settings/automation/workflows',
  workflowRuns: '/settings/automation/workflow-runs',
});
