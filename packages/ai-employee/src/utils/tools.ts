import type { ToolsEntity } from '../repository/tool.js';
import { tool } from 'langchain';

const noWriter = (chunk: any): void =>
  console.warn(`No writer in tools runtime, chunk:[${chunk}]`);

export function buildTool<TContext = unknown>(
  toolsEntry: ToolsEntity<TContext>,
): ReturnType<typeof tool> {
  const {
    invoke,
    definition: { name, description, schema },
  } = toolsEntry;
  return tool(
    (input, config) => {
      const { context, toolCall } = config;
      const writer = (config['writer'] as (chunk: any) => void) ?? noWriter;
      return invoke(context.ctx as TContext, input, {
        toolCallId: toolCall.id,
        writer,
      });
    },
    { name, description, schema, returnDirect: false },
  );
}
