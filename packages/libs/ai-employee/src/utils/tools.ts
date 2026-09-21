import type { ToolsEntity } from '../repository/tool.js';
import { tool } from 'langchain';

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
