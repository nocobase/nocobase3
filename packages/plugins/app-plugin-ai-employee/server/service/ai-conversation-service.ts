/**
 * Conversation actions for the flattened App Context.
 *
 * Each exported function mirrors the original action behaviour including
 * middleware semantics, SSE error envelopes, parallel-limit checks and the
 * `AIEmployee` streaming / invocation flows.
 */

import type { ConversationExecution } from '../agent/contracts.js';
import type { ConversationStreamTarget } from '../types.js';
import type { AIEmployeeEntity, AIMessageInput } from '@nocobase/ai-employee';
import type { AIManager } from '@nocobase/ai-employee';
import type { DatabaseConnection } from '@nocobase/db';
import type { DatabaseManager } from '@nocobase/db';
import type { Caching } from '@nocobase/caching';
import type { FileStorage } from '@nocobase/ai-employee';
import type { AIFileEntity } from '../repository/ai-file.js';
import type { AIFileMetadataCreateContext } from '../repository/file-storage/ai-file-metadata-repository.js';
import type { Logger } from '@nocobase/logging';
import type { IdGeneratorService } from '@nocobase/snowflake';
import type { Actor, Translate } from '../types.js';
import { ResourceActionError, sendStreamError } from '../types.js';
import type {
  AIMessageEntity,
  AIToolMessageEntity,
} from '../repository/index.js';
import { AgentSSEAdapter } from '../agent/sse.js';
import { createAIEmployeeAgentService } from '../agent/ai-employee/index.js';
import {
  createAgentContext,
  type AppAgentContext,
  type CreateAgentContextOptions,
} from '../agent/context.js';
import { EXECUTE_FRONTEND_TOOL_NAME } from '../agent/ai-employee/common/frontend-tools.js';
import { findCurrentFrontendTool } from '../agent/ai-employee/frontend-tools.js';
import type { RepositoryFactory } from '../factory/repository-factory.js';
import type { DocumentLoaders } from '@nocobase/ai-employee';
import type { AIEmployeesManager } from '../manager/ai-employees-manager.js';
import type { AIConversationsManager } from '../manager/ai-conversations-manager.js';
import type { BuiltInManager } from '../manager/built-in-manager.js';
import type { KnowledgeBaseManager } from '../manager/knowledge-base-manager.js';
import type { LLMStreamCachedManager } from '../manager/llm-stream-cached-manager.js';
import type { SubAgentsDispatcher } from '../manager/sub-agents/dispatcher.js';
import type { WorkContextHandler } from '../manager/work-context/index.js';

async function getAIEmployee(
  repositories: RepositoryFactory,
  username: string,
): Promise<AIEmployeeEntity | null> {
  const employee = await repositories.aiEmployees.findOne({
    filter: { username },
  });
  return employee;
}

async function prependCancelledToolContinuation(
  repositories: RepositoryFactory,
  sessionId: string,
  messages: AIMessageInput[],
  toolMessages: AIMessageInput[],
): Promise<void> {
  if (!toolMessages.length) return;
  const continuationMessageId = String(
    toolMessages[0]?.metadata?.sourceMessageId ??
      toolMessages[0]?.metadata?.toolCall?.messageId ??
      '',
  );
  for (let index = toolMessages.length - 1; index >= 0; index--) {
    const toolMessage = toolMessages[index];
    messages.unshift({
      role: toolMessage.role,
      content: toolMessage.content,
      toolCalls: toolMessage.toolCalls,
      attachments: toolMessage.attachments,
      workContext: toolMessage.workContext,
      metadata: toolMessage.metadata,
    });
  }
  if (!continuationMessageId) return;
  const assistantMessage = await repositories.aiMessages.findOne({
    filter: { sessionId, messageId: continuationMessageId },
  });
  if (!assistantMessage) return;
  messages.unshift({
    role: assistantMessage.role,
    content: assistantMessage.content,
    toolCalls: assistantMessage.toolCalls,
    attachments: assistantMessage.attachments,
    workContext: assistantMessage.workContext,
    metadata: assistantMessage.metadata,
  });
}

function isAIEmployeeEnabled(
  employee: AIEmployeeEntity | null | undefined,
): boolean {
  return employee?.enabled !== false;
}

function sendErrorResponse(
  target: ConversationStreamTarget,
  errorMessage: string,
) {
  sendStreamError(target, errorMessage);
}

function streamTarget(
  execution: ConversationExecution,
): ConversationStreamTarget {
  if (!execution.streamTarget)
    throw new ResourceActionError(500, 'SSE target is required');
  return execution.streamTarget;
}

function loginInCheck(actorId: string | number): void {
  if (!String(actorId)) throw new ResourceActionError(403, 'Forbidden');
}

const isReachParallelLimit = async (
  repositories: RepositoryFactory,
  actorId: string | number,
) => {
  const userId = String(actorId);
  const activeStreamCount = await repositories.aiConversations.count({
    filter: {
      userId,
      llmActiveState: 'streaming',
      updatedAt: {
        $gte: new Date(Date.now() - 10 * 60 * 1000),
      },
    },
  });
  return activeStreamCount > 2;
};

const saveUserMessages = async (
  repositories: RepositoryFactory,
  database: DatabaseConnection,
  snowflake: IdGeneratorService,
  sessionId: string,
  messages: AIMessageInput[],
  messageId?: string,
): Promise<void> => {
  const userMessages = messages.filter((message) => message.role === 'user');
  if (!userMessages.length) {
    return;
  }
  await database.transaction(async (connection) => {
    const repository = repositories.aiMessages;
    if (messageId) {
      const existing = await repository.findOne(
        { filter: { sessionId, messageId } },
        { connection },
      );
      if (existing) {
        await repository.destroy(
          { filter: { sessionId, messageId: { $gte: messageId } } },
          { connection },
        );
      }
    }
    const values: AIMessageEntity[] = userMessages.map((message) => ({
      ...message,
      messageId: String(snowflake.generate()),
      sessionId,
    }));
    await repository.create({ values }, { connection });
  });
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalizeIncomingMessageAttachments(
  translate: Translate,
  messages: AIMessageInput[],
): void {
  for (const message of messages) {
    if (message.attachments == null) {
      continue;
    }
    if (!Array.isArray(message.attachments)) {
      throw new ResourceActionError(400, translate('Invalid attachment'));
    }
    message.attachments = message.attachments.map((attachment) => {
      if (!isRecord(attachment)) {
        throw new ResourceActionError(400, translate('Invalid attachment'));
      }
      const source: Record<string, unknown> = isRecord(attachment.source)
        ? { ...attachment.source }
        : attachment.id != null
          ? { collectionName: 'aiFiles' }
          : (() => {
              throw new ResourceActionError(
                400,
                translate('Invalid attachment'),
              );
            })();
      delete source.trustworthy;
      if (typeof source.collectionName !== 'string' || !source.collectionName) {
        throw new ResourceActionError(400, translate('Invalid attachment'));
      }
      return {
        ...attachment,
        source,
      };
    });
  }
}

export interface AIConversationServiceOptions {
  readonly ai: AIManager;
  readonly database: DatabaseConnection;
  readonly databaseManager: DatabaseManager;
  readonly logger: Logger;
  readonly caching: Caching;
  readonly fileStorage: FileStorage<AIFileEntity, AIFileMetadataCreateContext>;
  readonly snowflake: IdGeneratorService;
  readonly repositories: RepositoryFactory;
  readonly aiEmployeesManager: AIEmployeesManager;
  readonly aiConversationsManager: AIConversationsManager;
  readonly builtInManager: BuiltInManager;
  readonly llmStreamCachedManager: LLMStreamCachedManager;
  readonly subAgentsDispatcher: SubAgentsDispatcher;
  readonly knowledgeBaseManager: KnowledgeBaseManager;
  readonly workContextHandler: WorkContextHandler;
  readonly documentLoaders: DocumentLoaders;
}

export class AIConversationService {
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
  private readonly subAgentsDispatcher: SubAgentsDispatcher;
  private readonly knowledgeBaseManager: KnowledgeBaseManager;
  private readonly workContextHandler: WorkContextHandler;
  private readonly documentLoaders: DocumentLoaders;

  public constructor(options: AIConversationServiceOptions) {
    this.ai = options.ai;
    this.database = options.database;
    this.databaseManager = options.databaseManager;
    this.logger = options.logger;
    this.caching = options.caching;
    this.fileStorage = options.fileStorage;
    this.snowflake = options.snowflake;
    this.repositories = options.repositories;
    this.aiEmployeesManager = options.aiEmployeesManager;
    this.aiConversationsManager = options.aiConversationsManager;
    this.builtInManager = options.builtInManager;
    this.llmStreamCachedManager = options.llmStreamCachedManager;
    this.subAgentsDispatcher = options.subAgentsDispatcher;
    this.knowledgeBaseManager = options.knowledgeBaseManager;
    this.workContextHandler = options.workContextHandler;
    this.documentLoaders = options.documentLoaders;
  }
  private createAgentContext({
    actor,
    execution,
    state,
    translate,
    getHeader,
  }: {
    actor: Actor;
    execution?: ConversationExecution;
    state?: CreateAgentContextOptions['state'];
    translate?: Translate;
    getHeader?: (name: string) => string | undefined;
  }): AppAgentContext {
    return createAgentContext({
      actor,
      execution,
      state,
      ai: this.ai,
      database: this.databaseManager,
      logger: this.logger,
      repositories: this.repositories,
      aiEmployeesManager: this.aiEmployeesManager,
      aiConversationsManager: this.aiConversationsManager,
      builtInManager: this.builtInManager,
      knowledgeBaseManager: this.knowledgeBaseManager,
      subAgentsDispatcher: this.subAgentsDispatcher,
      translate,
      getHeader,
    });
  }

  async getActiveState({
    actorId,
    sessionId,
  }: {
    actorId: string | number;
    sessionId: string;
  }): Promise<{ llmActiveState: string }> {
    const conversation = await this.repositories.aiConversations.findOne({
      filter: { sessionId, userId: actorId },
    });
    return { llmActiveState: conversation?.llmActiveState ?? 'idle' };
  }

  async prependCancelledToolContinuation({
    sessionId,
    messages,
    toolMessages,
  }: {
    sessionId: string;
    messages: AIMessageInput[];
    toolMessages: AIMessageInput[];
  }): Promise<void> {
    await prependCancelledToolContinuation(
      this.repositories,
      sessionId,
      messages,
      toolMessages,
    );
  }

  normalizeIncomingMessageAttachments({
    translate,
    messages,
  }: {
    translate: Translate;
    messages: AIMessageInput[];
  }): void {
    normalizeIncomingMessageAttachments(translate, messages);
  }

  async list({
    actorId,
    scope,
    options = {},
  }: {
    actorId: string | number;
    scope?: string;
    options?: {
      filter?: Record<string, unknown>;
      scope?: string;
      keyword?: string;
    };
  }) {
    loginInCheck(actorId);
    const userId = String(actorId);
    const filter = isRecord(options.filter) ? options.filter : {};
    if (options.keyword) filter.title = { $includes: options.keyword };
    const where: Record<string, any> = {
      ...filter,
      userId,
      from: filter.from ?? 'main-agent',
      category: 'chat',
      ...(typeof scope === 'string' && scope ? { scope } : {}),
    };
    const rows = await this.repositories.aiConversations.find({
      filter: where,
      sort: ['-updatedAt'],
    });
    return rows;
  }

  async unreadCount({ actorId }: { actorId: string | number }) {
    const userId = String(actorId);
    const count = await this.repositories.aiConversations.count({
      filter: {
        userId,
        read: false,
        from: 'main-agent',
        category: 'chat',
      },
    });
    return { count };
  }

  async unreadCounts({ actorId }: { actorId: string | number }) {
    const userId = String(actorId);
    const conversationUnreadCount =
      await this.repositories.aiConversations.count({
        filter: { userId, read: false, from: 'main-agent', category: 'chat' },
      });
    return { conversationUnreadCount };
  }

  async create({
    actorId,
    input,
  }: {
    actorId: string | number;
    input: Record<string, any>;
  }) {
    const userId = String(actorId);
    const {
      aiEmployee,
      systemMessage,
      skillSettings,
      conversationSettings,
      modelSettings,
      scope,
    } = input;
    if (!aiEmployee?.username) {
      throw new ResourceActionError(400, 'AI employee is required');
    }
    const normalizedScope = typeof scope === 'string' ? scope : undefined;
    const employee = await getAIEmployee(
      this.repositories,
      aiEmployee.username,
    );
    if (!employee) {
      throw new ResourceActionError(400, 'AI employee not found');
    }
    if (!isAIEmployeeEnabled(employee)) {
      throw new ResourceActionError(400, 'AI employee is disabled');
    }

    try {
      return await this.aiConversationsManager.create({
        userId,
        aiEmployee,
        scope: normalizedScope,
        options: {
          systemMessage,
          skillSettings,
          conversationSettings,
          modelSettings,
        },
      });
    } catch (error: any) {
      if (error.message === 'AI employee not found') {
        throw new ResourceActionError(400, error.message);
      }
      throw error;
    }
  }

  async update({
    actorId,
    sessionId,
    input,
  }: {
    actorId: string | number;
    sessionId: string;
    input: { title?: string };
  }) {
    const userId = String(actorId);
    if (typeof sessionId !== 'string' || !sessionId) {
      throw new ResourceActionError(400, 'invalid sessionId');
    }
    const { title } = input;
    return await this.aiConversationsManager.update({
      userId,
      sessionId,
      title,
    });
  }

  async updateOptions({
    actorId,
    sessionId,
    input,
  }: {
    actorId: string | number;
    sessionId: string;
    input: Record<string, any>;
  }) {
    const userId = String(actorId);
    if (!sessionId) {
      throw new ResourceActionError(400, 'invalid sessionId');
    }
    const {
      systemMessage,
      skillSettings,
      conversationSettings,
      modelSettings,
    } = input;
    if (
      !systemMessage &&
      !skillSettings &&
      !conversationSettings &&
      !modelSettings
    ) {
      throw new ResourceActionError(400, 'invalid options');
    }
    try {
      return await this.aiConversationsManager.update({
        userId,
        sessionId,
        options: {
          systemMessage,
          skillSettings,
          conversationSettings,
          modelSettings,
        },
      });
    } catch (error: any) {
      if (error.message === 'invalid sessionId') {
        throw new ResourceActionError(400, error.message);
      }
      throw error;
    }
  }

  async destroy({
    actorId,
    options,
  }: {
    actorId: string | number;
    options: { sessionId?: string; filter?: Record<string, unknown> };
  }) {
    const userId = String(actorId);
    const filter = isRecord(options.filter) ? options.filter : {};
    const sessionId = options.sessionId;
    const where: Record<string, any> = {
      ...filter,
      userId,
    };
    if (sessionId) where.sessionId = sessionId;
    await this.repositories.aiConversations.destroy({ filter: where });
    return null;
  }

  async getMessages({
    actorId,
    options,
  }: {
    actorId: string | number;
    options: {
      sessionId: string;
      cursor?: string;
      paginate?: boolean;
      updateRead?: boolean;
    };
  }) {
    const userId = String(actorId);
    const { sessionId, cursor } = options;
    if (!sessionId) {
      throw new ResourceActionError(400, 'Invalid request');
    }
    const paginate = options.paginate !== false;
    const updateRead = options.updateRead === true;
    try {
      return await this.aiConversationsManager.getMessages({
        userId,
        sessionId,
        cursor,
        paginate,
        updateRead,
      });
    } catch (error: any) {
      if (error.message === 'invalid sessionId') {
        throw new ResourceActionError(400, 'Invalid request');
      }
      throw error;
    }
  }

  async updateToolArgs({
    actorId,
    input,
  }: {
    actorId: string | number;
    input: Record<string, any>;
  }) {
    const userId = String(actorId);
    const { sessionId, messageId, tool } = input;
    if (!sessionId) {
      throw new ResourceActionError(400, 'Invalid request');
    }
    const conversation = await this.aiConversationsManager.getConversation({
      sessionId,
      userId,
    });
    if (!conversation) {
      throw new ResourceActionError(400, 'Invalid request');
    }
    const messageRepository = this.repositories.aiMessages;
    const message = await messageRepository.findOne({
      filter: { sessionId, messageId },
    });
    if (!message) {
      throw new ResourceActionError(400, 'Invalid request');
    }
    const toolCalls = message.toolCalls || [];
    const index = toolCalls.findIndex(
      (toolCall: { id: string }) => toolCall.id === tool.id,
    );
    if (index === -1) {
      return null;
    }
    toolCalls[index] = { ...toolCalls[index], args: tool.args };
    await messageRepository.update({
      filter: { sessionId, messageId },
      values: { toolCalls },
    });
    return null;
  }

  async sendMessages({
    actor,
    input,
    execution = {},
    translate,
    getHeader,
  }: {
    actor: Actor;
    input: Record<string, any>;
    execution?: ConversationExecution;
    translate: Translate;
    getHeader?: (name: string) => string | undefined;
  }) {
    const userId = String(actor.id);
    const {
      sessionId,
      aiEmployee: employeeName,
      messages,
      editingMessageId,
      model,
      webSearch,
      stream = true,
    } = input;

    const shouldStream = stream !== false;
    if (shouldStream) {
    }

    try {
      if (!sessionId) {
        throw new ResourceActionError(400, translate('sessionId is required'));
      }
      if (!Array.isArray(messages)) {
        throw new ResourceActionError(
          400,
          translate('messages must be an array'),
        );
      }
      normalizeIncomingMessageAttachments(translate, messages);
      const userMessage = messages.find(
        (message: any) => message.role === 'user',
      );
      if (!userMessage) {
        throw new ResourceActionError(
          400,
          translate('user message is required'),
        );
      }

      const conversation = await this.aiConversationsManager.getConversation({
        sessionId,
        userId,
      });
      if (!conversation) {
        throw new ResourceActionError(400, translate('conversation not found'));
      }

      const employee = await getAIEmployee(this.repositories, employeeName);
      if (!employee) {
        throw new ResourceActionError(400, translate('AI employee not found'));
      }

      if (!conversation.title) {
        const textUserMessage = messages.find(
          (message: any) =>
            message.role === 'user' &&
            message.content?.type === 'text' &&
            message.content?.content,
        );
        if (textUserMessage) {
          const content = textUserMessage.content.content;
          const title = content.substring(0, 30);
          await this.repositories.aiConversations.update({
            filter: { sessionId, userId },
            values: { title },
          });
          conversation.title = title;
        }
      }

      if (await isReachParallelLimit(this.repositories, actor.id)) {
        await saveUserMessages(
          this.repositories,
          this.database,
          this.snowflake,
          sessionId,
          messages,
          editingMessageId,
        );
        throw new ResourceActionError(
          400,
          translate(
            'There are conversations in progress. Please try again later.',
          ),
        );
      }
      const resolvedModel = await this.aiEmployeesManager.resolveModel(
        employee,
        model,
      );
      const agentContext = this.createAgentContext({
        actor,
        execution,
        translate,
        getHeader,
      });
      const agentOptions = {
        agentContext,
        database: this.database,
        caching: this.caching,
        fileStorage: this.fileStorage,
        snowflake: this.snowflake,
        execution,
        getHeader,
        collectionRepository: this.repositories.collectionRepository.bind(
          this.repositories,
        ),
        aiConversations: this.repositories.aiConversations,
        aiEmployees: this.repositories.aiEmployees,
        aiMessages: this.repositories.aiMessages,
        aiToolMessages: this.repositories.aiToolMessages,
        usersAiEmployees: this.repositories.usersAiEmployees,
        lcCheckpoints: this.repositories.lcCheckpoints,
        lcCheckpointBlobs: this.repositories.lcCheckpointBlobs,
        lcCheckpointWrites: this.repositories.lcCheckpointWrites,
        aiEmployeesManager: this.aiEmployeesManager,
        builtInManager: this.builtInManager,
        llmStreamCachedManager: this.llmStreamCachedManager,
        knowledgeBaseManager: this.knowledgeBaseManager,
        workContextHandler: this.workContextHandler,
        documentLoaders: this.documentLoaders,
        employee,
        sessionId,
        systemMessage:
          typeof conversation.options?.systemMessage === 'string'
            ? conversation.options.systemMessage
            : undefined,
        skillSettings: isRecord(conversation.options?.skillSettings)
          ? conversation.options.skillSettings
          : undefined,
        tools: Array.isArray(conversation.options?.tools)
          ? conversation.options.tools
          : undefined,
        webSearch,
        model: resolvedModel,
      };
      if (conversation.category !== 'chat') {
        throw new ResourceActionError(404, 'conversation not found');
      }
      const agent = await createAIEmployeeAgentService(agentOptions);
      const runStream = async (request: any) => {
        const adapter = new AgentSSEAdapter(
          (chunk) => streamTarget(execution).write(chunk),
          (chunk) =>
            this.llmStreamCachedManager.getCached(sessionId).append(chunk),
        );
        await adapter.consume(
          request?.messageId
            ? agent.forkStream(request, agentContext)
            : agent.stream(request, agentContext),
        );
        streamTarget(execution).end();
        return true;
      };
      const runInvoke = (request: any) => {
        return request?.messageId
          ? agent.forkInvoke(request, agentContext)
          : agent.invoke(request, agentContext);
      };
      const cancelToolCall = () => {
        return agent.cancelToolCall();
      };
      if (!editingMessageId) {
        if (await this.subAgentsDispatcher.isInterrupted(sessionId)) {
          const userDecisions = await this.subAgentsDispatcher.reject(
            sessionId,
            actor.id,
          );
          if (userDecisions) {
            if (shouldStream) {
              await runStream({ userDecisions });
            } else {
              return await runInvoke({ userDecisions });
            }
            return undefined;
          }
        } else {
          const toolMessages = await cancelToolCall();
          if (toolMessages?.length) {
            await prependCancelledToolContinuation(
              this.repositories,
              sessionId,
              messages,
              toolMessages,
            );
          }
        }
      }

      if (shouldStream) {
        await runStream({
          userMessages: messages,
          messageId: editingMessageId,
        });
      } else {
        return await runInvoke({
          userMessages: messages,
          messageId: editingMessageId,
        });
      }
      return undefined;
    } catch (err: any) {
      this.logger.error?.(err);
      let status = 500;
      let message = translate('Server unexpected error occur');
      if (err instanceof ResourceActionError) {
        status = err.status;
        message = err.message;
      } else if (err instanceof Error) {
        status = 500;
        message = err.message;
      }
      if (shouldStream) {
        sendErrorResponse(streamTarget(execution), message);
        if (!streamTarget(execution).writableEnded)
          streamTarget(execution).end();
      } else {
        throw new ResourceActionError(status, message);
      }
    }
  }

  async abort({
    actorId,
    input,
  }: {
    actorId: string | number;
    input: { sessionId: string };
  }) {
    const userId = String(actorId);
    const { sessionId } = input;
    if (typeof sessionId !== 'string' || !sessionId) {
      throw new ResourceActionError(400, 'sessionId is required');
    }
    const conversation = await this.aiConversationsManager.getConversation({
      sessionId,
      userId,
    });
    if (!conversation) {
      throw new ResourceActionError(404, 'conversation not found');
    }
    this.aiEmployeesManager.abortConversation(sessionId);
    return null;
  }

  async resumeStream({
    actorId,
    input,
    execution = {},
  }: {
    actorId: string | number;
    input: { sessionId: string };
    execution?: ConversationExecution;
  }) {
    const userId = String(actorId);
    const abortController = new AbortController();
    const abortStream = () => abortController.abort();
    const target = streamTarget(execution);
    const shouldStopStream = () =>
      abortController.signal.aborted ||
      target.destroyed ||
      target.writableEnded;

    const { sessionId } = input;
    if (!sessionId) {
      sendErrorResponse(streamTarget(execution), 'sessionId is required');
      return;
    }

    execution.abortSignal?.addEventListener('abort', abortStream, {
      once: true,
    });

    try {
      const conversation = await this.aiConversationsManager.getConversation({
        sessionId,
        userId,
      });
      if (shouldStopStream()) {
        return;
      }
      if (!conversation) {
        sendErrorResponse(streamTarget(execution), 'conversation not found');
        return;
      }
      const reachLimit = await isReachParallelLimit(this.repositories, actorId);
      if (shouldStopStream()) {
        return;
      }

      let hasChunks = false;
      if (!reachLimit) {
        for await (const chunk of this.llmStreamCachedManager
          .getCached(sessionId)
          .stream({ signal: abortController.signal })) {
          if (shouldStopStream()) {
            break;
          }
          hasChunks = true;
          streamTarget(execution).write(chunk);
        }
      }

      if (!hasChunks && !shouldStopStream()) {
        const currentConversation =
          await this.aiConversationsManager.getConversation({
            sessionId,
            userId,
          });
        const llmActiveState = currentConversation?.llmActiveState;
        if (llmActiveState && llmActiveState !== 'idle') {
          streamTarget(execution).write(
            `data: ${JSON.stringify({ type: 'chunks_cache_missing', body: { llmActiveState } })}\n\n`,
          );
        }
      }
    } catch (err: any) {
      if (shouldStopStream()) {
        return;
      }
      this.logger.error?.(err);
      sendErrorResponse(
        streamTarget(execution),
        err.message || 'Resume stream error',
      );
      return;
    } finally {
      execution.abortSignal?.removeEventListener('abort', abortStream);
      if (!shouldStopStream()) {
        streamTarget(execution).end();
      }
    }
  }

  async resendMessages({
    actor,
    input,
    execution = {},
    translate,
    getHeader,
  }: {
    actor: Actor;
    input: Record<string, any>;
    execution?: ConversationExecution;
    translate: Translate;
    getHeader?: (name: string) => string | undefined;
  }) {
    const userId = String(actor.id);
    const { sessionId, webSearch, model, stream = true } = input;
    let { messageId } = input;

    const shouldStream = stream !== false;
    if (shouldStream) {
    }

    try {
      if (!sessionId) {
        throw new ResourceActionError(400, translate('sessionId is required'));
      }
      const conversation = await this.aiConversationsManager.getConversation({
        sessionId,
        userId,
      });
      if (!conversation) {
        throw new ResourceActionError(400, translate('conversation not found'));
      }
      const employee = await getAIEmployee(
        this.repositories,
        conversation.aiEmployeeUsername ?? '',
      );
      if (!employee) {
        throw new ResourceActionError(400, translate('AI employee not found'));
      }

      const resendMessages: AIMessageInput[] = [];
      if (messageId) {
        const message = await this.repositories.aiMessages.findOne({
          filter: { sessionId, messageId },
        });
        if (!message) {
          throw new ResourceActionError(400, translate('message not found'));
        }
      } else {
        const message = await this.repositories.aiMessages.findOne({
          filter: { sessionId },
          sort: ['-messageId'],
        });
        if (!message) {
          throw new ResourceActionError(400, translate('message not found'));
        }
        messageId = message.messageId;
        if (['user', 'tool'].includes(message.role)) {
          resendMessages.push({
            role: message.role,
            content: message.content,
            toolCalls: message.toolCalls,
            attachments: message.attachments,
            workContext: message.workContext,
            metadata: message.metadata,
          });
        }
      }

      if (await isReachParallelLimit(this.repositories, actor.id)) {
        throw new ResourceActionError(
          400,
          translate(
            'There are conversations in progress. Please try again later.',
          ),
        );
      }
      const resolvedModel = await this.aiEmployeesManager.resolveModel(
        employee,
        model,
      );
      const agentContext = this.createAgentContext({
        actor,
        execution,
        translate,
        getHeader,
      });
      const agentOptions = {
        agentContext,
        database: this.database,
        caching: this.caching,
        fileStorage: this.fileStorage,
        snowflake: this.snowflake,
        execution,
        getHeader,
        collectionRepository: this.repositories.collectionRepository.bind(
          this.repositories,
        ),
        aiConversations: this.repositories.aiConversations,
        aiEmployees: this.repositories.aiEmployees,
        aiMessages: this.repositories.aiMessages,
        aiToolMessages: this.repositories.aiToolMessages,
        usersAiEmployees: this.repositories.usersAiEmployees,
        lcCheckpoints: this.repositories.lcCheckpoints,
        lcCheckpointBlobs: this.repositories.lcCheckpointBlobs,
        lcCheckpointWrites: this.repositories.lcCheckpointWrites,
        aiEmployeesManager: this.aiEmployeesManager,
        builtInManager: this.builtInManager,
        llmStreamCachedManager: this.llmStreamCachedManager,
        knowledgeBaseManager: this.knowledgeBaseManager,
        workContextHandler: this.workContextHandler,
        documentLoaders: this.documentLoaders,
        employee,
        sessionId,
        systemMessage:
          typeof conversation.options?.systemMessage === 'string'
            ? conversation.options.systemMessage
            : undefined,
        skillSettings: isRecord(conversation.options?.skillSettings)
          ? conversation.options.skillSettings
          : undefined,
        tools: Array.isArray(conversation.options?.tools)
          ? conversation.options.tools
          : undefined,
        webSearch,
        model: resolvedModel,
      };
      if (conversation.category !== 'chat') {
        throw new ResourceActionError(404, 'conversation not found');
      }
      if (shouldStream) {
        {
          const service = await createAIEmployeeAgentService(agentOptions);
          await new AgentSSEAdapter(
            (chunk) => streamTarget(execution).write(chunk),
            (chunk) =>
              this.llmStreamCachedManager.getCached(sessionId).append(chunk),
          ).consume(
            service.forkStream(
              {
                messageId,
                userMessages: resendMessages.length
                  ? resendMessages
                  : undefined,
              },
              agentContext,
            ),
          );
          streamTarget(execution).end();
        }
      } else {
        const service = await createAIEmployeeAgentService(agentOptions);
        return service.forkInvoke(
          {
            messageId,
            userMessages: resendMessages.length ? resendMessages : undefined,
          },
          agentContext,
        );
      }
      return undefined;
    } catch (err: any) {
      this.logger.error?.(err);
      let status = 500;
      let message = translate('Server unexpected error occur');
      if (err instanceof ResourceActionError) {
        status = err.status;
        message = err.message;
      } else if (err instanceof Error) {
        status = 500;
        message = err.message;
      }
      if (shouldStream) {
        sendErrorResponse(streamTarget(execution), message);
        if (!streamTarget(execution).writableEnded)
          streamTarget(execution).end();
      } else {
        throw new ResourceActionError(status, message);
      }
    }
  }

  async updateUserDecision({
    actor,
    input,
    execution = {},
    translate,
    getHeader,
  }: {
    actor: Actor;
    input: Record<string, any>;
    execution?: ConversationExecution;
    translate: Translate;
    getHeader?: (name: string) => string | undefined;
  }) {
    const userId = String(actor.id);
    const agentContext = this.createAgentContext({
      actor,
      execution,
      translate,
      getHeader,
    });
    const { sessionId, messageId, toolCallId, userDecision } = input;
    if (!sessionId) {
      throw new ResourceActionError(400, 'Invalid request');
    }
    const conversation = await this.aiConversationsManager.getConversation({
      sessionId,
      userId,
    });
    if (!conversation) {
      throw new ResourceActionError(400, 'Invalid request');
    }
    const message = await this.repositories.aiMessages.findOne({
      filter: { sessionId, messageId },
    });
    if (!message) {
      throw new ResourceActionError(400, 'Invalid request');
    }
    const messageConversation =
      await this.aiConversationsManager.getConversation({
        sessionId: message.sessionId,
        userId,
      });
    if (!messageConversation) {
      throw new ResourceActionError(400, 'Invalid request');
    }
    const toolCalls = message.toolCalls;
    if (!toolCalls?.length) {
      throw new ResourceActionError(400, 'Invalid request');
    }
    const selectedToolCall = toolCalls.find(
      (toolCall: { id?: string }) => toolCall.id === toolCallId,
    );
    if (!selectedToolCall) {
      throw new ResourceActionError(400, 'Invalid request');
    }
    if (selectedToolCall.name === EXECUTE_FRONTEND_TOOL_NAME) {
      const toolId = isRecord(selectedToolCall.args)
        ? selectedToolCall.args.toolId
        : undefined;
      const frontendTool =
        typeof toolId === 'string'
          ? await findCurrentFrontendTool(
              this.repositories.aiConversations,
              toolId,
              {
                sessionId: message.sessionId,
              },
            )
          : undefined;
      if (!frontendTool) {
        throw new ResourceActionError(
          400,
          translate('Frontend tool is unavailable'),
        );
      }
    }

    const updated = await this.repositories.aiToolMessages.update({
      filter: {
        sessionId: message.sessionId,
        messageId: message.messageId,
        toolCallId,
        invokeStatus: 'interrupted',
      },
      values: {
        userDecision,
        invokeStatus: 'waiting',
      },
    });

    const toolCallIds = toolCalls.map((x: any) => x.id);
    const toolMessages = await this.repositories.aiToolMessages.find({
      filter: {
        sessionId: message.sessionId,
        messageId: message.messageId,
        toolCallId: { $in: toolCallIds },
      },
    });
    const toolMessageMap = new Map<string | undefined, AIToolMessageEntity>(
      toolMessages.map((toolMessage: AIToolMessageEntity) => [
        toolMessage.toolCallId,
        toolMessage,
      ]),
    );

    const toolsList = await this.ai.toolsManager.listTools({
      sessionId: message.sessionId,
      ctx: agentContext,
    });
    const toolsMap = new Map<string, any>(
      toolsList.map((t: any) => [t.definition.name, t]),
    );

    for (const toolCall_ of toolCalls) {
      const tools = toolsMap.get(toolCall_.name);
      const toolMessage = toolMessageMap.get(toolCall_.id);
      toolCall_.invokeStatus = toolMessage?.invokeStatus;
      toolCall_.auto = toolMessage?.auto;
      toolCall_.status = toolMessage?.status;
      toolCall_.content = toolMessage?.content;
      toolCall_.userDecision = toolMessage?.userDecision;
      toolCall_.execution = tools?.execution;
      toolCall_.willInterrupt =
        tools?.execution === 'frontend' || toolMessage?.auto === false;
      toolCall_.defaultPermission = tools?.defaultPermission;
    }

    return {
      updated,
      toolCalls,
    };
  }

  async resumeToolCall({
    actor,
    input,
    execution = {},
    translate,
    getHeader,
  }: {
    actor: Actor;
    input: Record<string, any>;
    execution?: ConversationExecution;
    translate: Translate;
    getHeader?: (name: string) => string | undefined;
  }) {
    const userId = String(actor.id);
    const { sessionId, messageId, model, webSearch } = input;
    if (!sessionId) {
      sendErrorResponse(streamTarget(execution), 'sessionId is required');
      return;
    }
    try {
      const conversation = await this.aiConversationsManager.getConversation({
        sessionId,
        userId,
      });
      if (!conversation) {
        sendErrorResponse(streamTarget(execution), 'conversation not found');
        return;
      }
      const employee = await getAIEmployee(
        this.repositories,
        conversation.aiEmployeeUsername ?? '',
      );
      if (!employee) {
        sendErrorResponse(streamTarget(execution), 'AI employee not found');
        return;
      }

      let message: AIMessageEntity | null;
      if (messageId) {
        message = await this.repositories.aiMessages.findOne({
          filter: { sessionId, messageId },
        });
      } else {
        message = await this.repositories.aiMessages.findOne({
          filter: { sessionId },
          sort: ['-messageId'],
        });
      }
      if (!message) {
        sendErrorResponse(streamTarget(execution), 'message not found');
        return;
      }
      const messageConversation =
        await this.aiConversationsManager.getConversation({
          sessionId: message.sessionId,
          userId,
        });
      if (!messageConversation) {
        sendErrorResponse(streamTarget(execution), 'conversation not found');
        return;
      }
      const tools = message.toolCalls;
      if (!tools?.length) {
        sendErrorResponse(streamTarget(execution), 'No tool calls found');
        return;
      }
      const resolvedModel = await this.aiEmployeesManager.resolveModel(
        employee,
        model,
      );
      const agentContext = this.createAgentContext({
        actor,
        execution,
        translate,
        getHeader,
      });
      const agentOptions = {
        agentContext,
        database: this.database,
        caching: this.caching,
        fileStorage: this.fileStorage,
        snowflake: this.snowflake,
        execution,
        getHeader,
        collectionRepository: this.repositories.collectionRepository.bind(
          this.repositories,
        ),
        aiConversations: this.repositories.aiConversations,
        aiEmployees: this.repositories.aiEmployees,
        aiMessages: this.repositories.aiMessages,
        aiToolMessages: this.repositories.aiToolMessages,
        usersAiEmployees: this.repositories.usersAiEmployees,
        lcCheckpoints: this.repositories.lcCheckpoints,
        lcCheckpointBlobs: this.repositories.lcCheckpointBlobs,
        lcCheckpointWrites: this.repositories.lcCheckpointWrites,
        aiEmployeesManager: this.aiEmployeesManager,
        builtInManager: this.builtInManager,
        llmStreamCachedManager: this.llmStreamCachedManager,
        knowledgeBaseManager: this.knowledgeBaseManager,
        workContextHandler: this.workContextHandler,
        documentLoaders: this.documentLoaders,
        employee,
        sessionId,
        systemMessage:
          typeof conversation.options?.systemMessage === 'string'
            ? conversation.options.systemMessage
            : undefined,
        skillSettings: isRecord(conversation.options?.skillSettings)
          ? conversation.options.skillSettings
          : undefined,
        tools: Array.isArray(conversation.options?.tools)
          ? conversation.options.tools
          : undefined,
        webSearch,
        model: resolvedModel,
      };
      const userDecisions = await this.aiConversationsManager.getUserDecisions(
        message.messageId,
      );
      if (conversation.category !== 'chat') {
        throw new ResourceActionError(404, 'conversation not found');
      }
      {
        const service = await createAIEmployeeAgentService(agentOptions);
        await new AgentSSEAdapter(
          (chunk) => streamTarget(execution).write(chunk),
          (chunk) =>
            this.llmStreamCachedManager.getCached(sessionId).append(chunk),
        ).consume(service.resumeStream({ userDecisions }, agentContext));
        streamTarget(execution).end();
      }
    } catch (err: any) {
      this.logger.error?.(err);
      sendErrorResponse(
        streamTarget(execution),
        err.message || 'Tool call error',
      );
      if (!streamTarget(execution).writableEnded) streamTarget(execution).end();
    }
  }
}
