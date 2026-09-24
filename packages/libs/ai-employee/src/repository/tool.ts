import type { ServiceToken } from '@nocobase/service-provider';

export type ToolsScope = 'SPECIFIED' | 'GENERAL' | 'CUSTOM';
export type ToolsPermission = 'ASK' | 'ALLOW';
export type ToolsFrom = 'loader' | 'workflow' | 'mcp';

export type ToolsRuntime = {
  toolCallId: string;
  writer: (chunk: any) => void;
};

/**
 * What a tool declares it needs, as tokens of the application's own container.
 * Nothing new registers them: a tool names a token the App already binds, and
 * the resolved value arrives on `AgentContext.deps` when the tool runs.
 */
export type ToolsDependencies = Record<string, ServiceToken<any>>;

export type ResolvedService<TToken> =
  TToken extends ServiceToken<infer TService> ? TService : never;

export type ResolvedDeps<TTokens extends ToolsDependencies> = {
  [K in keyof TTokens]: ResolvedService<TTokens[K]>;
};

export type ToolsEntity<TContext = unknown> = {
  scope: ToolsScope;
  from?: ToolsFrom;
  execution?: 'frontend' | 'backend';
  requiresContext?: boolean;
  /** Effective auto-call policy resolved for the current agent execution. */
  auto?: boolean;
  /** Default policy supplied by the registered tool definition. */
  defaultPermission?: ToolsPermission;
  silence?: boolean;
  /** UI translation metadata; model-facing descriptions remain unchanged. */
  i18n?: { namespace: string };
  introduction?: { title: string; about?: string };
  definition: { name: string; description: string; schema?: any };
  /** Container tokens this tool declared. Resolved per execution into `ctx.deps`. */
  dependencies?: ToolsDependencies;
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
