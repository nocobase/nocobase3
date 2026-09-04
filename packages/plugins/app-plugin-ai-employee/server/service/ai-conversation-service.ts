/**
 * Conversation actions for the flattened App Context.
 *
 * Each exported function mirrors the original action behaviour including
 * middleware semantics, SSE error envelopes, parallel-limit checks and the
 * `AIEmployee` streaming / invocation flows.
 */

import type {
  Context,
  ConversationRequestExecution,
  StreamTarget,
} from '../internal/runtime-context.js';
import type { RuntimeServices } from '../internal/runtime-services.js';
import type { AIEmployeeEntity, AIMessageInput } from '@nocobase/ai-employee';
import { ResourceActionError, sendStreamError } from '../domain/errors.js';
import type {
  AIMessageEntity,
  AIToolMessageEntity,
} from '../repository/index.js';
import { AIEmployee } from '../ai-employees/ai-employee.js';
import type { AIEmployeeOptions } from '../ai-employees/ai-employee.js';
import { AgentSSEAdapter } from '../agent/sse.js';
import { createAIEmployeeAgentService } from '../agent/ai-employee/index.js';
import { createAgentContext } from '../agent/context.js';
import { EXECUTE_FRONTEND_TOOL_NAME } from '../ai-employees/common/frontend-tools.js';
import { findCurrentFrontendTool } from '../ai-employees/frontend-tools.js';
import type { RepositoryFactory } from '../repository/database/factory.js';

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
  toolMessages: AIMessageEntity[],
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
  _ctx: Context,
  employee: AIEmployeeEntity | null | undefined,
): boolean {
  return employee?.enabled !== false;
}

function setupSSEHeaders(_ctx: Context) {
  // Headers are applied by the router when constructing the SSE Response.
}

function sendErrorResponse(target: StreamTarget, errorMessage: string) {
  sendStreamError(target, errorMessage);
}

function streamTarget(execution: ConversationRequestExecution): StreamTarget {
  if (!execution.streamTarget)
    throw new ResourceActionError(500, 'SSE target is required');
  return execution.streamTarget;
}

async function loginInCheck(ctx: Context) {
  const userId = String(ctx.currentUser.id);
  if (!userId) {
    return ctx.throw!(403);
  }
}

const isReachParallelLimit = async (
  repositories: RepositoryFactory,
  ctx: Context,
) => {
  const userId = String(ctx.currentUser.id);
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
  ctx: Context,
  sessionId: string,
  messages: AIMessageInput[],
  messageId?: string,
): Promise<void> => {
  const userMessages = messages.filter((message) => message.role === 'user');
  if (!userMessages.length) {
    return;
  }
  await ctx.database.transaction(async (connection) => {
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
      messageId: String(ctx.snowflake.generate()),
      sessionId,
    }));
    await repository.create({ values }, { connection });
  });
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalizeIncomingMessageAttachments(
  ctx: Context,
  messages: AIMessageInput[],
): void {
  for (const message of messages) {
    if (message.attachments == null) {
      continue;
    }
    if (!Array.isArray(message.attachments)) {
      throw new ResourceActionError(400, ctx.t!('Invalid attachment'));
    }
    message.attachments = message.attachments.map((attachment) => {
      if (!isRecord(attachment)) {
        throw new ResourceActionError(400, ctx.t!('Invalid attachment'));
      }
      const source: Record<string, unknown> = isRecord(attachment.source)
        ? { ...attachment.source }
        : attachment.id != null
          ? { collectionName: 'aiFiles' }
          : (() => {
              throw new ResourceActionError(400, ctx.t!('Invalid attachment'));
            })();
      delete source.trustworthy;
      if (typeof source.collectionName !== 'string' || !source.collectionName) {
        throw new ResourceActionError(400, ctx.t!('Invalid attachment'));
      }
      return {
        ...attachment,
        source,
      };
    });
  }
}

export interface AIConversationServiceOptions {
  repositories: RepositoryFactory;
  runtime: RuntimeServices;
}

export class AIConversationService {
  private readonly repositories: RepositoryFactory;
  private readonly runtime: RuntimeServices;

  public constructor({ repositories, runtime }: AIConversationServiceOptions) {
    this.repositories = repositories;
    this.runtime = runtime;
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
    toolMessages: AIMessageEntity[];
  }): Promise<void> {
    await prependCancelledToolContinuation(
      this.repositories,
      sessionId,
      messages,
      toolMessages,
    );
  }

  normalizeIncomingMessageAttachments({
    ctx,
    messages,
  }: {
    ctx: Context;
    messages: AIMessageInput[];
  }): void {
    normalizeIncomingMessageAttachments(ctx, messages);
  }

  async list({
    ctx,
    options = {},
  }: {
    ctx: Context;
    options?: {
      filter?: Record<string, unknown>;
      scope?: string;
      keyword?: string;
    };
  }) {
    await loginInCheck(ctx);
    const userId = String(ctx.currentUser.id);
    const filter = isRecord(options.filter) ? options.filter : {};
    const scope = options.scope;
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

  async unreadCount({ ctx }: { ctx: Context }) {
    const userId = String(ctx.currentUser.id);
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

  async unreadCounts({ ctx }: { ctx: Context }) {
    const userId = String(ctx.currentUser.id);
    const conversationUnreadCount =
      await this.repositories.aiConversations.count({
        filter: { userId, read: false, from: 'main-agent', category: 'chat' },
      });
    const workflowTaskUnreadCount = 0;
    return { conversationUnreadCount, workflowTaskUnreadCount };
  }

  async create({ ctx, input }: { ctx: Context; input: Record<string, any> }) {
    const userId = String(ctx.currentUser.id);
    const {
      aiEmployee,
      systemMessage,
      skillSettings,
      conversationSettings,
      modelSettings,
      scope,
    } = input;
    if (!aiEmployee?.username) {
      return ctx.throw!(400, 'AI employee is required');
    }
    const normalizedScope = typeof scope === 'string' ? scope : undefined;
    const employee = await getAIEmployee(
      this.repositories,
      aiEmployee.username,
    );
    if (!employee) {
      return ctx.throw!(400, 'AI employee not found');
    }
    if (!isAIEmployeeEnabled(ctx, employee)) {
      return ctx.throw!(400, 'AI employee is disabled');
    }

    try {
      return await this.runtime.aiConversationsManager.create({
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
        return ctx.throw!(400, error.message);
      }
      throw error;
    }
  }

  async update({
    ctx,
    sessionId,
    input,
  }: {
    ctx: Context;
    sessionId: string;
    input: { title?: string };
  }) {
    const userId = String(ctx.currentUser.id);
    if (typeof sessionId !== 'string' || !sessionId) {
      return ctx.throw!(400, 'invalid sessionId');
    }
    const { title } = input;
    return await this.runtime.aiConversationsManager.update({
      userId,
      sessionId,
      title,
    });
  }

  async updateOptions({
    ctx,
    sessionId,
    input,
  }: {
    ctx: Context;
    sessionId: string;
    input: Record<string, any>;
  }) {
    const userId = String(ctx.currentUser.id);
    if (!sessionId) {
      return ctx.throw!(400, 'invalid sessionId');
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
      return ctx.throw!(400, 'invalid options');
    }
    try {
      return await this.runtime.aiConversationsManager.update({
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
        return ctx.throw!(400, error.message);
      }
      throw error;
    }
  }

  async destroy({
    ctx,
    options,
  }: {
    ctx: Context;
    options: { sessionId?: string; filter?: Record<string, unknown> };
  }) {
    const userId = String(ctx.currentUser.id);
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
    ctx,
    options,
  }: {
    ctx: Context;
    options: {
      sessionId: string;
      cursor?: string;
      paginate?: boolean;
      updateRead?: boolean;
    };
  }) {
    const userId = String(ctx.currentUser.id);
    const { sessionId, cursor } = options;
    if (!sessionId) {
      return ctx.throw!(400);
    }
    const paginate = options.paginate !== false;
    const updateRead = options.updateRead === true;
    try {
      return await this.runtime.aiConversationsManager.getMessages({
        userId,
        sessionId,
        cursor,
        paginate,
        updateRead,
      });
    } catch (error: any) {
      if (error.message === 'invalid sessionId') {
        return ctx.throw!(400);
      }
      throw error;
    }
  }

  async updateToolArgs({
    ctx,
    input,
  }: {
    ctx: Context;
    input: Record<string, any>;
  }) {
    const userId = String(ctx.currentUser.id);
    const { sessionId, messageId, tool } = input;
    if (!sessionId) {
      return ctx.throw!(400);
    }
    const conversation =
      await this.runtime.aiConversationsManager.getConversation({
        sessionId,
        userId,
      });
    if (!conversation) {
      return ctx.throw!(400);
    }
    const messageRepository = this.repositories.aiMessages;
    const message = await messageRepository.findOne({
      filter: { sessionId, messageId },
    });
    if (!message) {
      return ctx.throw!(400);
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
    ctx,
    input,
    execution = {},
  }: {
    ctx: Context;
    input: Record<string, any>;
    execution?: ConversationRequestExecution;
  }) {
    const userId = String(ctx.currentUser.id);
    ctx.requestExecution = execution;
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
      setupSSEHeaders(ctx);
    }

    try {
      if (!sessionId) {
        throw new ResourceActionError(400, ctx.t!('sessionId is required'));
      }
      if (!Array.isArray(messages)) {
        throw new ResourceActionError(400, ctx.t!('messages must be an array'));
      }
      normalizeIncomingMessageAttachments(ctx, messages);
      const userMessage = messages.find(
        (message: any) => message.role === 'user',
      );
      if (!userMessage) {
        throw new ResourceActionError(400, ctx.t!('user message is required'));
      }

      const conversation =
        await this.runtime.aiConversationsManager.getConversation({
          sessionId,
          userId,
        });
      if (!conversation) {
        throw new ResourceActionError(400, ctx.t!('conversation not found'));
      }

      const employee = await getAIEmployee(this.repositories, employeeName);
      if (!employee) {
        throw new ResourceActionError(400, ctx.t!('AI employee not found'));
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

      if (await isReachParallelLimit(this.repositories, ctx)) {
        await saveUserMessages(
          this.repositories,
          ctx,
          sessionId,
          messages,
          editingMessageId,
        );
        throw new ResourceActionError(
          400,
          ctx.t!(
            'There are conversations in progress. Please try again later.',
          ),
        );
      }
      const useInitialThread = conversation.thread === 0;
      const resolvedModel = await this.runtime.aiEmployeesManager.resolveModel(
        employee,
        model,
      );
      const agentOptions = {
        ctx: ctx,
        repositories: this.repositories,
        runtime: this.runtime,
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
        legacy: useInitialThread,
      };
      const useLegacyWorkflow = conversation.category === 'task';
      const aiEmployee = useLegacyWorkflow
        ? new AIEmployee(agentOptions as AIEmployeeOptions)
        : null;
      const agent = useLegacyWorkflow
        ? null
        : await createAIEmployeeAgentService(agentOptions);
      const runStream = async (request: any) => {
        if (aiEmployee) return aiEmployee.stream(request);
        const adapter = new AgentSSEAdapter(
          (chunk) => streamTarget(execution).write(chunk),
          (chunk) =>
            this.runtime.llmStreamCachedManager
              .getCached(sessionId)
              .append(chunk),
        );
        if (!agent) {
          throw new Error('AI employee agent service is required');
        }
        const agentContext = createAgentContext(
          ctx,
          this.repositories,
          this.runtime,
        );
        await adapter.consume(
          request?.messageId
            ? agent.service.forkStream(request, agentContext)
            : agent.service.stream(request, agentContext),
        );
        streamTarget(execution).end();
        return true;
      };
      const runInvoke = (request: any) => {
        if (aiEmployee) return aiEmployee.invoke(request);
        if (!agent) {
          throw new Error('AI employee agent service is required');
        }
        const agentContext = createAgentContext(
          ctx,
          this.repositories,
          this.runtime,
        );
        return request?.messageId
          ? agent.service.forkInvoke(request, agentContext)
          : agent.service.invoke(request, agentContext);
      };
      const cancelToolCall = () => {
        if (aiEmployee) {
          return aiEmployee.cancelToolCall();
        }
        if (!agent) {
          throw new Error('AI employee agent service is required');
        }
        return agent.facade.cancelToolCall();
      };
      if (!editingMessageId) {
        if (await this.runtime.subAgentsDispatcher.isInterrupted(sessionId)) {
          const userDecisions = await this.runtime.subAgentsDispatcher.reject(
            sessionId,
            ctx,
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
      ctx.logger?.error(err);
      let status = 500;
      let message = ctx.t!('Server unexpected error occur');
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
        return ctx.throw!(status, message);
      }
    }
  }

  async abort({ ctx, input }: { ctx: Context; input: { sessionId: string } }) {
    const userId = String(ctx.currentUser.id);
    const { sessionId } = input;
    if (typeof sessionId !== 'string' || !sessionId) {
      return ctx.throw!(400, 'sessionId is required');
    }
    const conversation =
      await this.runtime.aiConversationsManager.getConversation({
        sessionId,
        userId,
      });
    if (!conversation) {
      return ctx.throw!(404, 'conversation not found');
    }
    this.runtime.aiEmployeesManager.abortConversation(sessionId);
    return null;
  }

  async resumeStream({
    ctx,
    input,
    execution = {},
  }: {
    ctx: Context;
    input: { sessionId: string };
    execution?: ConversationRequestExecution;
  }) {
    ctx.requestExecution = execution;
    const userId = String(ctx.currentUser.id);
    const abortController = new AbortController();
    const abortStream = () => abortController.abort();
    const target = streamTarget(execution);
    const shouldStopStream = () =>
      abortController.signal.aborted ||
      target.destroyed ||
      target.writableEnded;
    setupSSEHeaders(ctx);

    const { sessionId } = input;
    if (!sessionId) {
      sendErrorResponse(streamTarget(execution), 'sessionId is required');
      return;
    }

    execution.abortSignal?.addEventListener('abort', abortStream, {
      once: true,
    });

    try {
      const conversation =
        await this.runtime.aiConversationsManager.getConversation({
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
      const reachLimit = await isReachParallelLimit(this.repositories, ctx);
      if (shouldStopStream()) {
        return;
      }

      let hasChunks = false;
      if (!reachLimit) {
        for await (const chunk of this.runtime.llmStreamCachedManager
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
          await this.runtime.aiConversationsManager.getConversation({
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
      ctx.logger?.error(err);
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
    ctx,
    input,
    execution = {},
  }: {
    ctx: Context;
    input: Record<string, any>;
    execution?: ConversationRequestExecution;
  }) {
    ctx.requestExecution = execution;
    const userId = String(ctx.currentUser.id);
    const { sessionId, webSearch, model, stream = true } = input;
    let { messageId } = input;

    const shouldStream = stream !== false;
    if (shouldStream) {
      setupSSEHeaders(ctx);
    }

    try {
      if (!sessionId) {
        throw new ResourceActionError(400, ctx.t!('sessionId is required'));
      }
      const conversation =
        await this.runtime.aiConversationsManager.getConversation({
          sessionId,
          userId,
        });
      if (!conversation) {
        throw new ResourceActionError(400, ctx.t!('conversation not found'));
      }
      const employee = await getAIEmployee(
        this.repositories,
        conversation.aiEmployeeUsername ?? '',
      );
      if (!employee) {
        throw new ResourceActionError(400, ctx.t!('AI employee not found'));
      }

      const resendMessages: AIMessageInput[] = [];
      if (messageId) {
        const message = await this.repositories.aiMessages.findOne({
          filter: { sessionId, messageId },
        });
        if (!message) {
          throw new ResourceActionError(400, ctx.t!('message not found'));
        }
      } else {
        const message = await this.repositories.aiMessages.findOne({
          filter: { sessionId },
          sort: ['-messageId'],
        });
        if (!message) {
          throw new ResourceActionError(400, ctx.t!('message not found'));
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

      if (await isReachParallelLimit(this.repositories, ctx)) {
        throw new ResourceActionError(
          400,
          ctx.t!(
            'There are conversations in progress. Please try again later.',
          ),
        );
      }
      const resolvedModel = await this.runtime.aiEmployeesManager.resolveModel(
        employee,
        model,
      );
      const agentOptions = {
        ctx: ctx,
        repositories: this.repositories,
        runtime: this.runtime,
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
      const useLegacyWorkflow = conversation.category === 'task';
      if (shouldStream) {
        if (useLegacyWorkflow) {
          await new AIEmployee(agentOptions as AIEmployeeOptions).stream({
            messageId,
            userMessages: resendMessages.length ? resendMessages : undefined,
          });
        } else {
          const { service } = await createAIEmployeeAgentService(agentOptions);
          const agentContext = createAgentContext(
            ctx,
            this.repositories,
            this.runtime,
          );
          await new AgentSSEAdapter(
            (chunk) => streamTarget(execution).write(chunk),
            (chunk) =>
              this.runtime.llmStreamCachedManager
                .getCached(sessionId)
                .append(chunk),
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
        if (useLegacyWorkflow) {
          return await new AIEmployee(agentOptions as AIEmployeeOptions).invoke(
            {
              messageId,
              userMessages: resendMessages.length ? resendMessages : undefined,
            },
          );
        }
        const { service } = await createAIEmployeeAgentService(agentOptions);
        return service.forkInvoke(
          {
            messageId,
            userMessages: resendMessages.length ? resendMessages : undefined,
          },
          createAgentContext(ctx, this.repositories, this.runtime),
        );
      }
      return undefined;
    } catch (err: any) {
      ctx.logger?.error(err);
      let status = 500;
      let message = ctx.t!('Server unexpected error occur');
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
        return ctx.throw!(status, message);
      }
    }
  }

  async updateUserDecision({
    ctx,
    input,
    execution = {},
  }: {
    ctx: Context;
    input: Record<string, any>;
    execution?: ConversationRequestExecution;
  }) {
    ctx.requestExecution = execution;
    const userId = String(ctx.currentUser.id);
    const { sessionId, messageId, toolCallId, userDecision } = input;
    if (!sessionId) {
      return ctx.throw!(400);
    }
    const conversation =
      await this.runtime.aiConversationsManager.getConversation({
        sessionId,
        userId,
      });
    if (!conversation) {
      return ctx.throw!(400);
    }
    const message = await this.repositories.aiMessages.findOne({
      filter: { sessionId, messageId },
    });
    if (!message) {
      return ctx.throw!(400);
    }
    const messageConversation =
      await this.runtime.aiConversationsManager.getConversation({
        sessionId: message.sessionId,
        userId,
      });
    if (!messageConversation) {
      return ctx.throw!(400);
    }
    const toolCalls = message.toolCalls;
    if (!toolCalls?.length) {
      return ctx.throw!(400);
    }
    const selectedToolCall = toolCalls.find(
      (toolCall: { id?: string }) => toolCall.id === toolCallId,
    );
    if (!selectedToolCall) {
      return ctx.throw!(400);
    }
    if (selectedToolCall.name === EXECUTE_FRONTEND_TOOL_NAME) {
      const toolId = isRecord(selectedToolCall.args)
        ? selectedToolCall.args.toolId
        : undefined;
      const frontendTool =
        typeof toolId === 'string'
          ? await findCurrentFrontendTool(this.repositories, toolId, {
              sessionId: message.sessionId,
            })
          : undefined;
      if (!frontendTool) {
        return ctx.throw!(400, ctx.t!('Frontend tool is unavailable'));
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

    const toolsList = await ctx.ai.toolsManager.listTools({
      sessionId: message.sessionId,
      ctx: ctx,
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
    ctx,
    input,
    execution = {},
  }: {
    ctx: Context;
    input: Record<string, any>;
    execution?: ConversationRequestExecution;
  }) {
    ctx.requestExecution = execution;
    const userId = String(ctx.currentUser.id);
    setupSSEHeaders(ctx);
    const { sessionId, messageId, model, webSearch } = input;
    if (!sessionId) {
      sendErrorResponse(streamTarget(execution), 'sessionId is required');
      return;
    }
    try {
      const conversation =
        await this.runtime.aiConversationsManager.getConversation({
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
        await this.runtime.aiConversationsManager.getConversation({
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
      const resolvedModel = await this.runtime.aiEmployeesManager.resolveModel(
        employee,
        model,
      );
      const agentOptions = {
        ctx: ctx,
        repositories: this.repositories,
        runtime: this.runtime,
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
      const userDecisions =
        await this.runtime.aiConversationsManager.getUserDecisions(
          message.messageId,
        );
      if (conversation.category === 'task') {
        await new AIEmployee(agentOptions as AIEmployeeOptions).stream({
          userDecisions,
        });
      } else {
        const { service } = await createAIEmployeeAgentService(agentOptions);
        await new AgentSSEAdapter(
          (chunk) => streamTarget(execution).write(chunk),
          (chunk) =>
            this.runtime.llmStreamCachedManager
              .getCached(sessionId)
              .append(chunk),
        ).consume(
          service.resumeStream(
            { userDecisions },
            createAgentContext(ctx, this.repositories, this.runtime),
          ),
        );
        streamTarget(execution).end();
      }
    } catch (err: any) {
      ctx.logger?.error(err);
      sendErrorResponse(
        streamTarget(execution),
        err.message || 'Tool call error',
      );
      if (!streamTarget(execution).writableEnded) streamTarget(execution).end();
    }
  }
}
