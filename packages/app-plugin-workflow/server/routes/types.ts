import type { AppPluginRoutesContext } from '@nocobase/app-server/plugins';
import type { DatabaseManager } from '@nocobase/database';
import type { MiddlewareHandler } from 'hono';

export interface WorkflowPluginRouteDeps {
  auth: { required(): MiddlewareHandler };
  runtime: object & { database?: DatabaseManager };
}

export interface WorkflowPluginRouteServices {
  plugins: Record<string, unknown>;
}

export type WorkflowPluginRoutesContext = AppPluginRoutesContext<
  WorkflowPluginRouteDeps,
  WorkflowPluginRouteServices
>;
