import { WORKFLOW_COLLECTIONS } from './names.js';
import type { WorkflowCollectionSchema } from './types.js';
import { defineWorkflowNodes } from './workflow-nodes.js';
import { defineWorkflowNodeRuns } from './workflow-node-runs.js';
import { defineWorkflowRuns } from './workflow-runs.js';
import { defineWorkflowStats } from './workflow-stats.js';
import { defineWorkflowVersionStats } from './workflow-version-stats.js';
import { defineWorkflows } from './workflows.js';

export * from './names.js';
export * from './types.js';
export * from './workflow-nodes.js';
export * from './workflow-node-runs.js';
export * from './workflow-runs.js';
export * from './workflow-stats.js';
export * from './workflow-version-stats.js';
export * from './workflows.js';

// Relations between workflow collections are logical only: no physical foreign
// keys are created. The creation order still follows the reference chain so the
// list reads top-down from owner to dependent collection.
export const workflowCollectionSchemas: readonly WorkflowCollectionSchema[] = [
  { name: WORKFLOW_COLLECTIONS.workflows, define: defineWorkflows },
  { name: WORKFLOW_COLLECTIONS.stats, define: defineWorkflowStats },
  {
    name: WORKFLOW_COLLECTIONS.versionStats,
    define: defineWorkflowVersionStats,
  },
  { name: WORKFLOW_COLLECTIONS.nodes, define: defineWorkflowNodes },
  { name: WORKFLOW_COLLECTIONS.runs, define: defineWorkflowRuns },
  { name: WORKFLOW_COLLECTIONS.nodeRuns, define: defineWorkflowNodeRuns },
];
