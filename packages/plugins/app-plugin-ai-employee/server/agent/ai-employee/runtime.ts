import type { ModelRef } from '../../types.js';
import type { AppAgentContext } from '../context.js';
import type { ConversationExecution } from '../contracts.js';
import type { Caching } from '@nocobase/caching';
import type { IdGeneratorService } from '@nocobase/snowflake';
import type { FileStorage } from '@nocobase/ai-employee';
import type { AIFileEntity } from '../../repository/ai-file.js';
import type { AIFileMetadataCreateContext } from '../../repository/file-storage/ai-file-metadata-repository.js';
import type { RepositoryFactory } from '../../factory/repository-factory.js';
import type { AIEmployeesManager } from '../../manager/ai-employees-manager.js';
import type { BuiltInManager } from '../../manager/built-in-manager.js';
import type { KnowledgeBaseManager } from '../../manager/knowledge-base-manager.js';
import type { LLMStreamCachedManager } from '../../manager/llm-stream-cached-manager.js';
import type { WorkContextHandler } from '../../manager/work-context/index.js';
import type { DocumentLoaders } from '@nocobase/ai-employee';
/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { AIToolMessageEntity } from '../../repository/index.js';
import type { DatabaseConnection } from '@nocobase/db';

export interface AIEmployeeAgentRuntimeOptions {
  agentContext: AppAgentContext;
  database: DatabaseConnection;
  caching: Caching;
  fileStorage: FileStorage<AIFileEntity, AIFileMetadataCreateContext>;
  snowflake: IdGeneratorService;
  execution?: ConversationExecution;
  getHeader?: (name: string) => string | undefined;
  repositories: RepositoryFactory;
  aiEmployeesManager: AIEmployeesManager;
  builtInManager: BuiltInManager;
  llmStreamCachedManager: LLMStreamCachedManager;
  knowledgeBaseManager: KnowledgeBaseManager;
  workContextHandler: WorkContextHandler;
  documentLoaders: DocumentLoaders;
  employee: any;
  sessionId: string;
  systemMessage?: string;
  skillSettings?: Record<string, any>;
  webSearch?: boolean;
  model?: ModelRef;
  legacy?: boolean;
  from?: 'main-agent' | 'sub-agent';
  tools?: { name: string }[];
}

export class AIEmployeeCapabilities {
  sessionId: string;

  private agentContext: AppAgentContext;
  private database: DatabaseConnection;
  private snowflake: IdGeneratorService;
  private repositories: RepositoryFactory;
  private model?: ModelRef;

  constructor({
    agentContext,
    database,
    snowflake,
    repositories,
    sessionId,
    model,
  }: AIEmployeeAgentRuntimeOptions) {
    this.agentContext = agentContext;
    this.database = database;
    this.snowflake = snowflake;
    this.repositories = repositories;
    this.sessionId = sessionId;
    this.model = model;
  }

  private getRequiredModel(): ModelRef {
    if (!this.model) {
      throw new Error('AI employee model is required');
    }
    return this.model;
  }

  // Agent execution and middleware orchestration are owned by AgentService.

  async updateToolCallInterrupted(
    sessionId: string,
    messageId: string,
    toolCallId: string,
    interruptId: string,
    interruptAction: {
      order: number;
      description?: string;
      allowed_decisions?: string[];
    },
  ) {
    return await this.database.transaction(async (transaction) => {
      const updated = await this.aiToolMessagesRepo.update(
        {
          values: {
            invokeStatus: 'interrupted',
            interruptActionOrder: interruptAction.order,
            interruptAction,
          },
          filter: { sessionId, messageId, toolCallId, invokeStatus: 'init' },
        },
        { connection: transaction },
      );

      if (!updated) {
        return updated;
      }

      const message = await this.aiMessagesRepo.findOne(
        {
          filter: {
            messageId,
            sessionId,
          },
        },
        { connection: transaction },
      );

      if (!message) {
        return updated;
      }

      await this.aiMessagesRepo.update(
        {
          values: { metadata: { ...(message.metadata ?? {}), interruptId } },
          filter: { messageId, sessionId },
        },
        { connection: transaction },
      );

      return updated;
    });
  }

  async updateToolCallPending(messageId: string, toolCallId: string) {
    const updated = await this.aiToolMessagesRepo.update({
      values: { invokeStatus: 'pending', invokeStartTime: new Date() },
      filter: {
        sessionId: this.sessionId,
        messageId,
        toolCallId,
        invokeStatus: {
          $in: ['init', 'waiting'],
        },
      },
    });
    return updated;
  }

  async updateToolCallDone(messageId: string, toolCallId: string, result: any) {
    const updated = await this.aiToolMessagesRepo.update({
      values: {
        invokeStatus: 'done',
        invokeEndTime: new Date(),
        status: result?.status ?? 'success',
        content: result?.content ?? result,
      },
      filter: {
        sessionId: this.sessionId,
        messageId,
        toolCallId,
        invokeStatus: 'pending',
      },
    });
    return updated;
  }

  async confirmToolCall(
    transaction: DatabaseConnection,
    messageId: string,
    toolCallIds: string[],
  ) {
    const updated = await this.aiToolMessagesRepo.update(
      {
        values: { invokeStatus: 'confirmed' },
        filter: {
          sessionId: this.sessionId,
          messageId,
          toolCallId: {
            $in: toolCallIds,
          },
        },
      },
      { connection: transaction },
    );
    return updated;
  }

  async getToolCallResult(
    messageId: string,
    toolCallId: string,
  ): Promise<AIToolMessageEntity | null> {
    return await this.aiToolMessagesRepo.findOne({
      filter: { messageId, toolCallId },
    });
  }

  async getToolCallResultMap(
    messageId: string,
    toolCallIds: string[],
  ): Promise<Map<string, AIToolMessageEntity>> {
    const list: AIToolMessageEntity[] = await this.aiToolMessagesRepo.find({
      filter: {
        messageId,
        toolCallId: {
          $in: toolCallIds,
        },
      },
    });
    const result = new Map<string, AIToolMessageEntity>();
    for (const item of list) {
      if (item.toolCallId) {
        result.set(item.toolCallId, item);
      }
    }
    return result;
  }

  async cancelToolCall(
    reason = 'The user ignored the application for tools usage and will continued to ask questions',
  ) {
    let messageId;
    const historyMessages = await this.repositories.aiMessages.find({
      sort: ['-messageId'],
    });
    const [lastMessage] = historyMessages;
    if (lastMessage?.toolCalls?.length ?? 0 > 0) {
      messageId = lastMessage.messageId;
    } else {
      return;
    }
    const toolMessages: AIToolMessageEntity[] =
      await this.aiToolMessagesRepo.find({
        filter: {
          messageId,
          invokeStatus: {
            $ne: 'confirmed',
          },
        },
      });
    if (!toolMessages?.length) {
      return;
    }

    const { model, service } =
      await this.agentContext.ai.llmProviderManager.getLLMService(
        this.getRequiredModel(),
      );
    const toolCallMap = await this.getToolCallMap(messageId);
    const now = new Date();
    const toolMessageContent = reason;
    return await this.database.transaction(async (transaction) => {
      for (const toolMessage of toolMessages) {
        await this.aiToolMessagesRepo.update(
          {
            values: {
              invokeStatus: 'confirmed',
              status: 'success',
              content: toolMessageContent,
              invokeStartTime: toolMessage.invokeStartTime ?? now,
              invokeEndTime: toolMessage.invokeEndTime ?? now,
            },
            filter: {
              id: toolMessage.id,
              invokeStatus: toolMessage.invokeStatus,
            },
          },
          { connection: transaction },
        );
      }
      return await this.repositories.aiMessages.create(
        {
          values: toolMessages.map((toolMessage) => ({
            messageId: String(this.snowflake.generate()),
            role: 'tool',
            content: {
              type: 'text',
              content: toolMessageContent,
            },
            metadata: {
              model,
              provider: service.provider,
              toolCall: toolMessage.toolCallId
                ? toolCallMap.get(toolMessage.toolCallId)
                : undefined,
              toolCallId: toolMessage.toolCallId,
              sourceMessageId: messageId,
              autoCall: toolMessage.auto,
            },
          })),
        },
        { connection: transaction },
      );
    });
  }

  get logger() {
    return this.agentContext.logger;
  }

  // === Conversation/thread helpers ===
  async updateThread(
    transaction: DatabaseConnection,
    { sessionId, thread }: { sessionId: string; thread: number },
  ) {
    await this.aiConversationsRepo.update(
      {
        values: { thread },
        filter: {
          sessionId,
          thread: {
            $lt: thread,
          },
        },
      },
      { connection: transaction },
    );
  }

  private async getToolCallMap(messageId: string): Promise<
    Map<
      string,
      {
        id: string;
        args: unknown;
        name: string;
        type: string;
      }
    >
  > {
    const result = new Map();
    const message = await this.aiMessagesRepo.findOne({
      filter: { messageId },
    });
    const toolCalls = message?.toolCalls;
    if (!toolCalls) {
      return result;
    }
    for (const toolCall of toolCalls) {
      result.set(toolCall.id, toolCall);
    }
    return result;
  }

  private get aiConversationsRepo() {
    return this.repositories.aiConversations;
  }

  private get aiMessagesRepo() {
    return this.repositories.aiMessages;
  }

  private get aiToolMessagesRepo() {
    return this.repositories.aiToolMessages;
  }
}
