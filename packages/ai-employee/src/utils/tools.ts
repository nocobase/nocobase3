import type { ToolsEntity } from '../repository/tool.js';
import { tool } from 'langchain';

const noWriter = (chunk: unknown): void =>
  console.warn(`No writer in tools runtime, chunk:[${chunk}]`);

export function buildTool<TContext = unknown>(
  toolsEntry: ToolsEntity<TContext>,
): ReturnType<typeof tool> {
  const {
    invoke,
    requiresContext = true,
    definition: { name, description, schema },
  } = toolsEntry;
  return tool(
    (input, config) => {
      const { context, toolCall } = config;
      const writer =
        'writer' in config && typeof config.writer === 'function'
          ? (config.writer as (chunk: unknown) => void)
          : noWriter;
      if (requiresContext && !context?.agentContext) {
        throw new Error(`Agent context is required to execute tool "${name}"`);
      }
      return invoke(context?.agentContext as TContext, input, {
        toolCallId: toolCall.id,
        writer,
      });
    },
    { name, description, schema, returnDirect: false },
  );
}
