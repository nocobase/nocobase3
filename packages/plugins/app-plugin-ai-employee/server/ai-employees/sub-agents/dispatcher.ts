/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { Context } from '../../context.js';
import type { AIEmployeeEntity } from '@nocobase/ai-employee';
import type { AIMessageEntity } from '../../repository/index.js';
import { ModelRef } from '../ai-employee.js';
import { createAIEmployeeAgentService } from '../../agent/ai-employee/index.js';
import { createAgentContext } from '../../agent/context.js';
import type {
  SubAgentConversationMetadata,
  AIMessageInput,
} from '@nocobase/ai-employee';

export type SubAgentTask = {
  sessionId: string;
  employee: AIEmployeeEntity;
  model: ModelRef;
  question: string;
  skillSettings?: Record<string, any>;
  webSearch?: boolean;
  messages?: AIMessageInput[];
  writer?: (chunk: any) => void;
};

export class SubAgentsDispatcher {
  constructor(private readonly ctx: Context) {}
  private extractTextContent(content: unknown): string {
    if (typeof content === 'string') {
      return content;
    }

    if (Array.isArray(content)) {
      return content
        .map((block) => {
          if (typeof block === 'string') {
            return block;
          }
          if (
            block &&
            typeof block === 'object' &&
            'type' in block &&
            (block as any).type === 'text'
          ) {
            return typeof (block as any).text === 'string'
              ? (block as any).text
              : '';
          }
          return '';
        })
        .join('');
    }

    if (content && typeof content === 'object' && 'content' in content) {
      return this.extractTextContent((content as any).content);
    }

    return '';
  }

  private extractLastMessageText(result: any): string {
    const messages = result?.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      return '';
    }

    return this.extractTextContent(messages.at(-1)?.content);
  }

  private async resolveSubAgentSessionId(
    ctx: Context,
    sessionId: string,
  ): Promise<string | null> {
    if (!sessionId) {
      return null;
    }

    const aiToolMessage = await ctx.repositories.aiToolMessages.findOne({
      filter: {
        sessionId,
        toolName: 'dispatch-sub-agent-task',
        invokeStatus: {
          $ne: 'confirmed',
        },
      },
      sort: ['-id'],
    });
    if (!aiToolMessage?.messageId) {
      return null;
    }

    const aiMessage = await ctx.repositories.aiMessages.findOne({
      filter: {
        sessionId,
        messageId: String(aiToolMessage.messageId),
      },
    });
    const subAgentConversations = aiMessage?.metadata?.subAgentConversations as
      SubAgentConversationMetadata[] | undefined;
    if (
      !Array.isArray(subAgentConversations) ||
      !subAgentConversations.length
    ) {
      return null;
    }

    return subAgentConversations.at(-1)?.sessionId ?? null;
  }

  private async resolveLastMessage(
    ctx: Context,
    sessionId: string,
  ): Promise<AIMessageEntity | null> {
    const subSessionId = await this.resolveSubAgentSessionId(ctx, sessionId);
    if (!subSessionId) {
      return null;
    }

    return ctx.repositories.aiMessages.findOne({
      filter: {
        sessionId: subSessionId,
      },
      sort: ['-messageId'],
    });
  }

  async run(task: SubAgentTask): Promise<string> {
    const {
      sessionId,
      employee,
      model,
      question,
      skillSettings,
      webSearch,
      messages,
      writer,
    } = task;
    const ctx = this.ctx;
    const userId = ctx.auth?.user?.id;
    if (!userId) {
      throw new Error('User not authenticated');
    }

    const resolvedModel = await ctx.aiEmployeesManager.resolveModel(
      employee,
      model,
    );

    const agent = await createAIEmployeeAgentService({
      ctx,
      employee,
      sessionId,
      skillSettings,
      webSearch,
      model: resolvedModel,
      from: 'sub-agent',
    });
    const lastMessage = await ctx.repositories.aiMessages.findOne({
      filter: {
        sessionId,
      },
      sort: ['-messageId'],
    });
    const decisions = lastMessage
      ? await ctx.aiConversationsManager.getUserDecisions(lastMessage.messageId)
      : null;
    let context;
    if (
      messages &&
      decisions?.decisions?.some(
        (decision: { type: 'approve' | 'edit' | 'reject' }) =>
          decision.type === 'reject',
      )
    ) {
      context = {
        appendMessage: await agent.facade.getFormatMessages(messages),
      };
    }

    const agentContext = createAgentContext(ctx, {
      state: {
        sessionId,
        model: resolvedModel,
        webSearch,
        messages,
      },
    });
    const result = await agent.service.invoke(
      {
        userDecisions: decisions,
        userMessages: decisions
          ? undefined
          : [
              {
                role: 'user',
                content: {
                  type: 'text',
                  content: question,
                },
              },
            ],
        writer,
        context,
      },
      agentContext,
    );

    writer?.({
      action: 'afterSubAgentInvoke',
      body: {},
      currentConversation: {
        sessionId,
        username: employee.username,
        from: 'sub-agent',
      },
    });

    return this.extractLastMessageText(result);
  }

  async isInterrupted(sessionId: string, ctx: Context): Promise<boolean> {
    if (!sessionId) {
      return false;
    }

    const aiToolMessage = await ctx.repositories.aiToolMessages.findOne({
      filter: {
        sessionId,
        toolName: 'dispatch-sub-agent-task',
        invokeStatus: 'pending',
      },
      sort: ['-id'],
    });

    return Boolean(aiToolMessage);
  }

  async reject(sessionId: string, ctx: Context) {
    const userId = ctx.auth?.user?.id;
    if (!userId) {
      throw new Error('User not authenticated');
    }
    const conversation = await ctx.repositories.aiConversations.findOne({
      filter: {
        sessionId,
        userId,
      },
    });
    if (!conversation) {
      return;
    }
    const lastMessage = await this.resolveLastMessage(ctx, sessionId);
    if (!sessionId || !lastMessage) {
      return;
    }
    const userDecision = {
      type: 'reject' as const,
      message: `The user ignored the tools usage and send new messages`,
    };
    const updated = await ctx.repositories.aiToolMessages.update({
      values: { userDecision, invokeStatus: 'waiting' },
      filter: {
        sessionId: lastMessage.sessionId,
        messageId: lastMessage.messageId,
        invokeStatus: 'interrupted',
      },
    });
    if (updated > 0) {
      return await ctx.aiConversationsManager.getUserDecisions(
        lastMessage.messageId,
      );
    }
    return null;
  }
}
