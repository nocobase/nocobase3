export type ToolsScope = 'SPECIFIED' | 'GENERAL' | 'CUSTOM';
export type ToolsPermission = 'ASK' | 'ALLOW';
export type ToolsFrom = 'loader' | 'workflow' | 'mcp';

export type ToolsRuntime = {
  toolCallId: string;
  writer: (chunk: any) => void;
};

export type ToolsEntity<TContext = unknown> = {
  scope: ToolsScope;
  from?: ToolsFrom;
  execution?: 'frontend' | 'backend';
  defaultPermission?: ToolsPermission;
  silence?: boolean;
  introduction?: { title: string; about?: string };
  definition: { name: string; description: string; schema?: any };
  invoke: (ctx: TContext, args: any, runtime: ToolsRuntime) => Promise<any>;
};

export type ToolsQuery<TContext = unknown> = {
  scope?: ToolsScope;
  defaultPermission?: ToolsPermission;
  silence?: boolean;
  sessionId?: string;
  ctx?: TContext;
};

export interface ToolsRepository<TContext = unknown> {
  createTools(input: {
    value: ToolsEntity<TContext>;
  }): Promise<ToolsEntity<TContext>>;
  updateTools(input: {
    name: string;
    value: Partial<ToolsEntity<TContext>>;
  }): Promise<ToolsEntity<TContext> | undefined>;
  deleteTools(name: string): Promise<void>;
  getTools(name: string): Promise<ToolsEntity<TContext> | undefined>;
  listTools(query?: ToolsQuery<TContext>): Promise<ToolsEntity<TContext>[]>;
  createOrUpdateTools(input: {
    value: ToolsEntity<TContext>;
  }): Promise<{ value: ToolsEntity<TContext>; replaced: boolean }>;
}
