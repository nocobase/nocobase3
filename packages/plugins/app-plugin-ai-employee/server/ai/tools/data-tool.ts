import {
  defineTools,
  type AgentContext,
  type ToolsOptions,
} from '@nocobase/ai-employee';
import type { z } from 'zod';
import { ZodError } from 'zod';
import type { DataServices } from '../../service/data-contracts.js';
import { DataAccessError } from '../../service/data-query-policy.js';

type DataToolContext = AgentContext<object, { data: DataServices }>;

/** Tools receive only an actor-bound capability, never an unscoped Repository. */
export function defineDataTool<T>(
  name: string,
  title: string,
  description: string,
  schema: z.ZodType<T>,
  invoke: (service: DataServices, input: T) => Promise<unknown>,
): ToolsOptions<DataToolContext> {
  return defineTools<DataToolContext>({
    scope: 'SPECIFIED',
    defaultPermission: 'ALLOW',
    i18n: { namespace: '@nocobase/app-plugin-ai-employee' },
    introduction: { title, about: description },
    definition: { name, description, schema },
    async invoke(ctx, args) {
      try {
        const input = schema.parse(args);
        const content = await invoke(ctx.services.data, input);
        return { status: 'success', content };
      } catch (error) {
        // Driver errors can contain SQL or connection details. Never expose them to a model.
        return {
          status: 'error',
          content: {
            message:
              error instanceof ZodError
                ? 'Invalid data tool arguments. Follow the tool schema and supported bounds.'
                : error instanceof DataAccessError
                  ? error.message
                  : 'Data operation failed. No result is available.',
          },
        };
      }
    },
  });
}
