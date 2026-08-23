import type { AppExtension } from '@nocobase/portal-sdk/extensions';
import { workflowManagementRoutes } from './routes';

const workflowManagementExtension: AppExtension = { id: 'nocobase-workflow-management', priority: 0, routes: workflowManagementRoutes };
export default workflowManagementExtension;
