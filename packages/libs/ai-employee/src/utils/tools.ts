import type { ServiceResolver } from '@nocobase/service-provider';
import type { ToolsEntity } from '../repository/tool.js';
import { tool } from 'langchain';

/** What the tools of one call run with: its agent context, and where their declared dependencies resolve from. */
export interface ToolRuntimeContext {
  readonly agentContext: unknown;
  readonly container?: ServiceResolver;
}

const noWriter = (chunk: unknown): void =>
  console.warn(`No writer in tools runtime, chunk:[${chunk}]`);

/**
 * Binds one tool to the context it will run with. The context is supplied here
 * rather than read from the invocation config, so a tool receives exactly the
 * context and dependencies it was built with and a request cannot substitute
 * another.
 */
export function buildTool<TContext = unknown>(
  toolsEntry: ToolsEntity<TContext>,
  ctx?: TContext,
): ReturnType<typeof tool> {
  const {
    invoke,
    requiresContext = true,
    definition: { name, description, schema },
  } = toolsEntry;
  return tool(
    (input, config) => {
      const { toolCall } = config;
      const writer =
        'writer' in config && typeof config.writer === 'function'
          ? (config.writer as (chunk: unknown) => void)
          : noWriter;
      if (requiresContext && ctx === undefined) {
        throw new Error(`Agent context is required to execute tool "${name}"`);
      }
      return invoke(ctx as TContext, input, {
        toolCallId: toolCall.id,
        writer,
      });
    },
    { name, description, schema, returnDirect: false },
  );
}

/**
 * The context one tool runs with: the call's own context, plus the container
 * dependencies that tool declared. Each tool gets its own, so a tool can reach
 * neither what another tool declared nor anything undeclared.
 */
export function createToolContext(
  entity: ToolsEntity,
  base: unknown,
  container?: ServiceResolver,
): unknown {
  const declared = entity.dependencies ?? {};
  const names = Object.keys(declared);
  if (!base || typeof base !== 'object') {
    if (names.length)
      throw new Error(
        `Tool "${entity.definition.name}" declares dependencies but this agent has no tool context to resolve them into`,
      );
    return base;
  }
  const deps: Record<string, unknown> = {};
  for (const name of names) {
    const token = declared[name];
    if (!container)
      throw new Error(
        `Tool "${entity.definition.name}" declares dependency "${name}" but this agent has no container to resolve it from`,
      );
    try {
      deps[name] = container.resolve(token);
    } catch (error) {
      throw new Error(
        `Tool "${entity.definition.name}" declares dependency "${name}" ("${token.name}") which the application container cannot resolve`,
        { cause: error },
      );
    }
  }
  return { ...base, deps };
}

/**
 * Builds tools the way an agent does: each bound to its own context from
 * {@link createToolContext}. Without a runtime context a tool is built with
 * none, and one that requires a context fails when it is called.
 */
export function buildAgentTools(
  entities: readonly ToolsEntity[],
  runtime?: ToolRuntimeContext,
): ReturnType<typeof tool>[] {
  return entities.map((entity) =>
    buildTool(
      entity,
      runtime
        ? createToolContext(entity, runtime.agentContext, runtime.container)
        : undefined,
    ),
  );
}
