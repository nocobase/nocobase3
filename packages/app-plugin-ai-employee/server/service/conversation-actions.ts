/**
 * Conversation actions for the flattened App Context.
 *
 * Each exported function mirrors the original action behaviour including
 * middleware semantics, SSE error envelopes, parallel-limit checks and the
 * `AIEmployee` streaming / invocation flows.
 */

import type { Context } from '@nocobase/ai-employee';
import {
  ResourceActionError,
  sendSSEError,
  type AIEmployeeEntity,
  type AIMessageInput,
} from '@nocobase/ai-employee';
import type {
  AIMessageEntity,
  AIToolMessageEntity,
} from '../repository/index.js';
import { AIEmployee } from '../ai-employees/ai-employee.js';
import { AgentSSEAdapter } from '../agent/sse.js';
import { createAIEmployeeAgentService } from '../agent/ai-employee/index.js';
import { EXECUTE_FRONTEND_TOOL_NAME } from '../ai-employees/common/frontend-tools.js';
import { findCurrentFrontendTool } from '../ai-employees/frontend-tools.js';

async function getAIEmployee(
  ctx: Context,
  username: string,
): Promise<AIEmployeeEntity | null> {
  const employee = await ctx.repositories.aiEmployees.findOne({
    filter: { username },
  });
  return employee;
}

export async function prependCancelledToolContinuation(
  ctx: Pick<Context, 'repositories'>,
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
  const assistantMessage = await ctx.repositories.aiMessages.findOne({
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

export function isAIEmployeeEnabled(
  _ctx: Context,
  employee: AIEmployeeEntity | null | undefined,
): boolean {
  return employee?.enabled !== false;
}

function setupSSEHeaders(ctx: Context) {
  // Headers are applied by the router when constructing the SSE Response.
}

function sendErrorResponse(ctx: Context, errorMessage: string) {
  sendSSEError(ctx as any, errorMessage);
}

async function loginInCheck(ctx: Context) {
  const userId = String(ctx.currentUser.id);
  if (!userId) {
    return ctx.throw(403);
  }
}

const isReachParallelLimit = async (ctx: Context) => {
  const userId = String(ctx.currentUser.id);
  const activeStreamCount = await ctx.repositories.aiConversations.count({
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
    const repository = ctx.repositories.aiMessages;
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

export function normalizeIncomingMessageAttachments(
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
        : attachment.id != null || attachment.filterByTk != null
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

export async function chatList(ctx: Context) {
  await loginInCheck(ctx);
  const userId = String(ctx.currentUser.id);
  const params = ctx.action?.params ?? {};
  const filter = isRecord(params.filter) ? params.filter : {};
  const scope = params.scope;
  const where: Record<string, any> = {
    ...filter,
    userId,
    from: filter.from ?? 'main-agent',
    category: 'chat',
    ...(typeof scope === 'string' && scope ? { scope } : {}),
  };
  const rows = await ctx.repositories.aiConversations.find({
    filter: where,
    sort: ['-updatedAt'],
  });
  return rows;
}

export async function chatUnreadCount(ctx: Context) {
  const userId = String(ctx.currentUser.id);
  const count = await ctx.repositories.aiConversations.count({
    filter: {
      userId,
      read: false,
      from: 'main-agent',
      category: 'chat',
    },
  });
  return { count };
}

export async function chatUnreadCounts(ctx: Context) {
  const userId = String(ctx.currentUser.id);
  const conversationUnreadCount = await ctx.repositories.aiConversations.count({
    filter: { userId, read: false, from: 'main-agent', category: 'chat' },
  });
  const workflowTaskUnreadCount = 0;
  return { conversationUnreadCount, workflowTaskUnreadCount };
}

export async function chatCreate(ctx: Context) {
  const userId = String(ctx.currentUser.id);
  const {
    aiEmployee,
    systemMessage,
    skillSettings,
    conversationSettings,
    modelSettings,
    scope,
  } = ctx.action?.params?.values || {};
  if (!aiEmployee?.username) {
    return ctx.throw(400, 'AI employee is required');
  }
  const normalizedScope = typeof scope === 'string' ? scope : undefined;
  const employee = await getAIEmployee(ctx, aiEmployee.username);
  if (!employee) {
    return ctx.throw(400, 'AI employee not found');
  }
  if (!isAIEmployeeEnabled(ctx, employee)) {
    return ctx.throw(400, 'AI employee is disabled');
  }

  try {
    return await ctx.aiConversationsManager.create({
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
      return ctx.throw(400, error.message);
    }
    throw error;
  }
}

export async function chatUpdate(ctx: Context) {
  const userId = String(ctx.currentUser.id);
  const { filterByTk: sessionId } = ctx.action?.params ?? {};
  if (typeof sessionId !== 'string' || !sessionId) {
    return ctx.throw(400, 'invalid sessionId');
  }
  const { title } = ctx.action?.params?.values || {};
  return await ctx.aiConversationsManager.update({ userId, sessionId, title });
}

export async function chatUpdateOptions(ctx: Context) {
  const userId = String(ctx.currentUser.id);
  const { filterByTk: sessionId } = ctx.action?.params ?? {};
  if (!sessionId) {
    return ctx.throw(400, 'invalid sessionId');
  }
  const { systemMessage, skillSettings, conversationSettings, modelSettings } =
    ctx.action?.params?.values || {};
  if (
    !systemMessage &&
    !skillSettings &&
    !conversationSettings &&
    !modelSettings
  ) {
    return ctx.throw(400, 'invalid options');
  }
  try {
    return await ctx.aiConversationsManager.update({
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
      return ctx.throw(400, error.message);
    }
    throw error;
  }
}

export async function chatDestroy(ctx: Context) {
  const userId = String(ctx.currentUser.id);
  const params = ctx.action?.params ?? {};
  const filter = isRecord(params.filter) ? params.filter : {};
  const filterByTk = params.filterByTk;
  const where: Record<string, any> = {
    ...filter,
    userId,
  };
  if (filterByTk) where.sessionId = filterByTk;
  await ctx.repositories.aiConversations.destroy({ filter: where });
  return null;
}

export async function chatGetMessages(ctx: Context) {
  const userId = String(ctx.currentUser.id);
  const {
    sessionId,
    cursor,
    updateRead: originalUpdateRead,
  } = ctx.action?.params || {};
  if (!sessionId) {
    return ctx.throw(400);
  }
  const paginate = ctx.action?.params?.paginate === 'false' ? false : true;
  const updateRead =
    originalUpdateRead === 'true' || originalUpdateRead === true;
  try {
    return await ctx.aiConversationsManager.getMessages({
      userId,
      sessionId,
      cursor,
      paginate,
      updateRead,
    });
  } catch (error: any) {
    if (error.message === 'invalid sessionId') {
      return ctx.throw(400);
    }
    throw error;
  }
}

export async function chatUpdateToolArgs(ctx: Context) {
  const userId = String(ctx.currentUser.id);
  const { sessionId, messageId, tool } = ctx.action?.params?.values || {};
  if (!sessionId) {
    return ctx.throw(400);
  }
  const conversation = await ctx.aiConversationsManager.getConversation({
    sessionId,
    userId,
  });
  if (!conversation) {
    return ctx.throw(400);
  }
  const messageRepository = ctx.repositories.aiMessages;
  const message = await messageRepository.findOne({
    filter: { sessionId, messageId },
  });
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

export async function chatSendMessages(ctx: Context) {
  const userId = String(ctx.currentUser.id);
  const {
    sessionId,
    aiEmployee: employeeName,
    messages,
    editingMessageId,
    model,
    webSearch,
    stream = true,
  } = ctx.action?.params?.values || {};

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

    const conversation = await ctx.aiConversationsManager.getConversation({
      sessionId,
      userId,
    });
    if (!conversation) {
      throw new ResourceActionError(400, ctx.t!('conversation not found'));
    }

    const employee = await getAIEmployee(ctx, employeeName);
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
        await ctx.repositories.aiConversations.update({
          filter: { sessionId, userId },
          values: { title },
        });
        conversation.title = title;
      }
    }

    if (await isReachParallelLimit(ctx)) {
      await saveUserMessages(ctx, sessionId, messages, editingMessageId);
      throw new ResourceActionError(
        400,
        ctx.t!('There are conversations in progress. Please try again later.'),
      );
    }
    const useInitialThread = conversation.thread === 0;
    const resolvedModel = await ctx.aiEmployeesManager.resolveModel(
      employee,
      model,
    );
    const agentOptions = {
      ctx: ctx,
      employee,
      sessionId,
      systemMessage: conversation.options?.systemMessage,
      skillSettings: conversation.options?.skillSettings,
      tools: conversation.options?.tools,
      webSearch,
      model: resolvedModel,
      legacy: useInitialThread,
    };
    const useLegacyWorkflow = conversation.category === 'task';
    const aiEmployee = useLegacyWorkflow ? new AIEmployee(agentOptions) : null;
    const agent = useLegacyWorkflow
      ? null
      : await createAIEmployeeAgentService(agentOptions);
    const runStream = async (request: any) => {
      if (aiEmployee) return aiEmployee.stream(request);
      const adapter = new AgentSSEAdapter(
        (chunk) => ctx.res.write(chunk),
        (chunk) =>
          ctx.llmStreamCachedManager.getCached(sessionId).append(chunk),
      );
      await adapter.consume(
        request?.messageId
          ? agent.service.forkStream(request)
          : agent.service.stream(request),
      );
      ctx.res.end();
      return true;
    };
    const runInvoke = (request: any) =>
      aiEmployee
        ? aiEmployee.invoke(request)
        : request?.messageId
          ? agent.service.forkInvoke(request)
          : agent.service.invoke(request);
    const cancelToolCall = () =>
      aiEmployee ? aiEmployee.cancelToolCall() : agent.facade.cancelToolCall();
    if (!editingMessageId) {
      if (await ctx.subAgentsDispatcher.isInterrupted(ctx)) {
        const userDecisions = await ctx.subAgentsDispatcher.reject(ctx);
        if (userDecisions) {
          if (shouldStream) {
            await runStream({ userDecisions });
          } else {
            ctx.body = await runInvoke({ userDecisions });
          }
          return ctx.body;
        }
      } else {
        const toolMessages = await cancelToolCall();
        if (toolMessages?.length) {
          await prependCancelledToolContinuation(
            ctx,
            sessionId,
            messages,
            toolMessages,
          );
        }
      }
    }

    if (shouldStream) {
      await runStream({ userMessages: messages, messageId: editingMessageId });
    } else {
      ctx.body = await runInvoke({
        userMessages: messages,
        messageId: editingMessageId,
      });
    }
    return ctx.body;
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
      sendErrorResponse(ctx, message);
      if (!(ctx.res as any).writableEnded) ctx.res.end();
    } else {
      return ctx.throw(status, message);
    }
  }
}

export async function chatAbort(ctx: Context) {
  const userId = String(ctx.currentUser.id);
  const { sessionId } = ctx.action?.params?.values || {};
  if (typeof sessionId !== 'string' || !sessionId) {
    return ctx.throw(400, 'sessionId is required');
  }
  const conversation = await ctx.aiConversationsManager.getConversation({
    sessionId,
    userId,
  });
  if (!conversation) {
    return ctx.throw(404, 'conversation not found');
  }
  ctx.aiEmployeesManager.abortConversation(sessionId);
  return null;
}

export async function chatResumeStream(ctx: Context) {
  const userId = String(ctx.currentUser.id);
  const abortController = new AbortController();
  const abortStream = () => abortController.abort();
  const target = ctx.res as any;
  const shouldStopStream = () =>
    abortController.signal.aborted || target.destroyed || target.writableEnded;
  setupSSEHeaders(ctx);

  const sessionId =
    ctx.action?.params?.sessionId ||
    ctx.action?.params?.values?.sessionId ||
    ctx.action?.params?.filterByTk;
  if (!sessionId) {
    sendErrorResponse(ctx, 'sessionId is required');
    return;
  }

  ctx.req?.once?.('aborted', abortStream);

  try {
    const conversation = await ctx.aiConversationsManager.getConversation({
      sessionId,
      userId,
    });
    if (shouldStopStream()) {
      return;
    }
    if (!conversation) {
      sendErrorResponse(ctx, 'conversation not found');
      return;
    }
    const reachLimit = await isReachParallelLimit(ctx);
    if (shouldStopStream()) {
      return;
    }

    let hasChunks = false;
    if (!reachLimit) {
      for await (const chunk of ctx.llmStreamCachedManager
        .getCached(sessionId)
        .stream({ signal: abortController.signal })) {
        if (shouldStopStream()) {
          break;
        }
        hasChunks = true;
        ctx.res.write(chunk);
      }
    }

    if (!hasChunks && !shouldStopStream()) {
      const currentConversation =
        await ctx.aiConversationsManager.getConversation({ sessionId, userId });
      const llmActiveState = currentConversation?.llmActiveState;
      if (llmActiveState && llmActiveState !== 'idle') {
        ctx.res.write(
          `data: ${JSON.stringify({ type: 'chunks_cache_missing', body: { llmActiveState } })}\n\n`,
        );
      }
    }
  } catch (err: any) {
    if (shouldStopStream()) {
      return;
    }
    ctx.logger?.error(err);
    sendErrorResponse(ctx, err.message || 'Resume stream error');
    return;
  } finally {
    ctx.req?.off?.('aborted', abortStream);
    if (!shouldStopStream()) {
      ctx.res.end();
    }
  }
}

export async function chatResendMessages(ctx: Context) {
  const userId = String(ctx.currentUser.id);
  const {
    sessionId,
    webSearch,
    model,
    stream = true,
  } = ctx.action?.params?.values || {};
  let { messageId } = ctx.action?.params?.values || {};

  const shouldStream = stream !== false;
  if (shouldStream) {
    setupSSEHeaders(ctx);
  }

  try {
    if (!sessionId) {
      throw new ResourceActionError(400, ctx.t!('sessionId is required'));
    }
    const conversation = await ctx.aiConversationsManager.getConversation({
      sessionId,
      userId,
    });
    if (!conversation) {
      throw new ResourceActionError(400, ctx.t!('conversation not found'));
    }
    const employee = await getAIEmployee(ctx, conversation.aiEmployeeUsername);
    if (!employee) {
      throw new ResourceActionError(400, ctx.t!('AI employee not found'));
    }

    const resendMessages: AIMessageInput[] = [];
    if (messageId) {
      const message = await ctx.repositories.aiMessages.findOne({
        filter: { sessionId, messageId },
      });
      if (!message) {
        throw new ResourceActionError(400, ctx.t!('message not found'));
      }
    } else {
      const message = await ctx.repositories.aiMessages.findOne({
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

    if (await isReachParallelLimit(ctx)) {
      throw new ResourceActionError(
        400,
        ctx.t!('There are conversations in progress. Please try again later.'),
      );
    }
    const resolvedModel = await ctx.aiEmployeesManager.resolveModel(
      employee,
      model,
    );
    const agentOptions = {
      ctx: ctx,
      employee,
      sessionId,
      systemMessage: conversation.options?.systemMessage,
      skillSettings: conversation.options?.skillSettings,
      tools: conversation.options?.tools,
      webSearch,
      model: resolvedModel,
    };
    const useLegacyWorkflow = conversation.category === 'task';
    if (shouldStream) {
      if (useLegacyWorkflow) {
        await new AIEmployee(agentOptions).stream({
          messageId,
          userMessages: resendMessages.length ? resendMessages : undefined,
        });
      } else {
        const { service } = await createAIEmployeeAgentService(agentOptions);
        await new AgentSSEAdapter(
          (chunk) => ctx.res.write(chunk),
          (chunk) =>
            ctx.llmStreamCachedManager.getCached(sessionId).append(chunk),
        ).consume(
          service.forkStream({
            messageId,
            userMessages: resendMessages.length ? resendMessages : undefined,
          }),
        );
        ctx.res.end();
      }
    } else {
      ctx.body = useLegacyWorkflow
        ? await new AIEmployee(agentOptions).invoke({
            messageId,
            userMessages: resendMessages.length ? resendMessages : undefined,
          })
        : await (
            await createAIEmployeeAgentService(agentOptions)
          ).service.forkInvoke({
            messageId,
            userMessages: resendMessages.length ? resendMessages : undefined,
          });
    }
    return ctx.body;
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
      sendErrorResponse(ctx, message);
      if (!(ctx.res as any).writableEnded) ctx.res.end();
    } else {
      return ctx.throw(status, message);
    }
  }
}

export async function chatUpdateUserDecision(ctx: Context) {
  const userId = String(ctx.currentUser.id);
  const { sessionId, messageId, toolCallId, userDecision } =
    ctx.action?.params?.values || {};
  if (!sessionId) {
    return ctx.throw(400);
  }
  const conversation = await ctx.aiConversationsManager.getConversation({
    sessionId,
    userId,
  });
  if (!conversation) {
    return ctx.throw(400);
  }
  const message = await ctx.repositories.aiMessages.findOne({
    filter: { sessionId, messageId },
  });
  if (!message) {
    return ctx.throw(400);
  }
  const messageConversation = await ctx.aiConversationsManager.getConversation({
    sessionId: message.sessionId,
    userId,
  });
  if (!messageConversation) {
    return ctx.throw(400);
  }
  const toolCalls = message.toolCalls;
  if (!toolCalls?.length) {
    return ctx.throw(400);
  }
  const selectedToolCall = toolCalls.find(
    (toolCall: { id?: string }) => toolCall.id === toolCallId,
  );
  if (!selectedToolCall) {
    return ctx.throw(400);
  }
  if (selectedToolCall.name === EXECUTE_FRONTEND_TOOL_NAME) {
    const toolId = isRecord(selectedToolCall.args)
      ? selectedToolCall.args.toolId
      : undefined;
    const frontendTool =
      typeof toolId === 'string'
        ? await findCurrentFrontendTool(ctx, toolId, message.sessionId)
        : undefined;
    if (!frontendTool) {
      return ctx.throw(400, ctx.t!('Frontend tool is unavailable'));
    }
  }

  const updated = await ctx.repositories.aiToolMessages.update({
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
  const toolMessages = await ctx.repositories.aiToolMessages.find({
    filter: {
      sessionId: message.sessionId,
      messageId: message.messageId,
      toolCallId: { $in: toolCallIds },
    },
  });
  const toolMessageMap = new Map<string, AIToolMessageEntity>(
    toolMessages.map((toolMessage) => [toolMessage.toolCallId, toolMessage]),
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

export async function chatResumeToolCall(ctx: Context) {
  const userId = String(ctx.currentUser.id);
  setupSSEHeaders(ctx);
  const { sessionId, messageId, model, webSearch } =
    ctx.action?.params?.values || {};
  if (!sessionId) {
    sendErrorResponse(ctx, 'sessionId is required');
    return;
  }
  try {
    const conversation = await ctx.aiConversationsManager.getConversation({
      sessionId,
      userId,
    });
    if (!conversation) {
      sendErrorResponse(ctx, 'conversation not found');
      return;
    }
    const employee = await getAIEmployee(ctx, conversation.aiEmployeeUsername);
    if (!employee) {
      sendErrorResponse(ctx, 'AI employee not found');
      return;
    }

    let message: AIMessageEntity | null;
    if (messageId) {
      message = await ctx.repositories.aiMessages.findOne({
        filter: { sessionId, messageId },
      });
    } else {
      message = await ctx.repositories.aiMessages.findOne({
        filter: { sessionId },
        sort: ['-messageId'],
      });
    }
    if (!message) {
      sendErrorResponse(ctx, 'message not found');
      return;
    }
    const messageConversation =
      await ctx.aiConversationsManager.getConversation({
        sessionId: message.sessionId,
        userId,
      });
    if (!messageConversation) {
      sendErrorResponse(ctx, 'conversation not found');
      return;
    }
    const tools = message.toolCalls;
    if (!tools?.length) {
      sendErrorResponse(ctx, 'No tool calls found');
      return;
    }
    const resolvedModel = await ctx.aiEmployeesManager.resolveModel(
      employee,
      model,
    );
    const agentOptions = {
      ctx: ctx,
      employee,
      sessionId,
      systemMessage: conversation.options?.systemMessage,
      skillSettings: conversation.options?.skillSettings,
      tools: conversation.options?.tools,
      webSearch,
      model: resolvedModel,
    };
    const userDecisions = await ctx.aiConversationsManager.getUserDecisions(
      message.messageId,
    );
    if (conversation.category === 'task') {
      await new AIEmployee(agentOptions).stream({ userDecisions });
    } else {
      const { service } = await createAIEmployeeAgentService(agentOptions);
      await new AgentSSEAdapter(
        (chunk) => ctx.res.write(chunk),
        (chunk) =>
          ctx.llmStreamCachedManager.getCached(sessionId).append(chunk),
      ).consume(service.resumeStream({ userDecisions }));
      ctx.res.end();
    }
  } catch (err: any) {
    ctx.logger?.error(err);
    sendErrorResponse(ctx, err.message || 'Tool call error');
    if (!(ctx.res as any).writableEnded) ctx.res.end();
  }
}
