import type {
  ResolvedDeps,
  ToolsDependencies,
  ToolsEntity,
  ToolsFrom,
  ToolsPermission,
  ToolsRuntime,
  ToolsScope,
} from '../../repository/tool.js';
import type { AgentContext } from '../../types/agent-context.js';

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
  /**
   * Accepts a declaration with any dependency map. Each tool keeps its own
   * token types where it is written; the registry stores them erased.
   */
  registerTools(
    options: ToolsOptions<any> | ToolsOptions<any>[],
  ): Promise<void>;
  registerDynamicTools(provider: DynamicToolsProvider<TContext>): void;
}

/**
 * What a tool is written as. `dependencies` names container tokens, and the
 * context the tool is invoked with carries exactly those, resolved, on `deps`.
 */
export type ToolsOptions<
  TTokens extends ToolsDependencies = Record<string, never>,
> = {
  scope: Scope;
  from?: From;
  execution?: 'frontend' | 'backend';
  requiresContext?: boolean;
  defaultPermission?: Permission;
  silence?: boolean;
  /** UI translation metadata; model-facing descriptions remain unchanged. */
  i18n?: { namespace: string };
  introduction?: { title: string; about?: string };
  definition: { name: string; description: string; schema?: any };
  dependencies?: TTokens;
  invoke: (
    ctx: AgentContext<ResolvedDeps<TTokens>>,
    args: any,
    runtime: ToolsRuntime,
  ) => Promise<any>;
};

export type Scope = ToolsScope;
export type Permission = ToolsPermission;
export type From = ToolsFrom;
export type { ToolsRuntime, ToolsDependencies, ResolvedDeps };
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
