import { defineTools, type AgentContext } from '@nocobase/ai-employee';
import { z } from 'zod';
import type { AIMessageRepository } from '../../server/repository/index.js';
import packageMetadata from '@nocobase/app-plugin-ai-employee/package.json' with { type: 'json' };

type SuggestionsContext = AgentContext<{ aiMessages: AIMessageRepository }, {}>;

export default defineTools<SuggestionsContext>({
  scope: 'GENERAL',
  introduction: {
    title: `{{t("Suggestions", { ns: "${packageMetadata.name}" })}}`,
    about: `{{t("Provide a list of suggested prompts for the user to choose from.", { ns: "${packageMetadata.name}" })}}`,
  },
  definition: {
    name: 'suggestions',
    description:
      'Provide a list of suggested prompts for the user to choose from.',
    schema: z.object({
      option: z
        .string()
        .describe('user selected option, ignore this param')
        .optional(),
      options: z
        .array(z.string())
        .describe(
          'A list of suggested prompts that can be presented to the user as selectable options. Each option represents a possible next user message.',
        ),
    }),
  },
  invoke: async (ctx, args, runtime) => {
    const { messageId } = ctx.state;
    if (messageId) {
      const messageRepo = ctx.repositories.aiMessages;
      const message = await messageRepo.findOne({ filter: { id: messageId } });
      const toolCalls = message?.toolCalls || [];
      const index = toolCalls.findIndex(
        (toolCall: { id: string }) => toolCall.id === runtime.toolCallId,
      );
      if (index !== -1) {
        toolCalls[index] = {
          ...toolCalls[index],
          selectedSuggestion: args?.option,
        };
        await messageRepo.update({
          filter: { messageId },
          values: { toolCalls },
        });
      }
    }
    return { status: 'success', content: args?.option };
  },
});
