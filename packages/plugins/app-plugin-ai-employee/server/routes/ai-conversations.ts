import type { ServiceFactory } from '../service/factory.js';
import type { Context as HonoContext, Hono } from 'hono';
import { createAISSEStreamResponse, requiredString } from './utils.js';

export function createAIConversationsRouter(
  app: Hono,
  services: ServiceFactory,
): void {
  app.get('/aiConversations:list', async (context) => {
    const ctx = services.createRequestRuntime(
      context.var.currentUser,
      context.req.raw,
    );
    const result = await services.conversationService.list({
      ctx,
      options: {
        scope: context.req.query('scope') || undefined,
        keyword: context.req.query('keyword') || undefined,
      },
    });
    return context.json(result as never);
  });

  app.get('/aiConversations:unreadCounts', async (context) => {
    const ctx = services.createRequestRuntime(
      context.var.currentUser,
      context.req.raw,
    );
    const result = await services.conversationService.unreadCounts({ ctx });
    return context.json(result as never);
  });

  app.get('/aiConversations:unreadCount', async (context) => {
    const ctx = services.createRequestRuntime(
      context.var.currentUser,
      context.req.raw,
    );
    const result = (await services.conversationService.unreadCounts({ ctx }))
      .conversationUnreadCount;
    return context.json(result as never);
  });

  app.get('/aiConversations:getMessages', async (context) => {
    const ctx = services.createRequestRuntime(
      context.var.currentUser,
      context.req.raw,
    );
    const result = await services.conversationService.getMessages({
      ctx,
      options: {
        sessionId: requiredQuery(context, 'sessionId'),
        cursor: context.req.query('cursor') || undefined,
        paginate: context.req.query('paginate') !== 'false',
        updateRead: context.req.query('updateRead') === 'true',
      },
    });
    return context.json(result as never);
  });

  app.get('/aiConversations:get', async (context) => {
    const result = await services.conversationService.getActiveState({
      actorId: context.var.currentUser.id,
      sessionId: requiredQuery(context, 'sessionId'),
    });
    return context.json(result as never);
  });

  app.post('/aiConversations:create', async (context) => {
    const ctx = services.createRequestRuntime(
      context.var.currentUser,
      context.req.raw,
    );
    const result = await services.conversationService.create({
      ctx,
      input: await jsonObject(context),
    });
    return context.json(result as never);
  });

  app.put('/aiConversations:update', async (context) => {
    const ctx = services.createRequestRuntime(
      context.var.currentUser,
      context.req.raw,
    );
    const result = await services.conversationService.update({
      ctx,
      sessionId: requiredQuery(context, 'sessionId'),
      input: await jsonObject(context),
    });
    return context.json(result as never);
  });

  app.put('/aiConversations:updateOptions', async (context) => {
    const ctx = services.createRequestRuntime(
      context.var.currentUser,
      context.req.raw,
    );
    const result = await services.conversationService.updateOptions({
      ctx,
      sessionId: requiredQuery(context, 'sessionId'),
      input: await jsonObject(context),
    });
    return context.json(result as never);
  });

  app.delete('/aiConversations:destroy', async (context) => {
    const ctx = services.createRequestRuntime(
      context.var.currentUser,
      context.req.raw,
    );
    const result = await services.conversationService.destroy({
      ctx,
      options: { sessionId: requiredQuery(context, 'sessionId') },
    });
    return context.json(result as never);
  });

  app.post('/aiConversations:sendMessages', async (context) => {
    const ctx = services.createRequestRuntime(
      context.var.currentUser,
      context.req.raw,
    );
    const request = context.req.raw;
    return createAISSEStreamResponse(
      context,
      'aiConversations:sendMessages',
      async (target) => {
        const input = await jsonObject(context);
        return services.conversationService.sendMessages({
          ctx,
          input,
          execution: execution(input, target, request.signal),
        });
      },
    );
  });

  app.post('/aiConversations:resendMessages', async (context) => {
    const ctx = services.createRequestRuntime(
      context.var.currentUser,
      context.req.raw,
    );
    const request = context.req.raw;
    return createAISSEStreamResponse(
      context,
      'aiConversations:resendMessages',
      async (target) => {
        const input = await jsonObject(context);
        return services.conversationService.resendMessages({
          ctx,
          input,
          execution: execution(input, target, request.signal),
        });
      },
    );
  });

  app.post('/aiConversations:updateUserDecision', async (context) => {
    const ctx = services.createRequestRuntime(
      context.var.currentUser,
      context.req.raw,
    );
    const input = await jsonObject(context);
    const result = await services.conversationService.updateUserDecision({
      ctx,
      input,
      execution: execution(input),
    });
    return context.json(result as never);
  });

  app.post('/aiConversations:resumeToolCall', async (context) => {
    const ctx = services.createRequestRuntime(
      context.var.currentUser,
      context.req.raw,
    );
    const request = context.req.raw;
    return createAISSEStreamResponse(
      context,
      'aiConversations:resumeToolCall',
      async (target) => {
        const input = await jsonObject(context);
        return services.conversationService.resumeToolCall({
          ctx,
          input,
          execution: execution(input, target, request.signal),
        });
      },
    );
  });

  app.post('/aiConversations:resumeStream', async (context) => {
    const ctx = services.createRequestRuntime(
      context.var.currentUser,
      context.req.raw,
    );
    const request = context.req.raw;
    return createAISSEStreamResponse(
      context,
      'aiConversations:resumeStream',
      async (target) => {
        const input = await jsonObject(context);
        return services.conversationService.resumeStream({
          ctx,
          input: { sessionId: requiredString(input.sessionId, 'sessionId') },
          execution: execution(input, target, request.signal),
        });
      },
    );
  });

  app.post('/aiConversations:abort', async (context) => {
    const ctx = services.createRequestRuntime(
      context.var.currentUser,
      context.req.raw,
    );
    const input = await jsonObject(context);
    const result = await services.conversationService.abort({
      ctx,
      input: { sessionId: requiredString(input.sessionId, 'sessionId') },
    });
    return context.json(result as never);
  });

  app.post('/aiConversations:updateToolArgs', async (context) => {
    const ctx = services.createRequestRuntime(
      context.var.currentUser,
      context.req.raw,
    );
    const result = await services.conversationService.updateToolArgs({
      ctx,
      input: await jsonObject(context),
    });
    return context.json(result as never);
  });
}

async function jsonObject(context: HonoContext): Promise<Record<string, any>> {
  const value = await context.req.json<unknown>();
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('JSON body must be an object');
  }
  return value as Record<string, any>;
}

function requiredQuery(context: HonoContext, name: string): string {
  return requiredString(context.req.query(name), name);
}

function execution(
  input: Record<string, any>,
  streamTarget?: import('../internal/runtime-context.js').StreamTarget,
  abortSignal?: AbortSignal,
): import('../internal/runtime-context.js').ConversationRequestExecution {
  return {
    sessionId:
      typeof input.sessionId === 'string' ? input.sessionId : undefined,
    messageId:
      typeof input.messageId === 'string' ? input.messageId : undefined,
    messages: Array.isArray(input.messages) ? input.messages : undefined,
    model: input.model,
    webSearch: input.webSearch === true,
    important:
      typeof input.important === 'string' ? input.important : undefined,
    frontendTools: Array.isArray(input.frontendTools)
      ? input.frontendTools
      : undefined,
    toolCallResults: Array.isArray(input.toolCallResults)
      ? input.toolCallResults
      : undefined,
    streamTarget,
    abortSignal,
  };
}
