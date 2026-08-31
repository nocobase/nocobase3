import type { Context as HonoContext, Hono } from 'hono';
import { createAISSEStreamResponse, requiredString } from './utils.js';

export function createAIConversationsRouter(app: Hono): void {
  app.get('/aiConversations:list', async (context) => {
    const ctx = context.var.ctx;
    const result = await ctx.aiConversationService.list(ctx, {
      scope: context.req.query('scope') || undefined,
      keyword: context.req.query('keyword') || undefined,
    });
    return context.json(result as never);
  });

  app.get('/aiConversations:unreadCounts', async (context) => {
    const ctx = context.var.ctx;
    const result = await ctx.aiConversationService.unreadCounts(ctx);
    return context.json(result as never);
  });

  app.get('/aiConversations:unreadCount', async (context) => {
    const ctx = context.var.ctx;
    const result = (await ctx.aiConversationService.unreadCounts(ctx))
      .conversationUnreadCount;
    return context.json(result as never);
  });

  app.get('/aiConversations:getMessages', async (context) => {
    const ctx = context.var.ctx;
    const result = await ctx.aiConversationService.getMessages(ctx, {
      sessionId: requiredQuery(context, 'sessionId'),
      cursor: context.req.query('cursor') || undefined,
      paginate: context.req.query('paginate') !== 'false',
      updateRead: context.req.query('updateRead') === 'true',
    });
    return context.json(result as never);
  });

  app.get('/aiConversations:get', async (context) => {
    const ctx = context.var.ctx;
    const sessionId = requiredQuery(context, 'sessionId');
    const conversation = await ctx.repositories.aiConversations.findOne({
      filter: { sessionId, userId: ctx.currentUser.id },
    });
    const result = {
      llmActiveState: conversation?.llmActiveState ?? 'idle',
    };
    return context.json(result as never);
  });

  app.post('/aiConversations:create', async (context) => {
    const ctx = context.var.ctx;
    const result = await ctx.aiConversationService.create(
      ctx,
      await jsonObject(context),
    );
    return context.json(result as never);
  });

  app.put('/aiConversations:update', async (context) => {
    const ctx = context.var.ctx;
    const result = await ctx.aiConversationService.update(
      ctx,
      requiredQuery(context, 'sessionId'),
      await jsonObject(context),
    );
    return context.json(result as never);
  });

  app.put('/aiConversations:updateOptions', async (context) => {
    const ctx = context.var.ctx;
    const result = await ctx.aiConversationService.updateOptions(
      ctx,
      requiredQuery(context, 'sessionId'),
      await jsonObject(context),
    );
    return context.json(result as never);
  });

  app.delete('/aiConversations:destroy', async (context) => {
    const ctx = context.var.ctx;
    const result = await ctx.aiConversationService.destroy(ctx, {
      sessionId: requiredQuery(context, 'sessionId'),
    });
    return context.json(result as never);
  });

  app.post('/aiConversations:sendMessages', async (context) => {
    const ctx = context.var.ctx;
    const request = context.req.raw;
    return createAISSEStreamResponse(
      context,
      'aiConversations:sendMessages',
      async (target) => {
        const input = await jsonObject(context);
        return ctx.aiConversationService.sendMessages(
          ctx,
          input,
          execution(input, target, request.signal),
        );
      },
    );
  });

  app.post('/aiConversations:resendMessages', async (context) => {
    const ctx = context.var.ctx;
    const request = context.req.raw;
    return createAISSEStreamResponse(
      context,
      'aiConversations:resendMessages',
      async (target) => {
        const input = await jsonObject(context);
        return ctx.aiConversationService.resendMessages(
          ctx,
          input,
          execution(input, target, request.signal),
        );
      },
    );
  });

  app.post('/aiConversations:updateUserDecision', async (context) => {
    const ctx = context.var.ctx;
    const input = await jsonObject(context);
    const result = await ctx.aiConversationService.updateUserDecision(
      ctx,
      input,
      execution(input),
    );
    return context.json(result as never);
  });

  app.post('/aiConversations:resumeToolCall', async (context) => {
    const ctx = context.var.ctx;
    const request = context.req.raw;
    return createAISSEStreamResponse(
      context,
      'aiConversations:resumeToolCall',
      async (target) => {
        const input = await jsonObject(context);
        return ctx.aiConversationService.resumeToolCall(
          ctx,
          input,
          execution(input, target, request.signal),
        );
      },
    );
  });

  app.post('/aiConversations:resumeStream', async (context) => {
    const ctx = context.var.ctx;
    const request = context.req.raw;
    return createAISSEStreamResponse(
      context,
      'aiConversations:resumeStream',
      async (target) => {
        const input = await jsonObject(context);
        return ctx.aiConversationService.resumeStream(
          ctx,
          { sessionId: requiredString(input.sessionId, 'sessionId') },
          execution(input, target, request.signal),
        );
      },
    );
  });

  app.post('/aiConversations:abort', async (context) => {
    const ctx = context.var.ctx;
    const input = await jsonObject(context);
    const result = await ctx.aiConversationService.abort(ctx, {
      sessionId: requiredString(input.sessionId, 'sessionId'),
    });
    return context.json(result as never);
  });

  app.post('/aiConversations:updateToolArgs', async (context) => {
    const ctx = context.var.ctx;
    const result = await ctx.aiConversationService.updateToolArgs(
      ctx,
      await jsonObject(context),
    );
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
  streamTarget?: import('../context.js').StreamTarget,
  abortSignal?: AbortSignal,
): import('../context.js').ConversationRequestExecution {
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
