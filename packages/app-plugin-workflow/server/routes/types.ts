import type { AppPluginRoutesContext } from '@nocobase/app-server-kit/plugins';
import type { DatabaseManager } from '@nocobase/app-database';
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
