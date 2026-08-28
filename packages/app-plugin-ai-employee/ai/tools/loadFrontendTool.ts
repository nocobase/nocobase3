import { defineTools, type AgentContext } from '@nocobase/ai-employee';
import { z } from 'zod';
import {
  LOAD_FRONTEND_TOOL_NAME,
  isFrontendToolManifest,
  isFrontendToolInvokeResult,
} from '../../server/ai-employees/common/frontend-tools.js';
import type { AgentFrontendToolService } from '../../server/agent/contracts.js';
// @ts-ignore
import pkg from '../package.json';

type FrontendToolContext = AgentContext<
  {},
  { frontendTools: AgentFrontendToolService }
>;

export default defineTools<FrontendToolContext>({
  scope: 'GENERAL',
  execution: 'frontend',
  defaultPermission: 'ALLOW',
  introduction: {
    title: `{{t("Load frontend tool", { ns: "${pkg.name}" })}}`,
    about: `{{t("Load the input schema of a frontend tool provided by the selected block.", { ns: "${pkg.name}" })}}`,
  },
  definition: {
    name: LOAD_FRONTEND_TOOL_NAME,
    description:
      'Load the complete input schema for one frontend tool. This is not a tool discovery API: only call it with an exact tool id copied from the current frontendToolCatalog, and never invent an id such as "current-workspace". After loading a suitable tool, call executeFrontendTool with arguments that match the returned schema.',
    schema: z.object({
      toolId: z
        .string()
        .describe('The exact tool id from the current frontendToolCatalog.'),
    }),
  },
  invoke: async (ctx, args, runtime) => {
    const tool = await ctx.services.frontendTools.find(args.toolId);
    if (!tool)
      return {
        status: 'error',
        content: {
          message: 'Frontend tool is unavailable in the current conversation.',
        },
      };
    const result = ctx.services.frontendTools.readResult(runtime.toolCallId);
    if (!result?.provided)
      return {
        status: 'error',
        content: 'Frontend tool manifest was not returned.',
      };
    if (isFrontendToolInvokeResult(result.value)) return result.value;
    if (
      !isFrontendToolManifest(result.value) ||
      result.value.id !== args.toolId
    ) {
      return {
        status: 'error',
        content: 'Frontend tool returned an invalid manifest.',
      };
    }
    return {
      status: 'success',
      content: {
        id: result.value.id,
        name: result.value.name,
        title: result.value.title,
        description: result.value.description,
        inputSchema: result.value.inputSchema,
      },
    };
  },
});
