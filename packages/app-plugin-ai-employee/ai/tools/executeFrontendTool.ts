import { defineTools, type AgentContext } from '@nocobase/ai-employee';
import { z } from 'zod';
import {
  EXECUTE_FRONTEND_TOOL_NAME,
  isFrontendToolInvokeResult,
} from '../../server/ai-employees/common/frontend-tools.js';
import type { AgentFrontendToolService } from '../../server/agent/contracts.js';
import { AI_EMPLOYEE_I18N_NAMESPACE } from '../../namespace.js';

type FrontendToolContext = AgentContext<
  {},
  { frontendTools: AgentFrontendToolService }
>;

export default defineTools<FrontendToolContext>({
  scope: 'GENERAL',
  execution: 'frontend',
  defaultPermission: 'ALLOW',
  introduction: {
    title: `{{t("Execute frontend tool", { ns: "${AI_EMPLOYEE_I18N_NAMESPACE}" })}}`,
    about: `{{t("Execute a frontend tool provided by the selected block.", { ns: "${AI_EMPLOYEE_I18N_NAMESPACE}" })}}`,
  },
  definition: {
    name: EXECUTE_FRONTEND_TOOL_NAME,
    description:
      'Execute a frontend tool from the current frontendToolCatalog. Use loadFrontendTool first when you need its input schema. Never use a tool id that is not present in the current catalog.',
    schema: z.object({
      toolId: z
        .string()
        .describe('The exact tool id from the current frontendToolCatalog.'),
      args: z
        .record(z.string(), z.unknown())
        .default({})
        .describe('Arguments that match the loaded frontend tool schema.'),
    }),
  },
  invoke: async (ctx, args, runtime) => {
    const tool = await ctx.services.frontendTools.find(args.toolId);
    if (!tool)
      return {
        status: 'error',
        content: 'Frontend tool is unavailable in the current conversation.',
      };
    const result = ctx.services.frontendTools.readResult(runtime.toolCallId);
    if (!result?.provided)
      return {
        status: 'error',
        content: 'Frontend tool did not return a result.',
      };
    if (isFrontendToolInvokeResult(result.value)) return result.value;
    return { status: 'success', content: result.value };
  },
});
