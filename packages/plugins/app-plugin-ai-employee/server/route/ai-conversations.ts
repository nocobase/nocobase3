import type { ServiceFactory } from '../factory/service-factory.js';
import type { Context as HonoContext, Hono } from 'hono';
import type { ConversationExecution } from '../agent/contracts.js';
import type { ConversationStreamTarget } from '../types.js';
import { identityTranslate } from '../types.js';
import { createAISSEStreamResponse, requiredString } from './utils.js';

export function createAIConversationsRouter(
  app: Hono,
  services: ServiceFactory,
): void {
  app.get('/aiConversations:list', async (context) => {
    const actor = context.var.currentUser;
    const result = await services.conversationService.list({
      actorId: actor.id,
      scope: actor.scope,
      options: {
        keyword: context.req.query('keyword') || undefined,
      },
    });
    return context.json(result as never);
  });

  app.get('/aiConversations:unreadCounts', async (context) => {
    const result = await services.conversationService.unreadCounts({
      actorId: context.var.currentUser.id,
    });
    return context.json(result as never);
  });

  app.get('/aiConversations:unreadCount', async (context) => {
    const result = (
      await services.conversationService.unreadCounts({
        actorId: context.var.currentUser.id,
      })
    ).conversationUnreadCount;
    return context.json(result as never);
  });

  app.get('/aiConversations:getMessages', async (context) => {
    const result = await services.conversationService.getMessages({
      actorId: context.var.currentUser.id,
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
    const result = await services.conversationService.create({
      actorId: context.var.currentUser.id,
      input: await jsonObject(context),
    });
    return context.json(result as never);
  });

  app.put('/aiConversations:update', async (context) => {
    const result = await services.conversationService.update({
      actorId: context.var.currentUser.id,
      sessionId: requiredQuery(context, 'sessionId'),
      input: await jsonObject(context),
    });
    return context.json(result as never);
  });

  app.put('/aiConversations:updateOptions', async (context) => {
    const result = await services.conversationService.updateOptions({
      actorId: context.var.currentUser.id,
      sessionId: requiredQuery(context, 'sessionId'),
      input: await jsonObject(context),
    });
    return context.json(result as never);
  });

  app.delete('/aiConversations:destroy', async (context) => {
    const result = await services.conversationService.destroy({
      actorId: context.var.currentUser.id,
      options: { sessionId: requiredQuery(context, 'sessionId') },
    });
    return context.json(result as never);
  });

  app.post('/aiConversations:sendMessages', async (context) =>
    createConversationSSE(
      context,
      'aiConversations:sendMessages',
      (input, target) =>
        services.conversationService.sendMessages({
          actor: context.var.currentUser,
          input,
          execution: execution(context, input, target),
          translate: identityTranslate,
          getHeader: (name) => context.req.header(name),
        }),
    ),
  );

  app.post('/aiConversations:resendMessages', async (context) =>
    createConversationSSE(
      context,
      'aiConversations:resendMessages',
      (input, target) =>
        services.conversationService.resendMessages({
          actor: context.var.currentUser,
          input,
          execution: execution(context, input, target),
          translate: identityTranslate,
          getHeader: (name) => context.req.header(name),
        }),
    ),
  );

  app.post('/aiConversations:updateUserDecision', async (context) => {
    const input = await jsonObject(context);
    const result = await services.conversationService.updateUserDecision({
      actor: context.var.currentUser,
      input,
      execution: execution(context, input),
      translate: identityTranslate,
      getHeader: (name) => context.req.header(name),
    });
    return context.json(result as never);
  });

  app.post('/aiConversations:resumeToolCall', async (context) =>
    createConversationSSE(
      context,
      'aiConversations:resumeToolCall',
      (input, target) =>
        services.conversationService.resumeToolCall({
          actor: context.var.currentUser,
          input,
          execution: execution(context, input, target),
          translate: identityTranslate,
          getHeader: (name) => context.req.header(name),
        }),
    ),
  );

  app.post('/aiConversations:resumeStream', async (context) =>
    createConversationSSE(
      context,
      'aiConversations:resumeStream',
      (input, target) =>
        services.conversationService.resumeStream({
          actorId: context.var.currentUser.id,
          input: { sessionId: requiredString(input.sessionId, 'sessionId') },
          execution: execution(context, input, target),
        }),
    ),
  );

  app.post('/aiConversations:abort', async (context) => {
    const input = await jsonObject(context);
    const result = await services.conversationService.abort({
      actorId: context.var.currentUser.id,
      input: { sessionId: requiredString(input.sessionId, 'sessionId') },
    });
    return context.json(result as never);
  });

  app.post('/aiConversations:updateToolArgs', async (context) => {
    const result = await services.conversationService.updateToolArgs({
      actorId: context.var.currentUser.id,
      input: await jsonObject(context),
    });
    return context.json(result as never);
  });
}

function createConversationSSE(
  context: HonoContext,
  action: string,
  handler: (
    input: Record<string, any>,
    target: ConversationStreamTarget,
  ) => unknown | Promise<unknown>,
): Response {
  return createAISSEStreamResponse(context, action, async (target) =>
    handler(await jsonObject(context), target),
  );
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
  context: HonoContext,
  input: Record<string, any>,
  streamTarget?: ConversationStreamTarget,
): ConversationExecution {
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
    abortSignal: context.req.raw.signal,
    timezone:
      typeof input.timezone === 'string'
        ? input.timezone
        : context.req.header('x-timezone'),
  };
}
