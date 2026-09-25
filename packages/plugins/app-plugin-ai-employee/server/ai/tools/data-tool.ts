import { defineTools, type ToolsOptions } from '@nocobase/ai-employee';
import type { z } from 'zod';
import { ZodError } from 'zod';
import type { DataServices } from '../../service/data-contracts.js';
import { dataServicesFactoryToken } from '../../service/data-services.js';
import { DataAccessError } from '../../service/data-query-policy.js';

const dataToolDependencies = { dataServices: dataServicesFactoryToken };

/**
 * Tools receive only an actor-bound capability, never an unscoped Repository.
 * The declared factory builds that capability for this execution's actor; no
 * tool in this package declares the database itself.
 */
export function defineDataTool<T>(
  name: string,
  title: string,
  description: string,
  schema: z.ZodType<T>,
  invoke: (service: DataServices, input: T) => Promise<unknown>,
): ToolsOptions<typeof dataToolDependencies> {
  return defineTools({
    scope: 'SPECIFIED',
    defaultPermission: 'ALLOW',
    i18n: { namespace: '@nocobase/app-plugin-ai-employee' },
    introduction: { title, about: description },
    definition: { name, description, schema },
    dependencies: dataToolDependencies,
    async invoke(ctx, args) {
      try {
        const input = schema.parse(args);
        const service = ctx.deps.dataServices({
          actor: ctx.actor,
          timezone: ctx.state.timezone,
        });
        const content = await invoke(service, input);
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
