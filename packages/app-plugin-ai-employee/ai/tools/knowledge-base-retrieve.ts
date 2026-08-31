/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { defineTools, type AgentContext } from '@nocobase/ai-employee';
import type {
  AIConversationRepository,
  AIToolMessageRepository,
} from '../../server/repository/index.js';
import type { AgentKnowledgeBaseService } from '../../server/agent/contracts.js';
import { z } from 'zod';
import packageMetadata from '@nocobase/app-plugin-ai-employee/package.json' with { type: 'json' };

type KnowledgeBaseContext = AgentContext<
  {
    aiToolMessages: AIToolMessageRepository;
    aiConversations: AIConversationRepository;
  },
  { knowledgeBase: AgentKnowledgeBaseService }
>;

export default defineTools<KnowledgeBaseContext>({
  scope: 'SPECIFIED',
  defaultPermission: 'ALLOW',
  introduction: {
    title: `{{t("Knowledge base retrieval", { ns: "${packageMetadata.name}" })}}`,
    about: `{{t("Retrieve relevant content from the knowledge base.", { ns: "${packageMetadata.name}" })}}`,
  },
  definition: {
    name: 'knowledge-base-retrieve',
    description:
      'Search the knowledge base when you need to extract retrieval queries from the conversation, verify data returned by other tools against the knowledge base, or look up information derived from user-uploaded files.',
    schema: z.object({
      query: z
        .string()
        .describe(
          'A concise retrieval query distilled from the conversation, tool outputs, or user-uploaded file content to search the knowledge base.',
        ),
    }),
  },
  async invoke(ctx, { query }, runtime) {
    const toolCallId = runtime?.toolCallId;
    if (!toolCallId) {
      throw new Error('Missing tool call context');
    }

    const aiToolMessage = await ctx.repositories.aiToolMessages.findOne({
      filter: {
        toolCallId,
      },
    });
    if (!aiToolMessage?.sessionId) {
      throw new Error(
        `AI tool message not found for tool call "${toolCallId}"`,
      );
    }

    const aiConversation = await ctx.repositories.aiConversations.findOne({
      filter: {
        sessionId: aiToolMessage.sessionId,
      },
    });
    const username = aiConversation?.aiEmployeeUsername;
    if (!username) {
      throw new Error(
        `AI conversation not found for session "${aiToolMessage.sessionId}"`,
      );
    }

    const content = await ctx.services.knowledgeBase.retrievePrompt({
      username,
      query,
    });
    return {
      status: 'success',
      content,
    };
  },
});
