import type { Context } from '../app/context.js';

export type ToolsScope = 'SPECIFIED' | 'GENERAL' | 'CUSTOM';
export type ToolsPermission = 'ASK' | 'ALLOW';
export type ToolsFrom = 'loader' | 'workflow' | 'mcp';

export type ToolsRuntime = {
  toolCallId: string;
  writer: (chunk: any) => void;
};

export type ToolsEntity = {
  scope: ToolsScope;
  from?: ToolsFrom;
  execution?: 'frontend' | 'backend';
  defaultPermission?: ToolsPermission;
  silence?: boolean;
  introduction?: { title: string; about?: string };
  definition: { name: string; description: string; schema?: any };
  invoke: (ctx: Context, args: any, runtime: ToolsRuntime) => Promise<any>;
};

export type ToolsQuery = {
  scope?: ToolsScope;
  defaultPermission?: ToolsPermission;
  silence?: boolean;
  sessionId?: string;
  ctx?: Context;
};

export interface ToolsRepository {
  createTools(input: { value: ToolsEntity }): Promise<ToolsEntity>;
  updateTools(input: {
    name: string;
    value: Partial<ToolsEntity>;
  }): Promise<ToolsEntity | undefined>;
  deleteTools(name: string): Promise<void>;
  getTools(name: string): Promise<ToolsEntity | undefined>;
  listTools(query?: ToolsQuery): Promise<ToolsEntity[]>;
  createOrUpdateTools(input: {
    value: ToolsEntity;
  }): Promise<{ value: ToolsEntity; replaced: boolean }>;
}
