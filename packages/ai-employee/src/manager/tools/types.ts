import type {
  ToolsEntity,
  ToolsFrom,
  ToolsPermission,
  ToolsRuntime,
  ToolsScope,
} from '../../repository/tool.js';

export interface ToolsManager<
  TContext = unknown,
> extends ToolsRegistration<TContext> {
  getTools(
    toolName: string,
    filter?: ToolsFilter<TContext>,
  ): Promise<ToolsEntity<TContext> | undefined>;
  listTools(filter?: ToolsFilter<TContext>): Promise<ToolsEntity<TContext>[]>;
  isToolsExisted(toolName: string): Promise<boolean>;
  unregisterTools(toolName: string | string[]): Promise<number>;
}

export interface ToolsRegistration<TContext = unknown> {
  registerTools(
    options: ToolsOptions<TContext> | ToolsOptions<TContext>[],
  ): Promise<void>;
  registerDynamicTools(provider: DynamicToolsProvider<TContext>): void;
}

export type ToolsOptions<TContext = unknown> = ToolsEntity<TContext> & {
  scope: Scope;
  from?: From;
  execution?: 'frontend' | 'backend';
  requiresContext?: boolean;
  defaultPermission?: Permission;
  silence?: boolean;
  introduction?: { title: string; about?: string };
  definition: { name: string; description: string; schema?: any };
  invoke: (ctx: TContext, args: any, runtime: ToolsRuntime) => Promise<any>;
};

export type Scope = ToolsScope;
export type Permission = ToolsPermission;
export type From = ToolsFrom;
export type { ToolsRuntime };
export type DynamicToolsProvider<TContext = unknown> = (
  register: ToolsRegistration<TContext>,
  filter?: ToolsFilter<TContext>,
) => Promise<void>;

export type ToolsFilter<TContext = unknown> = {
  scope?: Scope;
  defaultPermission?: Permission;
  silence?: boolean;
  sessionId?: string;
  ctx?: TContext;
};
