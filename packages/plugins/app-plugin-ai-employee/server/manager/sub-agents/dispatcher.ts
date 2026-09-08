/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { AIManager, FileStorage } from '@nocobase/ai-employee';
import type { Caching } from '@nocobase/caching';
import type { DatabaseConnection, DatabaseManager } from '@nocobase/db';
import type { Logger } from '@nocobase/logging';
import type { IdGeneratorService } from '@nocobase/snowflake';
import type { Actor, Translate } from '../../types.js';
import type { ConversationExecution } from '../../agent/contracts.js';
import type { AIFileEntity } from '../../repository/ai-file.js';
import type { AIFileMetadataCreateContext } from '../../repository/file-storage/ai-file-metadata-repository.js';
import type { RepositoryFactory } from '../../factory/repository-factory.js';
import type { DocumentLoaders } from '@nocobase/ai-employee';
import type { AIEmployeesManager } from '../ai-employees-manager.js';
import type { AIConversationsManager } from '../ai-conversations-manager.js';
import type { BuiltInManager } from '../built-in-manager.js';
import type { KnowledgeBaseManager } from '../knowledge-base-manager.js';
import type { LLMStreamCachedManager } from '../llm-stream-cached-manager.js';
import type { WorkContextHandler } from '../work-context/index.js';
import type { AIEmployeeEntity } from '@nocobase/ai-employee';
import type { AIMessageEntity } from '../../repository/index.js';
import type { ModelRef } from '../../types.js';
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

export interface SubAgentExecutionOptions {
  readonly actor: Actor;
  readonly execution?: ConversationExecution;
  readonly translate?: Translate;
  readonly getHeader?: (name: string) => string | undefined;
}

export class SubAgentsDispatcher {
  private readonly ai: AIManager;
  private readonly database: DatabaseConnection;
  private readonly databaseManager: DatabaseManager;
  private readonly logger: Logger;
  private readonly caching: Caching;
  private readonly fileStorage: FileStorage<
    AIFileEntity,
    AIFileMetadataCreateContext
  >;
  private readonly snowflake: IdGeneratorService;
  private readonly repositories: RepositoryFactory;
  private readonly aiEmployeesManager: AIEmployeesManager;
  private readonly aiConversationsManager: AIConversationsManager;
  private readonly builtInManager: BuiltInManager;
  private readonly llmStreamCachedManager: LLMStreamCachedManager;
  private readonly knowledgeBaseManager: KnowledgeBaseManager;
  private readonly workContextHandler: WorkContextHandler;
  private readonly documentLoaders: DocumentLoaders;

  public constructor({
    ai,
    database,
    databaseManager,
    logger,
    caching,
    fileStorage,
    snowflake,
    repositories,
    aiEmployeesManager,
    aiConversationsManager,
    builtInManager,
    llmStreamCachedManager,
    knowledgeBaseManager,
    workContextHandler,
    documentLoaders,
  }: {
    ai: AIManager;
    database: DatabaseConnection;
    databaseManager: DatabaseManager;
    logger: Logger;
    caching: Caching;
    fileStorage: FileStorage<AIFileEntity, AIFileMetadataCreateContext>;
    snowflake: IdGeneratorService;
    repositories: RepositoryFactory;
    aiEmployeesManager: AIEmployeesManager;
    aiConversationsManager: AIConversationsManager;
    builtInManager: BuiltInManager;
    llmStreamCachedManager: LLMStreamCachedManager;
    knowledgeBaseManager: KnowledgeBaseManager;
    workContextHandler: WorkContextHandler;
    documentLoaders: DocumentLoaders;
  }) {
    this.ai = ai;
    this.database = database;
    this.databaseManager = databaseManager;
    this.logger = logger;
    this.caching = caching;
    this.fileStorage = fileStorage;
    this.snowflake = snowflake;
    this.repositories = repositories;
    this.aiEmployeesManager = aiEmployeesManager;
    this.aiConversationsManager = aiConversationsManager;
    this.builtInManager = builtInManager;
    this.llmStreamCachedManager = llmStreamCachedManager;
    this.knowledgeBaseManager = knowledgeBaseManager;
    this.workContextHandler = workContextHandler;
    this.documentLoaders = documentLoaders;
  }
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
    sessionId: string,
  ): Promise<string | null> {
    if (!sessionId) {
      return null;
    }

    const aiToolMessage = await this.repositories.aiToolMessages.findOne({
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

    const aiMessage = await this.repositories.aiMessages.findOne({
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
    sessionId: string,
  ): Promise<AIMessageEntity | null> {
    const subSessionId = await this.resolveSubAgentSessionId(sessionId);
    if (!subSessionId) {
      return null;
    }

    return this.repositories.aiMessages.findOne({
      filter: {
        sessionId: subSessionId,
      },
      sort: ['-messageId'],
    });
  }

  async run(
    task: SubAgentTask,
    options: SubAgentExecutionOptions,
  ): Promise<string> {
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
    const userId = options.actor.id;
    if (!userId) {
      throw new Error('User not authenticated');
    }

    const resolvedModel = await this.aiEmployeesManager.resolveModel(
      employee,
      model,
    );

    const agentContext = createAgentContext({
      actor: options.actor,
      execution: options.execution,
      state: {
        sessionId,
        model: { ...resolvedModel },
        webSearch,
        messages,
      },
      ai: this.ai,
      database: this.databaseManager,
      logger: this.logger,
      repositories: this.repositories,
      aiEmployeesManager: this.aiEmployeesManager,
      aiConversationsManager: this.aiConversationsManager,
      builtInManager: this.builtInManager,
      knowledgeBaseManager: this.knowledgeBaseManager,
      subAgentsDispatcher: this,
      translate: options.translate,
      getHeader: options.getHeader,
    });

    const agent = await createAIEmployeeAgentService({
      agentContext,
      database: this.database,
      caching: this.caching,
      fileStorage: this.fileStorage,
      snowflake: this.snowflake,
      execution: options.execution,
      getHeader: options.getHeader,
      repositories: this.repositories,
      aiEmployeesManager: this.aiEmployeesManager,
      builtInManager: this.builtInManager,
      llmStreamCachedManager: this.llmStreamCachedManager,
      knowledgeBaseManager: this.knowledgeBaseManager,
      workContextHandler: this.workContextHandler,
      documentLoaders: this.documentLoaders,
      employee,
      sessionId,
      skillSettings,
      webSearch,
      model: resolvedModel,
      from: 'sub-agent',
    });
    const lastMessage = await this.repositories.aiMessages.findOne({
      filter: {
        sessionId,
      },
      sort: ['-messageId'],
    });
    const decisions = lastMessage
      ? await this.aiConversationsManager.getUserDecisions(
          lastMessage.messageId,
        )
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

    const result = await agent.service.invoke(
      {
        userDecisions: decisions ?? undefined,
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

  async isInterrupted(sessionId: string): Promise<boolean> {
    if (!sessionId) {
      return false;
    }

    const aiToolMessage = await this.repositories.aiToolMessages.findOne({
      filter: {
        sessionId,
        toolName: 'dispatch-sub-agent-task',
        invokeStatus: 'pending',
      },
      sort: ['-id'],
    });

    return Boolean(aiToolMessage);
  }

  async reject(sessionId: string, actorId: string | number): Promise<unknown> {
    const userId = actorId;
    if (!userId) {
      throw new Error('User not authenticated');
    }
    const conversation = await this.repositories.aiConversations.findOne({
      filter: {
        sessionId,
        userId,
      },
    });
    if (!conversation) {
      return;
    }
    const lastMessage = await this.resolveLastMessage(sessionId);
    if (!sessionId || !lastMessage) {
      return;
    }
    const userDecision = {
      type: 'reject' as const,
      message: `The user ignored the tools usage and send new messages`,
    };
    const updated = await this.repositories.aiToolMessages.update({
      values: { userDecision, invokeStatus: 'waiting' },
      filter: {
        sessionId: lastMessage.sessionId,
        messageId: lastMessage.messageId,
        invokeStatus: 'interrupted',
      },
    });
    if (updated > 0) {
      return await this.aiConversationsManager.getUserDecisions(
        lastMessage.messageId,
      );
    }
    return null;
  }
}
